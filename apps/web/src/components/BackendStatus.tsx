"use client";

import { useEffect, useState } from "react";

type BackendStatusState =
  | { state: "loading" }
  | { state: "online" }
  | { state: "offline"; message: string };

export default function BackendStatus() {
  const [status, setStatus] = useState<BackendStatusState>({ state: "loading" });

  useEffect(() => {
    const backendUrl =
      process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000";

    const controller = new AbortController();

    async function checkBackend() {
      try {
        const response = await fetch(`${backendUrl}/health`, {
          signal: controller.signal,
          cache: "no-store",
        });

        if (!response.ok) {
          setStatus({
            state: "offline",
            message: `HTTP ${response.status}`,
          });
          return;
        }

        const data = (await response.json()) as { status?: string };
        if (data.status === "ok") {
          setStatus({ state: "online" });
        } else {
          setStatus({
            state: "offline",
            message: "Unexpected response",
          });
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        setStatus({ state: "offline", message });
      }
    }

    checkBackend();

    return () => controller.abort();
  }, []);

  return (
    <div className="rounded-xl border p-4">
      <div className="text-sm font-semibold">Backend Status</div>
      <div className="mt-2 text-sm">
        {status.state === "loading" && "Checking..."}
        {status.state === "online" && "✅ Online (health check passed)"}
        {status.state === "offline" && `❌ Offline (${status.message})`}
      </div>
      <div className="mt-2 text-xs text-gray-500">
        Uses NEXT_PUBLIC_BACKEND_URL (see .env.local.example)
      </div>
    </div>
  );
}