"use client";

import { useRef, useState } from "react";
import {
  computeNextState,
  createInitialSessionModel,
  SessionModel,
} from "@/lib/sessionState";

export default function LiveSessionPanel() {
  const [model, setModel] = useState<SessionModel>(createInitialSessionModel());
  const [isRecording, setIsRecording] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);

  async function requestMicrophone() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;

      setModel((prev) => {
        const next = { ...prev, micGranted: true, error: undefined };
        return { ...next, state: computeNextState(next) };
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Mic permission failed";
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
    } catch (error) {
      const message = error instanceof Error ? error.message : "Camera permission failed";
      setModel((prev) => ({ ...prev, error: { message }, state: "ERROR" }));
    }
  }

  function stopAllStreams() {
    cameraStreamRef.current?.getTracks().forEach((t) => t.stop());
    micStreamRef.current?.getTracks().forEach((t) => t.stop());
    cameraStreamRef.current = null;
    micStreamRef.current = null;
    setIsRecording(false);
    setModel(createInitialSessionModel());
  }

  function startRecording() {
    if (!micStreamRef.current) return;
    setIsRecording(true);
    setModel((prev) => ({ ...prev, state: "RECORDING" }));
  }

  function stopRecording() {
    setIsRecording(false);
    setModel((prev) => {
      const next = { ...prev };
      return { ...next, state: computeNextState(next) };
    });
  }

  const stateLabel = (() => {
    if (model.error) return `ERROR: ${model.error.message}`;
    return model.state;
  })();

  return (
    <div className="rounded-xl border p-4">
      <div className="text-sm font-semibold">Live Session</div>
      <div className="mt-2 text-sm">
        <span className="font-medium">State:</span> {stateLabel}
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
        <div className="mt-2 text-xs text-gray-500">
          Camera preview (local).
        </div>
      </div>

      <div className="mt-4">
        <button
          className="rounded-lg bg-black px-4 py-2 text-sm text-white disabled:opacity-50"
          disabled={!model.micGranted}
          onMouseDown={startRecording}
          onMouseUp={stopRecording}
          onTouchStart={startRecording}
          onTouchEnd={stopRecording}
        >
          {isRecording ? "Recording..." : "Push to Talk"}
        </button>

        <div className="mt-2 text-xs text-gray-500">
          This is local-only for now. Next step: stream audio/video to backend.
        </div>
      </div>
    </div>
  );
}