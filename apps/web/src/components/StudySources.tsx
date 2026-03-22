"use client";

import { ChangeEvent, FormEvent, useCallback, useEffect, useState } from "react";

type StudySourceSummary = {
    id: string;
    title: string;
    source_type: string;
    content: string;
    created_at: string;
    updated_at: string;
};

type StudySourceChunk = {
    id?: string;
    chunk_index: number;
    text: string;
};

type StudySourceDetail = {
    id: string;
    title: string;
    source_type: string;
    content: string;
    created_at: string;
    updated_at: string;
    chunks: StudySourceChunk[];
};

const backendUrl =
    process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000";

function getBaseFileName(fileName: string): string {
    const trimmed = fileName.trim();
    if (!trimmed) {
        return "";
    }

    const lastDotIndex = trimmed.lastIndexOf(".");
    if (lastDotIndex <= 0) {
        return trimmed;
    }

    return trimmed.slice(0, lastDotIndex);
}

function isSupportedStudyFile(file: File): boolean {
    const lowerName = file.name.toLowerCase();
    return lowerName.endsWith(".txt") || lowerName.endsWith(".md");
}

export default function StudySources() {
    const [sources, setSources] = useState<StudySourceSummary[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [title, setTitle] = useState("");
    const [content, setContent] = useState("");
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);

    const [importingFile, setImportingFile] = useState(false);
    const [importError, setImportError] = useState<string | null>(null);
    const [importedFileName, setImportedFileName] = useState<string | null>(null);

    const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
    const [selectedSource, setSelectedSource] = useState<StudySourceDetail | null>(
        null
    );
    const [detailLoading, setDetailLoading] = useState(false);
    const [detailError, setDetailError] = useState<string | null>(null);

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

    async function handleFileImport(event: ChangeEvent<HTMLInputElement>) {
        const file = event.target.files?.[0];

        if (!file) {
            return;
        }

        setImportingFile(true);
        setImportError(null);

        try {
            if (!isSupportedStudyFile(file)) {
                throw new Error("Only .txt and .md files are supported right now.");
            }

            const fileText = await file.text();
            const cleanFileText = fileText.trim();

            if (!cleanFileText) {
                throw new Error("The selected file is empty.");
            }

            setContent(fileText);

            if (!title.trim()) {
                setTitle(getBaseFileName(file.name));
            }

            setImportedFileName(file.name);
            setSaveError(null);
        } catch (err) {
            setImportError(
                err instanceof Error ? err.message : "Failed to import file"
            );
        } finally {
            setImportingFile(false);
            event.target.value = "";
        }
    }

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
                    source_type: importedFileName ? "local_file" : "pasted_text",
                    content: cleanContent,
                    max_chars: 800,
                }),
            });

            if (!res.ok) {
                throw new Error(`HTTP ${res.status}`);
            }

            setTitle("");
            setContent("");
            setImportedFileName(null);
            await fetchSources();
        } catch (err) {
            setSaveError(
                err instanceof Error ? err.message : "Failed to save study source"
            );
        } finally {
            setSaving(false);
        }
    }

    async function handleSelectSource(sourceId: string) {
        setSelectedSourceId(sourceId);
        setDetailLoading(true);
        setDetailError(null);

        try {
            const res = await fetch(`${backendUrl}/api/study-sources/${sourceId}`, {
                cache: "no-store",
            });

            if (!res.ok) {
                throw new Error(`HTTP ${res.status}`);
            }

            const data: StudySourceDetail = await res.json();
            setSelectedSource(data);
        } catch (err) {
            setSelectedSource(null);
            setDetailError(
                err instanceof Error ? err.message : "Failed to load study source detail"
            );
        } finally {
            setDetailLoading(false);
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

                <div className="space-y-2">
                    <label
                        htmlFor="study-source-file-input"
                        className="block text-sm font-medium"
                    >
                        Import local text file
                    </label>

                    <input
                        id="study-source-file-input"
                        type="file"
                        accept=".txt,.md,text/plain,text/markdown"
                        onChange={handleFileImport}
                        disabled={importingFile || saving}
                        className="block w-full text-sm"
                        data-testid="study-source-file-input"
                    />

                    <p className="text-xs text-gray-500">
                        Supports .txt and .md for now. The file is read locally in your
                        browser, then you can review or edit it before saving.
                    </p>

                    {importedFileName && (
                        <p
                            className="text-xs text-gray-500"
                            data-testid="study-source-imported-file"
                        >
                            Imported file: {importedFileName}
                        </p>
                    )}

                    {importError && (
                        <p
                            className="text-sm text-red-500"
                            data-testid="study-source-import-error"
                        >
                            {importError}
                        </p>
                    )}
                </div>

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
                        disabled={saving || importingFile}
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
                        <button
                            key={source.id}
                            type="button"
                            onClick={() => handleSelectSource(source.id)}
                            className={`mt-1 block w-full rounded-lg border p-2 text-left text-sm ${selectedSourceId === source.id ? "border-blue-500" : ""
                                }`}
                            data-testid="study-source-item"
                        >
                            <div className="font-medium">{source.title}</div>
                            <div className="text-xs text-gray-500">
                                {source.source_type} • {formatDate(source.updated_at)}
                            </div>
                        </button>
                    ))}
            </div>

            <div className="mt-4">
                {detailLoading && (
                    <p className="text-sm text-gray-400">Loading study source detail...</p>
                )}

                {detailError && (
                    <p
                        className="text-sm text-red-500"
                        data-testid="study-source-detail-error"
                    >
                        {detailError}
                    </p>
                )}

                {!detailLoading && selectedSource && (
                    <div
                        className="rounded-lg border p-3 text-sm"
                        data-testid="study-source-detail"
                    >
                        <div className="font-semibold">{selectedSource.title}</div>
                        <div className="mt-1 text-xs text-gray-500">
                            {selectedSource.chunks.length} chunks
                        </div>
                        <div className="mt-3 whitespace-pre-wrap">
                            {selectedSource.content}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}