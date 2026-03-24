"use client";

import { useCallback, useEffect, useState } from "react";

type SessionSummary = {
    id: string;
    title: string;
    created_at: string;
    updated_at: string;
};

const backendUrl =
    process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000";

type Props = {
    refreshKey?: number;
    activeSessionId?: string | null;
    onSelect: (sessionId: string) => void;
    onNewChat: () => void;
};

export default function StudyVault({ refreshKey, activeSessionId, onSelect, onNewChat }: Props) {
    const [sessions, setSessions] = useState<SessionSummary[]>([]);
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

    useEffect(() => {
        if (refreshKey === undefined || refreshKey === 0) return;
        fetchSessions();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [refreshKey]);

    return (
        <div className="wl-sidebar-section" data-testid="study-vault">
            <div className="wl-sidebar-section-header">
                <div className="wl-sidebar-section-title">Your Chats</div>
                <button
                    type="button"
                    className="wl-sidebar-new-btn"
                    onClick={onNewChat}
                    title="New chat"
                    data-testid="new-chat-button"
                >
                    +
                </button>
            </div>

            <div className="wl-sidebar-list">
                {loading && (
                    <div className="wl-sidebar-empty">Loading…</div>
                )}

                {error && (
                    <div className="wl-sidebar-error" data-testid="vault-error">
                        {error}
                    </div>
                )}

                {!loading && !error && sessions.length === 0 && (
                    <div className="wl-sidebar-empty" data-testid="vault-empty">
                        No saved sessions yet
                    </div>
                )}

                {sessions.map((s) => (
                    <button
                        key={s.id}
                        type="button"
                        className={`wl-sidebar-item ${activeSessionId === s.id ? "wl-sidebar-item-active" : ""}`}
                        onClick={() => onSelect(s.id)}
                        data-testid="session-item"
                    >
                        {s.title}
                    </button>
                ))}
            </div>
        </div>
    );
}
