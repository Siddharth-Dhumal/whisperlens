"use client";

import { useEffect, useRef, useState } from "react";
import { createAudioRecorder, type AudioRecorder } from "@/lib/audioRecorder";
import Image from "next/image";
import {
  createLiveSocketClient,
  type LiveSocketClient,
  type LiveSocketMessage,
  type LiveSocketStatus,
  type SourceInfo,
} from "@/lib/liveSocket";
import {
  computeNextState,
  createInitialSessionModel,
  type SessionModel,
} from "@/lib/sessionState";

type ChatEntry = {
  role: "user" | "assistant";
  text: string;
  sourceInfo?: SourceInfo;
};

type Props = {
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

export default function LiveSessionPanel({ onTurnSaved }: Props) {
  const [model, setModel] = useState<SessionModel>(createInitialSessionModel());
  const [isRecording, setIsRecording] = useState(false);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [socketStatus, setSocketStatus] =
    useState<LiveSocketStatus>("DISCONNECTED");

  const [chatHistory, setChatHistory] = useState<ChatEntry[]>([]);
  const [streamingText, setStreamingText] = useState("");
  const [textInput, setTextInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [snapshotData, setSnapshotData] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);

  const backendUrl =
    process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000";

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<AudioRecorder | null>(null);
  const socketRef = useRef<LiveSocketClient | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const onTurnSavedRef = useRef(onTurnSaved);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  onTurnSavedRef.current = onTurnSaved;

  useEffect(() => {
    chatEndRef.current?.scrollIntoView?.({ behavior: "smooth" });
  }, [chatHistory, streamingText]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }

    textarea.style.height = "0px";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 160)}px`;
  }, [textInput]);

  useEffect(() => {
    if (!isCameraOpen) {
      return;
    }

    const video = videoRef.current;
    const stream = cameraStreamRef.current;

    if (!video || !stream) {
      return;
    }

    video.srcObject = stream;

    const playPromise = video.play();
    if (playPromise !== undefined) {
      playPromise.catch(() => {
        // Ignore autoplay/play race issues
      });
    }
  }, [isCameraOpen]);

  useEffect(() => {
    const socketUrl =
      process.env.NEXT_PUBLIC_BACKEND_WS_URL ?? "ws://localhost:8000/ws/live";

    socketRef.current = createLiveSocketClient({
      socketUrl,
      onStatusChange: (status) => {
        setSocketStatus(status);
        if (status === "CONNECTED" && sessionIdRef.current) {
          socketRef.current?.sendControlMessage({
            type: "session_bind",
            session_id: sessionIdRef.current,
          });
        }
      },
      onMessage: (message: LiveSocketMessage) => {
        if (message.type === "transcript") {
          setStreamingText((prev) => prev + message.text);
        } else if (message.type === "turn_complete") {
          setChatHistory((prev) => [
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
          setChatHistory((prev) => [...prev, { role: "user", text: message.text }]);
        } else if (message.type === "session_created") {
          setSessionId(message.session_id);
          sessionIdRef.current = message.session_id;
        } else if (message.type === "error") {
          setModel((prev) => ({
            ...prev,
            error: { message: message.message },
            state: "ERROR",
          }));
          setStreamingText("");
          setIsSending(false);
          setIsRecording(false);
        }
      },
      onError: (message) => {
        setModel((prev) => ({ ...prev, error: { message }, state: "ERROR" }));
        setIsSending(false);
        setIsRecording(false);
      },
    });

    return () => {
      cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
      micStreamRef.current?.getTracks().forEach((track) => track.stop());
      recorderRef.current?.stop();
      socketRef.current?.disconnect();
    };
  }, []);

  async function requestMicrophone(): Promise<boolean> {
    if (micStreamRef.current && recorderRef.current) {
      return true;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;

      recorderRef.current = createAudioRecorder(stream, (chunk) => {
        socketRef.current?.sendAudioChunk(chunk);
      });

      setModel((prev) => {
        const next = { ...prev, micGranted: true, error: undefined };
        return { ...next, state: computeNextState(next) };
      });

      return true;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Mic permission failed";
      setModel((prev) => ({ ...prev, error: { message }, state: "ERROR" }));
      return false;
    }
  }

  async function requestCamera(): Promise<boolean> {
    if (cameraStreamRef.current) {
      return true;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
        },
      });

      cameraStreamRef.current = stream;

      setModel((prev) => {
        const next = { ...prev, cameraGranted: true, error: undefined };
        return { ...next, state: computeNextState(next) };
      });

      fetch(`${backendUrl}/api/vision/warm`, { method: "POST" }).catch(() => { });
      return true;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Camera permission failed";
      setModel((prev) => ({ ...prev, error: { message }, state: "ERROR" }));
      return false;
    }
  }

  function stopAllStreams() {
    recorderRef.current?.stop();
    socketRef.current?.disconnect();

    cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
    micStreamRef.current?.getTracks().forEach((track) => track.stop());

    cameraStreamRef.current = null;
    micStreamRef.current = null;
    recorderRef.current = null;

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setIsRecording(false);
    setIsCameraOpen(false);
    setSocketStatus("DISCONNECTED");
    setChatHistory([]);
    setStreamingText("");
    setTextInput("");
    setIsSending(false);
    setModel(createInitialSessionModel());
    setSnapshotData(null);
    setSessionId(null);
    sessionIdRef.current = null;
  }

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

  async function startRecording(): Promise<boolean> {
    if (!recorderRef.current) {
      return false;
    }

    try {
      await recorderRef.current.start();
      socketRef.current?.sendControlMessage({ type: "audio_start" });
      setIsRecording(true);
      setModel((prev) => ({ ...prev, error: undefined, state: "RECORDING" }));
      return true;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Recording failed to start";
      setIsRecording(false);
      setModel((prev) => ({ ...prev, error: { message }, state: "ERROR" }));
      return false;
    }
  }

  function stopRecording() {
    if (!isRecording) {
      return;
    }

    recorderRef.current?.stop();
    setIsRecording(false);
    setIsSending(true);

    socketRef.current?.sendControlMessage({ type: "audio_end" });

    setModel((prev) => {
      const next = { ...prev, error: undefined };
      return { ...next, state: computeNextState(next) };
    });
  }

  async function handleVoiceToggle() {
    if (isRecording) {
      stopRecording();
      return;
    }

    if (socketStatus !== "CONNECTED" || isSending) {
      return;
    }

    const ready = await requestMicrophone();
    if (!ready) {
      return;
    }

    await startRecording();
  }

  async function handleCameraToggle() {
    if (isCameraOpen) {
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
      setIsCameraOpen(false);
      return;
    }

    const ready = await requestCamera();
    if (!ready) {
      return;
    }

    setIsCameraOpen(true);
  }

  function captureSnapshot() {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    const MAX_WIDTH = 1024;
    let w = video.videoWidth;
    let h = video.videoHeight;

    if (!w || !h) {
      return;
    }

    if (w > MAX_WIDTH) {
      h = Math.round(h * (MAX_WIDTH / w));
      w = MAX_WIDTH;
    }

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }

    ctx.drawImage(video, 0, 0, w, h);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.75);
    setSnapshotData(dataUrl.split(",")[1]);
    setIsCameraOpen(false);
  }

  async function handleSendVision(question: string) {
    if (!snapshotData) {
      return;
    }

    setIsSending(true);
    setModel((prev) => ({
      ...prev,
      error: undefined,
      state: computeNextState({ ...prev, error: undefined }),
    }));

    const userText = question || "Snapshot";
    setChatHistory((prev) => [...prev, { role: "user", text: `📷 ${userText}` }]);
    setSnapshotData(null);
    setTextInput("");

    try {
      const res = await fetch(`${backendUrl}/api/vision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image: snapshotData,
          question: question || undefined,
          session_id: sessionId ?? undefined,
        }),
      });

      if (!res.ok) {
        let detail = `HTTP ${res.status}`;
        try {
          const body = await res.json();
          if (body.detail) {
            detail = body.detail;
          }
        } catch { }
        throw new Error(detail);
      }

      const data = await res.json();

      setChatHistory((prev) => [...prev, { role: "assistant", text: data.answer }]);
      setModel((prev) => ({
        ...prev,
        error: undefined,
        state: computeNextState({ ...prev, error: undefined }),
      }));

      onTurnSavedRef.current?.();

      if (data.session_id) {
        setSessionId(data.session_id);
        sessionIdRef.current = data.session_id;

        if (socketStatus === "CONNECTED") {
          socketRef.current?.sendControlMessage({
            type: "session_bind",
            session_id: data.session_id,
          });
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Vision request failed";
      setModel((prev) => ({ ...prev, error: { message: msg }, state: "ERROR" }));
    } finally {
      setIsSending(false);
    }
  }

  function handleSendText() {
    const trimmed = textInput.trim();
    if (!trimmed) {
      return;
    }

    if (snapshotData) {
      handleSendVision(trimmed);
      return;
    }

    if (socketStatus !== "CONNECTED") {
      return;
    }

    setChatHistory((prev) => [...prev, { role: "user", text: trimmed }]);
    socketRef.current?.sendTextMessage(trimmed);
    setTextInput("");
    setIsSending(true);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();

      if (snapshotData && !textInput.trim()) {
        handleSendVision("");
        return;
      }

      handleSendText();
    }
  }

  const hasConversation = chatHistory.length > 0 || Boolean(streamingText);
  const socketConnected = socketStatus === "CONNECTED";
  const canSend =
    snapshotData !== null
      ? !isSending
      : socketConnected && Boolean(textInput.trim()) && !isSending;

  return (
    <section className="wl-live-shell">
      {/* ── Top nav bar ── */}
      <div className="wl-live-topbar">
        <div className="wl-live-topbar-left" />

        <button
          type="button"
          className={`wl-live-nav-socket ${socketConnected ? "wl-live-nav-socket-connected" : ""}`}
          onClick={handleSocketToggle}
          aria-pressed={socketConnected}
          data-testid="socket-toggle"
          title={socketConnected ? "Disconnect" : "Connect"}
        >
          <span className="wl-live-nav-socket-dot" />
          {socketConnected ? "Connected" : "Connect"}
        </button>

        <button
          type="button"
          className="wl-live-reset"
          onClick={stopAllStreams}
          title="Reset session"
        >
          Reset
        </button>
      </div>

      {/* ── Scrollable chat area ── */}
      <div className="wl-live-thread-shell">
        {model.error && (
          <div className="wl-live-error" data-testid="error-message">
            {model.error.message}
          </div>
        )}

        <div data-testid="chat-log" className="wl-live-log">
          {!hasConversation && (
            <div className="wl-live-empty-state">
              <div className="wl-live-empty-brand">WhisperLens</div>
            </div>
          )}

          {chatHistory.map((entry, index) => {
            const sourceHint =
              entry.role === "assistant" ? buildSourceHint(entry.sourceInfo) : null;

            return (
              <div
                key={index}
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
            <div
              data-testid="streaming-text"
              className="wl-live-message wl-live-message-assistant"
            >
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

      {/* ── Fixed composer dock ── */}
      <div className="wl-live-composer-dock">
        {isCameraOpen && (
          <div className="wl-live-camera-tray">
            <div className="wl-live-camera-frame">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="wl-live-video"
              />
            </div>

            <div className="wl-live-camera-actions">
              <button
                className="wl-live-secondary-button"
                onClick={captureSnapshot}
                disabled={!model.cameraGranted}
                data-testid="capture-button"
              >
                Capture
              </button>
              <button
                className="wl-live-secondary-button"
                onClick={() => {
                  if (videoRef.current) {
                    videoRef.current.srcObject = null;
                  }
                  setIsCameraOpen(false);
                }}
              >
                Close
              </button>
            </div>
          </div>
        )}

        {snapshotData && (
          <div className="wl-live-attachment" data-testid="snapshot-preview">
            <Image
              src={`data:image/jpeg;base64,${snapshotData}`}
              alt="Snapshot"
              className="wl-live-attachment-thumb"
              width={320}
              height={180}
              unoptimized
            />

            <div className="wl-live-attachment-copy">
              Snapshot attached
            </div>

            <button
              className="wl-live-clear-button"
              onClick={() => setSnapshotData(null)}
              data-testid="clear-snapshot"
            >
              ✕
            </button>
          </div>
        )}

        <div className="wl-live-composer">
          {/* Camera icon button */}
          <button
            type="button"
            className={`wl-live-composer-icon-btn ${isCameraOpen ? "wl-live-composer-icon-btn-active" : ""}`}
            onClick={handleCameraToggle}
            aria-pressed={isCameraOpen}
            data-testid="camera-toggle"
            title="Camera"
            disabled={isSending}
          >
            📷
          </button>

          <textarea
            ref={textareaRef}
            data-testid="text-input"
            className="wl-live-textarea"
            placeholder="Message WhisperLens"
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={(!snapshotData && socketStatus !== "CONNECTED") || isSending}
            rows={1}
          />

          {/* Voice icon button */}
          <button
            type="button"
            className={`wl-live-composer-icon-btn ${isRecording ? "wl-live-composer-icon-btn-active wl-live-composer-icon-btn-recording" : ""}`}
            onClick={handleVoiceToggle}
            aria-pressed={isRecording}
            data-testid="voice-toggle"
            title={isRecording ? "Stop recording" : "Voice input"}
            disabled={socketStatus !== "CONNECTED" || isSending}
          >
            🎙
          </button>

          {/* Send button */}
          <button
            data-testid="send-button"
            className="wl-live-send-button"
            onClick={
              snapshotData && !textInput.trim()
                ? () => handleSendVision("")
                : handleSendText
            }
            disabled={!canSend}
            title="Send"
          >
            ↑
          </button>
        </div>
      </div>
    </section >
  );
}