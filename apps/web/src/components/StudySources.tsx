"use client";

import { useCallback, useEffect, useState } from "react";

type StudySourceSummary = {
    id: string;
    title: string;
    source_type: string;
    content: string;
    created_at: string;
    updated_at: string;
};

const backendUrl =
    process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000";

type Props = {
    refreshKey?: number;
    activeSourceId?: string | null;
    onSelect: (sourceId: string) => void;
    onNewSource: () => void;
};

export default function StudySources({
    refreshKey,
    activeSourceId,
    onSelect,
    onNewSource,
}: Props) {
    const [sources, setSources] = useState<StudySourceSummary[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchSources = useCallback(async () => {
        setLoading(true);
        setError(null);

        try {
            const res = await fetch(`${backendUrl}/api/study-sources`, {
                cache: "no-store",
            });

            if (!res.ok) {
                throw new Error(`HTTP ${res.status}`);
            }

            const data: StudySourceSummary[] = await res.json();
            setSources(data);
        } catch (err) {
            setError(
                err instanceof Error ? err.message : "Failed to load study sources"
            );
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchSources();
    }, [fetchSources]);

    useEffect(() => {
        if (refreshKey === undefined || refreshKey === 0) {
            return;
        }

        fetchSources();
    }, [refreshKey, fetchSources]);

    return (
        <div className="wl-sidebar-section" data-testid="study-sources">
            <div className="wl-sidebar-section-header">
                <div className="wl-sidebar-section-title">Your Sources</div>
                <button
                    type="button"
                    className="wl-sidebar-new-btn"
                    onClick={onNewSource}
                    title="Add source"
                    data-testid="new-source-button"
                >
                    +
                </button>
            </div>

            <div className="wl-sidebar-list">
                {loading && <div className="wl-sidebar-empty">Loading…</div>}

                {error && (
                    <div className="wl-sidebar-error" data-testid="study-sources-error">
                        {error}
                    </div>
                )}

                {!loading && !error && sources.length === 0 && (
                    <div className="wl-sidebar-empty" data-testid="study-sources-empty">
                        No study sources yet
                    </div>
                )}

                {!loading &&
                    !error &&
                    sources.map((source) => (
                        <button
                            key={source.id}
                            type="button"
                            className={`wl-sidebar-item ${activeSourceId === source.id ? "wl-sidebar-item-active" : ""}`}
                            onClick={() => onSelect(source.id)}
                            data-testid="study-source-item"
                        >
                            {source.title}
                        </button>
                    ))}
            </div>
        </div>
    );
}