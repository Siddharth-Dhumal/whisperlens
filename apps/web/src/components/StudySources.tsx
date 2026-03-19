"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

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

export default function StudySources() {
    const [sources, setSources] = useState<StudySourceSummary[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [title, setTitle] = useState("");
    const [content, setContent] = useState("");
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);

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

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();

        const cleanTitle = title.trim();
        const cleanContent = content.trim();

        if (!cleanTitle || !cleanContent) {
            setSaveError("Title and pasted text are required.");
            return;
        }

        setSaving(true);
        setSaveError(null);

        try {
            const res = await fetch(`${backendUrl}/api/study-sources`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    title: cleanTitle,
                    source_type: "pasted_text",
                    content: cleanContent,
                    max_chars: 800,
                }),
            });

            if (!res.ok) {
                throw new Error(`HTTP ${res.status}`);
            }

            setTitle("");
            setContent("");
            await fetchSources();
        } catch (err) {
            setSaveError(
                err instanceof Error ? err.message : "Failed to save study source"
            );
        } finally {
            setSaving(false);
        }
    }

    function formatDate(iso: string) {
        try {
            return new Date(iso).toLocaleString();
        } catch {
            return iso;
        }
    }

    return (
        <div className="rounded-xl border p-4" data-testid="study-sources">
            <div className="flex items-center justify-between">
                <div className="text-sm font-semibold">Study Sources</div>
                <button
                    onClick={fetchSources}
                    className="text-xs text-blue-600 hover:underline"
                    data-testid="study-sources-refresh"
                    type="button"
                >
                    Refresh
                </button>
            </div>

            <form onSubmit={handleSubmit} className="mt-4 space-y-3">
                <input
                    type="text"
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    placeholder="Source title"
                    className="w-full rounded-lg border bg-transparent px-3 py-2 text-sm"
                    data-testid="study-source-title-input"
                />

                <textarea
                    value={content}
                    onChange={(event) => setContent(event.target.value)}
                    placeholder="Paste your study text here"
                    className="min-h-32 w-full rounded-lg border bg-transparent px-3 py-2 text-sm"
                    data-testid="study-source-content-input"
                />

                <div className="flex items-center gap-3">
                    <button
                        type="submit"
                        disabled={saving}
                        className="rounded-lg border px-3 py-2 text-sm"
                        data-testid="study-source-save-button"
                    >
                        {saving ? "Saving..." : "Save source"}
                    </button>

                    {saveError && (
                        <p
                            className="text-sm text-red-500"
                            data-testid="study-source-save-error"
                        >
                            {saveError}
                        </p>
                    )}
                </div>
            </form>

            <div className="mt-4">
                {loading && (
                    <p className="text-sm text-gray-400">Loading study sources...</p>
                )}

                {error && (
                    <p className="text-sm text-red-500" data-testid="study-sources-error">
                        {error}
                    </p>
                )}

                {!loading && !error && sources.length === 0 && (
                    <p
                        className="text-sm text-gray-400"
                        data-testid="study-sources-empty"
                    >
                        No study sources yet. You will add them in the next step.
                    </p>
                )}

                {!loading &&
                    !error &&
                    sources.map((source) => (
                        <div
                            key={source.id}
                            className="mt-1 rounded-lg border p-2 text-sm"
                            data-testid="study-source-item"
                        >
                            <div className="font-medium">{source.title}</div>
                            <div className="text-xs text-gray-500">
                                {source.source_type} • {formatDate(source.updated_at)}
                            </div>
                        </div>
                    ))}
            </div>
        </div>
    );
}