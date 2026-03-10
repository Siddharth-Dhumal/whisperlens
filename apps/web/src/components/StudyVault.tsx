"use client";

import { useCallback, useEffect, useState } from "react";

type SessionSummary = {
    id: string;
    title: string;
    created_at: string;
    updated_at: string;
};

type Message = {
    id: string;
    role: "user" | "assistant";
    text: string;
    source: string;
    created_at: string;
};

type SessionDetail = SessionSummary & {
    messages: Message[];
};

const backendUrl =
    process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000";

type Props = {
    refreshKey?: number;
};

export default function StudyVault({ refreshKey }: Props) {
    const [sessions, setSessions] = useState<SessionSummary[]>([]);
    const [selectedSession, setSelectedSession] = useState<SessionDetail | null>(
        null
    );
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchSessions = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`${backendUrl}/api/sessions`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data: SessionSummary[] = await res.json();
            setSessions(data);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to load sessions");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchSessions();
    }, [fetchSessions]);

    // Re-fetch whenever the parent signals a new turn was saved
    useEffect(() => {
        if (refreshKey === undefined || refreshKey === 0) return;
        if (selectedSession) {
            // A session is open: re-fetch its detail so new messages appear
            openSession(selectedSession.id);
        } else {
            fetchSessions();
        }
        // openSession is defined inline; selectedSession changes are intentionally excluded
        // so this effect only fires on refreshKey changes, not on every detail load
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [refreshKey]);

    async function openSession(id: string) {
        setError(null);
        try {
            const res = await fetch(`${backendUrl}/api/sessions/${id}`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data: SessionDetail = await res.json();
            setSelectedSession(data);
        } catch (err) {
            setError(
                err instanceof Error ? err.message : "Failed to load session"
            );
        }
    }

    function closeSession() {
        setSelectedSession(null);
        fetchSessions(); // Refresh list in case new messages were added
    }

    function formatDate(iso: string) {
        try {
            return new Date(iso).toLocaleString();
        } catch {
            return iso;
        }
    }

    // ── Detail view ──────────────────────────────────────────────
    if (selectedSession) {
        return (
            <div className="rounded-xl border p-4" data-testid="study-vault">
                <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold">
                        {selectedSession.title}
                    </div>
                    <button
                        onClick={closeSession}
                        className="text-xs text-blue-600 hover:underline"
                        data-testid="back-button"
                    >
                        ← Back to sessions
                    </button>
                </div>
                <div className="mt-1 text-xs text-gray-500">
                    {formatDate(selectedSession.created_at)}
                </div>

                <div className="mt-3 space-y-2" data-testid="session-messages">
                    {selectedSession.messages.map((msg) => (
                        <div
                            key={msg.id}
                            className={`rounded-lg p-2 text-sm ${msg.role === "user"
                                ? "bg-blue-50 text-blue-900"
                                : "bg-gray-50 text-gray-900"
                                }`}
                        >
                            <span className="font-medium">
                                {msg.role === "user" ? "You" : "AI"}
                                {msg.role === "user" && msg.source === "voice" && " 🎤"}:
                            </span>{" "}
                            {msg.text}
                        </div>
                    ))}
                    {selectedSession.messages.length === 0 && (
                        <p className="text-sm text-gray-400">No messages in this session.</p>
                    )}
                </div>
            </div>
        );
    }

    // ── List view ────────────────────────────────────────────────
    return (
        <div className="rounded-xl border p-4" data-testid="study-vault">
            <div className="flex items-center justify-between">
                <div className="text-sm font-semibold">Study Vault</div>
                <button
                    onClick={fetchSessions}
                    className="text-xs text-blue-600 hover:underline"
                    data-testid="refresh-button"
                >
                    Refresh
                </button>
            </div>

            <div className="mt-3">
                {loading && (
                    <p className="text-sm text-gray-400">Loading sessions...</p>
                )}
                {error && (
                    <p className="text-sm text-red-500" data-testid="vault-error">
                        {error}
                    </p>
                )}
                {!loading && !error && sessions.length === 0 && (
                    <p className="text-sm text-gray-400" data-testid="vault-empty">
                        No saved sessions yet. Start a chat to create one!
                    </p>
                )}
                {sessions.map((s) => (
                    <button
                        key={s.id}
                        onClick={() => openSession(s.id)}
                        className="mt-1 block w-full rounded-lg border p-2 text-left text-sm hover:bg-gray-50"
                        data-testid="session-item"
                    >
                        <div className="font-medium">{s.title}</div>
                        <div className="text-xs text-gray-500">
                            {formatDate(s.updated_at)}
                        </div>
                    </button>
                ))}
            </div>
        </div>
    );
}
