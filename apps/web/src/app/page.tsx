import BackendStatus from "@/components/BackendStatus";
import LiveSessionPanel from "@/components/LiveSessionPanel";

export default function Home() {
  return (
    <main className="min-h-screen p-8">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-3xl font-bold">WhisperLens</h1>
        <p className="mt-2 text-gray-600">
          Real-time voice + vision study coach (local AI).
        </p>

        <div className="mt-8 grid gap-6">
          <BackendStatus />
          <LiveSessionPanel />

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