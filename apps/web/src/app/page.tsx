import BackendStatus from "@/components/BackendStatus";

export default function Home() {
  return (
    <main className="min-h-screen p-8">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-3xl font-bold">WhisperLens</h1>
        <p className="mt-2 text-gray-600">
          Real-time voice + vision study coach (Gemini Live).
        </p>

        <div className="mt-8 grid gap-6">
          <BackendStatus />

          <div className="rounded-xl border p-4">
            <div className="text-sm font-semibold">Live Session</div>
            <p className="mt-2 text-sm text-gray-600">
              Next step: mic + camera permissions, then stream to the backend.
            </p>
            <button
              className="mt-4 rounded-lg bg-black px-4 py-2 text-sm text-white opacity-50"
              disabled
            >
              Start Session (coming soon)
            </button>
          </div>

          <div className="rounded-xl border p-4">
            <div className="text-sm font-semibold">Study Vault</div>
            <p className="mt-2 text-sm text-gray-600">
              Later: your saved sessions, summaries, and Study Cards.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}