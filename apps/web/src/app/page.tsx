"use client";

import { useState } from "react";
import BackendStatus from "@/components/BackendStatus";
import LiveSessionPanel from "@/components/LiveSessionPanel";
import StudyVault from "@/components/StudyVault";

export default function Home() {
  const [refreshCount, setRefreshCount] = useState(0);

  return (
    <main className="min-h-screen p-8">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-3xl font-bold">WhisperLens</h1>
        <p className="mt-2 text-gray-600">
          Real-time voice + vision study coach (local AI).
        </p>

        <div className="mt-8 grid gap-6">
          <BackendStatus />
          <LiveSessionPanel onTurnSaved={() => setRefreshCount((n) => n + 1)} />
          <StudyVault refreshKey={refreshCount} />
        </div>
      </div>
    </main>
  );
}