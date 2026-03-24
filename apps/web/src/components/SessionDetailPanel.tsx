"use client";

import { useEffect, useRef, useState } from "react";
import { createAudioRecorder, type AudioRecorder } from "@/lib/audioRecorder";
import {
    createLiveSocketClient,
    type LiveSocketClient,
    type LiveSocketMessage,
    type LiveSocketStatus,
    type SourceInfo,
} from "@/lib/liveSocket";

type Message = {
    id: string;
    role: "user" | "assistant";
    text: string;
    source: string;
    created_at: string;
};

type SessionDetail = {
    id: string;
    title: string;
    created_at: string;
    updated_at: string;
    messages: Message[];
};

type ChatEntry = {
    role: "user" | "assistant";
    text: string;
    sourceInfo?: SourceInfo;
};

type Props = {
    sessionId: string;
    onTurnSaved?: () => void;
};

function buildSourceHint(sourceInfo?: SourceInfo): string | null {
    if (!sourceInfo || !sourceInfo.matched || sourceInfo.match_count < 1) {
        return null;
    }

    const firstTitle = sourceInfo.source_titles[0];
    if (!firstTitle) {
        return null;
    }

    if (sourceInfo.match_count === 1) {
        return `Used study source: ${firstTitle}`;
    }

    const additionalSourceCount = Math.max(sourceInfo.source_titles.length - 1, 0);

    if (additionalSourceCount === 0) {
        return `Used ${sourceInfo.match_count} study chunks from ${firstTitle}`;
    }

    const sourceLabel =
        additionalSourceCount === 1 ? "other source" : "other sources";

    return `Used ${sourceInfo.match_count} study chunks from ${firstTitle} and ${additionalSourceCount} ${sourceLabel}`;
}

export default function SessionDetailPanel({ sessionId, onTurnSaved }: Props) {
    const [session, setSession] = useState<SessionDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Live chat state for continuing the session
    const [newMessages, setNewMessages] = useState<ChatEntry[]>([]);
    const [streamingText, setStreamingText] = useState("");
    const [textInput, setTextInput] = useState("");
    const [isSending, setIsSending] = useState(false);
    const [isRecording, setIsRecording] = useState(false);
    const [socketStatus, setSocketStatus] = useState<LiveSocketStatus>("DISCONNECTED");

    const backendUrl =
        process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000";

    const socketRef = useRef<LiveSocketClient | null>(null);
    const micStreamRef = useRef<MediaStream | null>(null);
    const recorderRef = useRef<AudioRecorder | null>(null);
    const chatEndRef = useRef<HTMLDivElement | null>(null);
    const textareaRef = useRef<HTMLTextAreaElement | null>(null);
    const onTurnSavedRef = useRef(onTurnSaved);

    onTurnSavedRef.current = onTurnSaved;

    // Fetch session detail
    useEffect(() => {
        let cancelled = false;

        async function load() {
            setLoading(true);
            setError(null);

            try {
                const res = await fetch(`${backendUrl}/api/sessions/${sessionId}`);
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const data: SessionDetail = await res.json();
                if (!cancelled) {
                    setSession(data);
                }
            } catch (err) {
                if (!cancelled) {
                    setError(err instanceof Error ? err.message : "Failed to load session");
                }
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        }

        load();
        return () => { cancelled = true; };
    }, [sessionId, backendUrl]);

    // Set up WebSocket for continuing conversation
    useEffect(() => {
        const socketUrl =
            process.env.NEXT_PUBLIC_BACKEND_WS_URL ?? "ws://localhost:8000/ws/live";

        socketRef.current = createLiveSocketClient({
            socketUrl,
            onStatusChange: (status) => {
                setSocketStatus(status);
                if (status === "CONNECTED") {
                    socketRef.current?.sendControlMessage({
                        type: "session_bind",
                        session_id: sessionId,
                    });
                }
            },
            onMessage: (message: LiveSocketMessage) => {
                if (message.type === "transcript") {
                    setStreamingText((prev) => prev + message.text);
                } else if (message.type === "turn_complete") {
                    setNewMessages((prev) => [
                        ...prev,
                        {
                            role: "assistant",
                            text: message.text,
                            sourceInfo: message.source_info,
                        },
                    ]);
                    setStreamingText("");
                    setIsSending(false);
                } else if (message.type === "turn_saved") {
                    onTurnSavedRef.current?.();
                } else if (message.type === "stt_result") {
                    setNewMessages((prev) => [...prev, { role: "user", text: message.text }]);
                } else if (message.type === "error") {
                    setError(message.message);
                    setStreamingText("");
                    setIsSending(false);
                    setIsRecording(false);
                }
            },
            onError: (message) => {
                setError(message);
                setIsSending(false);
                setIsRecording(false);
            },
        });

        return () => {
            micStreamRef.current?.getTracks().forEach((track) => track.stop());
            recorderRef.current?.stop();
            socketRef.current?.disconnect();
        };
    }, [sessionId]);

    // Auto-scroll
    useEffect(() => {
        chatEndRef.current?.scrollIntoView?.({ behavior: "smooth" });
    }, [newMessages, streamingText]);

    // Auto-resize textarea
    useEffect(() => {
        const textarea = textareaRef.current;
        if (!textarea) return;
        textarea.style.height = "0px";
        textarea.style.height = `${Math.min(textarea.scrollHeight, 160)}px`;
    }, [textInput]);

    function handleSocketToggle() {
        if (socketStatus === "CONNECTED" || socketStatus === "CONNECTING") {
            recorderRef.current?.stop();
            setIsRecording(false);
            setIsSending(false);
            socketRef.current?.disconnect();
            setSocketStatus("DISCONNECTED");
            return;
        }
        socketRef.current?.connect();
    }

    async function requestMicrophone(): Promise<boolean> {
        if (micStreamRef.current && recorderRef.current) return true;

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            micStreamRef.current = stream;
            recorderRef.current = createAudioRecorder(stream, (chunk) => {
                socketRef.current?.sendAudioChunk(chunk);
            });
            return true;
        } catch {
            setError("Mic permission failed");
            return false;
        }
    }

    async function handleVoiceToggle() {
        if (isRecording) {
            recorderRef.current?.stop();
            setIsRecording(false);
            setIsSending(true);
            socketRef.current?.sendControlMessage({ type: "audio_end" });
            return;
        }

        if (socketStatus !== "CONNECTED" || isSending) return;

        const ready = await requestMicrophone();
        if (!ready) return;

        try {
            await recorderRef.current?.start();
            socketRef.current?.sendControlMessage({ type: "audio_start" });
            setIsRecording(true);
        } catch {
            setError("Recording failed to start");
        }
    }

    function handleSendText() {
        const trimmed = textInput.trim();
        if (!trimmed || socketStatus !== "CONNECTED") return;

        setNewMessages((prev) => [...prev, { role: "user", text: trimmed }]);
        socketRef.current?.sendTextMessage(trimmed);
        setTextInput("");
        setIsSending(true);
    }

    function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSendText();
        }
    }

    const socketConnected = socketStatus === "CONNECTED";
    const canSend = socketConnected && Boolean(textInput.trim()) && !isSending;

    if (loading) {
        return (
            <section className="wl-live-shell">
                <div className="wl-live-topbar" />
                <div className="wl-live-thread-shell">
                    <div className="wl-live-log">
                        <div className="wl-live-empty-state">
                            <div style={{ color: "#555", fontSize: "0.9rem" }}>Loading session…</div>
                        </div>
                    </div>
                </div>
                <div className="wl-live-composer-dock" />
            </section>
        );
    }

    if (!session) {
        return (
            <section className="wl-live-shell">
                <div className="wl-live-topbar" />
                <div className="wl-live-thread-shell">
                    <div className="wl-live-log">
                        <div className="wl-live-empty-state">
                            <div style={{ color: "#f87171", fontSize: "0.9rem" }}>
                                {error || "Session not found"}
                            </div>
                        </div>
                    </div>
                </div>
                <div className="wl-live-composer-dock" />
            </section>
        );
    }

    return (
        <section className="wl-live-shell" data-testid="session-detail-panel">
            {/* Top nav bar */}
            <div className="wl-live-topbar">
                <div className="wl-live-topbar-left" style={{ fontSize: "0.88rem", fontWeight: 600, color: "#ccc" }}>
                    {session.title}
                </div>

                <button
                    type="button"
                    className={`wl-live-nav-socket ${socketConnected ? "wl-live-nav-socket-connected" : ""}`}
                    onClick={handleSocketToggle}
                    data-testid="socket-toggle"
                    title={socketConnected ? "Disconnect" : "Connect to continue chatting"}
                >
                    <span className="wl-live-nav-socket-dot" />
                    {socketConnected ? "Connected" : "Connect"}
                </button>
            </div>

            {/* Scrollable chat area */}
            <div className="wl-live-thread-shell">
                {error && (
                    <div className="wl-live-error" data-testid="error-message">
                        {error}
                    </div>
                )}

                <div data-testid="session-messages" className="wl-live-log">
                    {/* Existing messages from the session */}
                    {session.messages.map((msg) => (
                        <div
                            key={msg.id}
                            className={`wl-live-message ${msg.role === "user" ? "wl-live-message-user" : "wl-live-message-assistant"}`}
                        >
                            <div className="wl-live-message-role">
                                {msg.role === "user" ? "You" : "WhisperLens"}
                                {msg.role === "user" && msg.source === "voice" && " 🎤"}
                            </div>
                            <div className="wl-live-message-text">{msg.text}</div>
                        </div>
                    ))}

                    {session.messages.length === 0 && newMessages.length === 0 && !streamingText && (
                        <div style={{ color: "#555", fontSize: "0.85rem", padding: "20px 0" }}>
                            No messages in this session.
                        </div>
                    )}

                    {/* New messages from continued conversation */}
                    {newMessages.map((entry, i) => {
                        const sourceHint =
                            entry.role === "assistant" ? buildSourceHint(entry.sourceInfo) : null;

                        return (
                            <div
                                key={`new-${i}`}
                                className={`wl-live-message ${entry.role === "user" ? "wl-live-message-user" : "wl-live-message-assistant"}`}
                            >
                                <div className="wl-live-message-role">
                                    {entry.role === "user" ? "You" : "WhisperLens"}
                                </div>
                                <div className="wl-live-message-text">{entry.text}</div>
                                {sourceHint && (
                                    <div className="wl-live-source-hint">{sourceHint}</div>
                                )}
                            </div>
                        );
                    })}

                    {streamingText && (
                        <div data-testid="streaming-text" className="wl-live-message wl-live-message-assistant">
                            <div className="wl-live-message-role">WhisperLens</div>
                            <div className="wl-live-message-text">
                                {streamingText}
                                <span className="wl-live-cursor">▊</span>
                            </div>
                        </div>
                    )}

                    <div ref={chatEndRef} />
                </div>
            </div>

            {/* Fixed composer dock */}
            <div className="wl-live-composer-dock">
                <div className="wl-live-composer">
                    <textarea
                        ref={textareaRef}
                        data-testid="text-input"
                        className="wl-live-textarea"
                        placeholder="Continue this conversation…"
                        value={textInput}
                        onChange={(e) => setTextInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        disabled={socketStatus !== "CONNECTED" || isSending}
                        rows={1}
                    />

                    <button
                        type="button"
                        className={`wl-live-composer-icon-btn ${isRecording ? "wl-live-composer-icon-btn-active wl-live-composer-icon-btn-recording" : ""}`}
                        onClick={handleVoiceToggle}
                        data-testid="voice-toggle"
                        title={isRecording ? "Stop recording" : "Voice input"}
                        disabled={socketStatus !== "CONNECTED" || isSending}
                    >
                        🎙
                    </button>

                    <button
                        data-testid="send-button"
                        className="wl-live-send-button"
                        onClick={handleSendText}
                        disabled={!canSend}
                        title="Send"
                    >
                        ↑
                    </button>
                </div>
            </div>
        </section>
    );
}
