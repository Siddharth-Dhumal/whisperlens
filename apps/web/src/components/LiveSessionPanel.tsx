"use client";

import { useEffect, useRef, useState } from "react";
import { createAudioRecorder, type AudioRecorder } from "@/lib/audioRecorder";
import {
  createLiveSocketClient,
  type LiveSocketClient,
  type LiveSocketMessage,
  type LiveSocketStatus,
} from "@/lib/liveSocket";
import {
  computeNextState,
  createInitialSessionModel,
  type SessionModel,
} from "@/lib/sessionState";

type ChatEntry = {
  role: "user" | "assistant";
  text: string;
};

type Props = {
  onTurnSaved?: () => void;
};

export default function LiveSessionPanel({ onTurnSaved }: Props) {
  const [model, setModel] = useState<SessionModel>(createInitialSessionModel());
  const [isRecording, setIsRecording] = useState(false);
  const [totalBytes, setTotalBytes] = useState(0);
  const [socketStatus, setSocketStatus] =
    useState<LiveSocketStatus>("DISCONNECTED");

  // Chat state
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
  // Stable ref so the socket closure always sees the latest callback
  const onTurnSavedRef = useRef(onTurnSaved);
  onTurnSavedRef.current = onTurnSaved;

  // Auto-scroll chat to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView?.({ behavior: "smooth" });
  }, [chatHistory, streamingText]);

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
            { role: "assistant", text: message.text },
          ]);
          setStreamingText("");
          setIsSending(false);
        } else if (message.type === "turn_saved") {
          onTurnSavedRef.current?.();
        } else if (message.type === "stt_result") {
          setChatHistory((prev) => [
            ...prev,
            { role: "user", text: message.text },
          ]);
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
        }
      },
      onError: (message) => {
        setModel((prev) => ({ ...prev, error: { message }, state: "ERROR" }));
        setIsSending(false);
      },
    });

    return () => {
      cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
      micStreamRef.current?.getTracks().forEach((track) => track.stop());
      recorderRef.current?.stop();
      socketRef.current?.disconnect();
    };
  }, []);

  async function requestMicrophone() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;

      recorderRef.current = createAudioRecorder(stream, (chunk) => {
        setTotalBytes((previousBytes) => previousBytes + chunk.byteLength);
        socketRef.current?.sendAudioChunk(chunk);
      });

      setModel((prev) => {
        const next = { ...prev, micGranted: true, error: undefined };
        return { ...next, state: computeNextState(next) };
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Mic permission failed";
      setModel((prev) => ({ ...prev, error: { message }, state: "ERROR" }));
    }
  }

  async function requestCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      cameraStreamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }

      setModel((prev) => {
        const next = { ...prev, cameraGranted: true, error: undefined };
        return { ...next, state: computeNextState(next) };
      });

      // Pre-warm the vision model so the first request is faster
      fetch(`${backendUrl}/api/vision/warm`, { method: "POST" }).catch(() => {});
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Camera permission failed";
      setModel((prev) => ({ ...prev, error: { message }, state: "ERROR" }));
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
    setTotalBytes(0);
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

  function connectSocket() {
    socketRef.current?.connect();
  }

  function disconnectSocket() {
    socketRef.current?.disconnect();
  }

  async function startRecording() {
    if (!recorderRef.current) {
      return;
    }

    try {
      await recorderRef.current.start();
      socketRef.current?.sendControlMessage({ type: "audio_start" });
      setIsRecording(true);
      setModel((prev) => ({ ...prev, state: "RECORDING" }));
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Recording failed to start";
      setIsRecording(false);
      setModel((prev) => ({ ...prev, error: { message }, state: "ERROR" }));
    }
  }

  function stopRecording() {
    recorderRef.current?.stop();
    setIsRecording(false);
    setIsSending(true);

    socketRef.current?.sendControlMessage({ type: "audio_end" });

    setModel((prev) => {
      const next = { ...prev, error: undefined };
      return { ...next, state: computeNextState(next) };
    });
  }

  function captureSnapshot() {
    const video = videoRef.current;
    if (!video) return;

    // Constrain to max 1024px wide, preserve aspect ratio
    const MAX_WIDTH = 1024;
    let w = video.videoWidth;
    let h = video.videoHeight;
    if (w > MAX_WIDTH) {
      h = Math.round(h * (MAX_WIDTH / w));
      w = MAX_WIDTH;
    }

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, w, h);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.75);
    // Strip the data:image/jpeg;base64, prefix
    setSnapshotData(dataUrl.split(",")[1]);
  }

  async function handleSendVision(question: string) {
    setIsSending(true);
    // Clear any stale error from a previous action
    setModel((prev) => ({ ...prev, error: undefined, state: computeNextState({ ...prev, error: undefined }) }));
    const userText = question || "📷 Snapshot";
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
        // Try to surface the backend's real error message
        let detail = `HTTP ${res.status}`;
        try {
          const body = await res.json();
          if (body.detail) detail = body.detail;
        } catch { /* ignore parse failure */ }
        throw new Error(detail);
      }
      const data = await res.json();
      setChatHistory((prev) => [...prev, { role: "assistant", text: data.answer }]);
      // Clear error state on success
      setModel((prev) => ({ ...prev, error: undefined, state: computeNextState({ ...prev, error: undefined }) }));
      onTurnSavedRef.current?.();
      if (data.session_id) {
        setSessionId(data.session_id);
        sessionIdRef.current = data.session_id;
        // Bind to the WS handler so subsequent typed/voice turns reuse this session
        socketRef.current?.sendControlMessage({
          type: "session_bind",
          session_id: data.session_id,
        });
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
    if (!trimmed) return;

    // If snapshot is attached, use vision endpoint
    if (snapshotData) {
      handleSendVision(trimmed);
      return;
    }

    if (socketStatus !== "CONNECTED") return;
    setChatHistory((prev) => [...prev, { role: "user", text: trimmed }]);
    socketRef.current?.sendTextMessage(trimmed);
    setTextInput("");
    setIsSending(true);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendText();
    }
  }

  const capturedKilobytes = (totalBytes / 1024).toFixed(1);

  return (
    <div className="rounded-xl border p-4">
      <div className="text-sm font-semibold">Live Session</div>

      <div className="mt-2 text-sm">
        <span className="font-medium">State:</span>{" "}
        {model.error ? (
          <span data-testid="error-message">ERROR: {model.error.message}</span>
        ) : (
          model.state
        )}
      </div>

      <div className="mt-1 text-sm">
        <span className="font-medium">Socket:</span> {socketStatus}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          className="rounded-lg border px-3 py-2 text-sm"
          onClick={requestMicrophone}
          disabled={model.micGranted}
        >
          {model.micGranted ? "Mic Granted" : "Enable Microphone"}
        </button>

        <button
          className="rounded-lg border px-3 py-2 text-sm"
          onClick={requestCamera}
          disabled={model.cameraGranted}
        >
          {model.cameraGranted ? "Camera Granted" : "Enable Camera"}
        </button>

        <button
          className="rounded-lg border px-3 py-2 text-sm"
          onClick={connectSocket}
        >
          Connect Socket
        </button>

        <button
          className="rounded-lg border px-3 py-2 text-sm"
          onClick={disconnectSocket}
        >
          Disconnect Socket
        </button>

        <button
          className="rounded-lg border px-3 py-2 text-sm"
          onClick={stopAllStreams}
        >
          Reset
        </button>
      </div>

      <div className="mt-4">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="aspect-video w-full rounded-lg border"
        />
        <div className="mt-2 flex items-center gap-2">
          <span className="text-xs text-gray-500">Camera preview (local).</span>
          <button
            className="rounded border px-2 py-1 text-xs disabled:opacity-50"
            onClick={captureSnapshot}
            disabled={!model.cameraGranted}
            data-testid="capture-button"
          >
            📷 Capture
          </button>
        </div>

        {snapshotData && (
          <div className="mt-2 flex items-center gap-2" data-testid="snapshot-preview">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`data:image/jpeg;base64,${snapshotData}`}
              alt="Snapshot"
              className="h-16 w-16 rounded border object-cover"
            />
            <span className="text-xs text-gray-600">Snapshot attached</span>
            <button
              className="text-xs text-red-500 hover:underline"
              onClick={() => setSnapshotData(null)}
              data-testid="clear-snapshot"
            >
              ✕ Clear
            </button>
          </div>
        )}
      </div>

      <div className="mt-4">
        <button
          className="rounded-lg bg-black px-4 py-2 text-sm text-white disabled:opacity-50"
          disabled={!model.micGranted || socketStatus !== "CONNECTED"}
          onMouseDown={startRecording}
          onMouseUp={stopRecording}
          onMouseLeave={stopRecording}
          onTouchStart={startRecording}
          onTouchEnd={stopRecording}
        >
          {isRecording ? "Recording..." : "Push to Talk"}
        </button>

        <div className="mt-2 text-xs text-gray-500">
          Audio chunks are now sent to the backend websocket.
        </div>
        <div className="mt-1 text-xs text-gray-500">
          Captured audio: {capturedKilobytes} KB
        </div>
      </div>

      {/* Chat transcript */}
      <div className="mt-4">
        <div className="text-sm font-semibold">Chat</div>
        <div
          data-testid="chat-log"
          className="mt-2 max-h-60 overflow-y-auto rounded-lg border p-3 text-sm"
        >
          {chatHistory.length === 0 && !streamingText && (
            <div className="text-gray-400">
              No messages yet. Connect the socket and send a message below.
            </div>
          )}
          {chatHistory.map((entry, i) => (
            <div key={i} className={`mb-2 ${entry.role === "user" ? "text-blue-600" : "text-gray-800"}`}>
              <span className="font-medium">
                {entry.role === "user" ? "You: " : "AI: "}
              </span>
              {entry.text}
            </div>
          ))}
          {streamingText && (
            <div data-testid="streaming-text" className="mb-2 text-gray-800">
              <span className="font-medium">AI: </span>
              {streamingText}
              <span className="animate-pulse">▊</span>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>
      </div>

      {/* Debug text input */}
      <div className="mt-3 flex gap-2">
        <input
          data-testid="text-input"
          type="text"
          className="flex-1 rounded-lg border px-3 py-2 text-sm"
          placeholder="Type a message..."
          value={textInput}
          onChange={(e) => setTextInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={(!snapshotData && socketStatus !== "CONNECTED") || isSending}
        />
        <button
          data-testid="send-button"
          className="rounded-lg bg-black px-4 py-2 text-sm text-white disabled:opacity-50"
          onClick={snapshotData && !textInput.trim() ? () => handleSendVision("") : handleSendText}
          disabled={(!snapshotData && (socketStatus !== "CONNECTED" || !textInput.trim())) || isSending}
        >
          {isSending ? "Sending..." : "Send"}
        </button>
      </div>
    </div>
  );
}