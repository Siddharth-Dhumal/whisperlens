"use client";

import { ChangeEvent, FormEvent, useEffect, useRef, useState } from "react";

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

type StudySourceSearchResult = {
    id: string;
    document_id: string;
    document_title: string;
    chunk_index: number;
    text: string;
    snippet: string;
    score: number;
};

type Props = {
    sourceId: string | null;
    onSourceCreated?: () => void;
};

const backendUrl =
    process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000";

function getBaseFileName(fileName: string): string {
    const trimmed = fileName.trim();
    if (!trimmed) return "";
    const lastDotIndex = trimmed.lastIndexOf(".");
    if (lastDotIndex <= 0) return trimmed;
    return trimmed.slice(0, lastDotIndex);
}

function isSupportedStudyFile(file: File): boolean {
    const lowerName = file.name.toLowerCase();
    return lowerName.endsWith(".txt") || lowerName.endsWith(".md");
}

export default function SourceDetailPanel({
    sourceId,
    onSourceCreated,
}: Props) {
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const textareaRef = useRef<HTMLTextAreaElement | null>(null);
    const onSourceCreatedRef = useRef(onSourceCreated);

    onSourceCreatedRef.current = onSourceCreated;

    // Detail view state
    const [source, setSource] = useState<StudySourceDetail | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Create form state
    const [title, setTitle] = useState("");
    const [content, setContent] = useState("");
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);

    // File import state
    const [importingFile, setImportingFile] = useState(false);
    const [importError, setImportError] = useState<string | null>(null);
    const [importedFileName, setImportedFileName] = useState<string | null>(null);
    const [selectedUploadFile, setSelectedUploadFile] = useState<File | null>(null);
    const [importedContentSnapshot, setImportedContentSnapshot] = useState<string | null>(null);

    // Search state
    const [searchQuery, setSearchQuery] = useState("");
    const [searching, setSearching] = useState(false);
    const [searchError, setSearchError] = useState<string | null>(null);
    const [searchResults, setSearchResults] = useState<StudySourceSearchResult[]>([]);

    // Auto-resize textarea
    useEffect(() => {
        const textarea = textareaRef.current;
        if (!textarea) return;
        textarea.style.height = "0px";
        textarea.style.height = `${Math.min(textarea.scrollHeight, 160)}px`;
    }, [content]);

    // Reset state when sourceId changes
    useEffect(() => {
        setSource(null);
        setError(null);
        setSearchQuery("");
        setSearchError(null);
        setSearchResults([]);
        setLoading(Boolean(sourceId));

        if (!sourceId) {
            setTitle("");
            setContent("");
            setSaveError(null);
            setImportError(null);
            setImportedFileName(null);
            setSelectedUploadFile(null);
            setImportedContentSnapshot(null);
        }
    }, [sourceId]);

    // Fetch source detail when viewing existing source
    useEffect(() => {
        if (!sourceId) {
            setLoading(false);
            return;
        }

        let cancelled = false;

        async function load() {
            setLoading(true);
            setError(null);

            try {
                const res = await fetch(`${backendUrl}/api/study-sources/${sourceId}`, {
                    cache: "no-store",
                });

                if (!res.ok) {
                    throw new Error(`HTTP ${res.status}`);
                }

                const data: StudySourceDetail = await res.json();

                if (!cancelled) {
                    setSource(data);
                    setError(null);
                }
            } catch (err) {
                if (!cancelled) {
                    setSource(null);
                    setError(
                        err instanceof Error ? err.message : "Failed to load source"
                    );
                }
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        }

        load();

        return () => {
            cancelled = true;
        };
    }, [sourceId]);

    async function handleFileImport(event: ChangeEvent<HTMLInputElement>) {
        const file = event.target.files?.[0];
        if (!file) return;

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
            setSelectedUploadFile(file);
            setImportedContentSnapshot(fileText);

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

    async function handleSubmit() {
        const cleanTitle = title.trim();
        const cleanContent = content.trim();

        if (!cleanTitle || !cleanContent) {
            setSaveError("Title and content are required.");
            return;
        }

        setSaving(true);
        setSaveError(null);

        try {
            const importedContentWasNotEdited =
                selectedUploadFile !== null &&
                importedContentSnapshot !== null &&
                cleanContent === importedContentSnapshot.trim();

            let res: Response;

            if (importedContentWasNotEdited && selectedUploadFile) {
                const formData = new FormData();
                formData.append("file", selectedUploadFile);
                formData.append("title", cleanTitle);
                formData.append("max_chars", "800");

                res = await fetch(`${backendUrl}/api/study-sources/upload`, {
                    method: "POST",
                    body: formData,
                });
            } else {
                res = await fetch(`${backendUrl}/api/study-sources`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        title: cleanTitle,
                        source_type: selectedUploadFile ? "local_file" : "pasted_text",
                        content: cleanContent,
                        max_chars: 800,
                    }),
                });
            }

            if (!res.ok) {
                throw new Error(`HTTP ${res.status}`);
            }

            setTitle("");
            setContent("");
            setImportedFileName(null);
            setSelectedUploadFile(null);
            setImportedContentSnapshot(null);
            onSourceCreatedRef.current?.();
        } catch (err) {
            setSaveError(
                err instanceof Error ? err.message : "Failed to save study source"
            );
        } finally {
            setSaving(false);
        }
    }

    async function handleSearch(e: FormEvent<HTMLFormElement>) {
        e.preventDefault();
        const cleanQuery = searchQuery.trim();

        if (!cleanQuery) {
            setSearchResults([]);
            setSearchError(null);
            return;
        }

        setSearching(true);
        setSearchError(null);

        try {
            const res = await fetch(
                `${backendUrl}/api/study-sources/search?q=${encodeURIComponent(cleanQuery)}`,
                { cache: "no-store" }
            );

            if (!res.ok) {
                throw new Error(`HTTP ${res.status}`);
            }

            const data: StudySourceSearchResult[] = await res.json();
            setSearchResults(data);
        } catch (err) {
            setSearchResults([]);
            setSearchError(
                err instanceof Error ? err.message : "Search failed"
            );
        } finally {
            setSearching(false);
        }
    }

    function formatDate(iso: string) {
        try {
            return new Date(iso).toLocaleString();
        } catch {
            return iso;
        }
    }

    if (!sourceId) {
        return (
            <section className="wl-live-shell" data-testid="source-detail-panel">
                <div className="wl-live-topbar">
                    <div
                        className="wl-live-topbar-left"
                        style={{ fontSize: "0.88rem", fontWeight: 600, color: "#ccc" }}
                    >
                        Add New Source
                    </div>
                </div>

                <div className="wl-live-thread-shell">
                    <div className="wl-live-log">
                        <div style={{ maxWidth: 600, margin: "0 auto", padding: "20px 0" }}>
                            <div
                                className="wl-upload-zone"
                                onClick={() => fileInputRef.current?.click()}
                            >
                                <div className="wl-upload-zone-icon">📄</div>
                                <div className="wl-upload-zone-text">
                                    Click to upload a .txt or .md file
                                </div>
                                <div className="wl-upload-zone-hint">
                                    Or paste your text in the field below
                                </div>
                            </div>

                            <input
                                ref={fileInputRef}
                                type="file"
                                accept=".txt,.md,text/plain,text/markdown"
                                onChange={handleFileImport}
                                disabled={importingFile || saving}
                                style={{ display: "none" }}
                                data-testid="study-source-file-input"
                            />

                            {importedFileName && (
                                <div
                                    style={{ marginTop: 10, fontSize: "0.82rem", color: "#888" }}
                                    data-testid="study-source-imported-file"
                                >
                                    Imported: {importedFileName}
                                </div>
                            )}

                            {importError && (
                                <div
                                    style={{ marginTop: 8, fontSize: "0.82rem", color: "#f87171" }}
                                    data-testid="study-source-import-error"
                                >
                                    {importError}
                                </div>
                            )}

                            {saveError && (
                                <div
                                    style={{ marginTop: 8, fontSize: "0.82rem", color: "#f87171" }}
                                    data-testid="study-source-save-error"
                                >
                                    {saveError}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <div className="wl-live-composer-dock">
                    <div style={{ maxWidth: 760, margin: "0 auto" }}>
                        <input
                            type="text"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="Source title"
                            className="wl-live-textarea"
                            style={{
                                marginBottom: 8,
                                minHeight: 40,
                                padding: "8px 12px",
                                borderRadius: 12,
                                border: "1px solid #424242",
                                background: "#2f2f2f",
                            }}
                            data-testid="study-source-title-input"
                        />
                    </div>

                    <div className="wl-live-composer">
                        <textarea
                            ref={textareaRef}
                            data-testid="study-source-content-input"
                            className="wl-live-textarea"
                            placeholder="Paste your study text here…"
                            value={content}
                            onChange={(e) => setContent(e.target.value)}
                            rows={1}
                        />

                        <button
                            className="wl-live-send-button"
                            onClick={handleSubmit}
                            disabled={saving || !title.trim() || !content.trim()}
                            title="Save source"
                            data-testid="study-source-save-button"
                        >
                            {saving ? "…" : "↑"}
                        </button>
                    </div>
                </div>
            </section>
        );
    }

    if (loading) {
        return (
            <section className="wl-live-shell">
                <div className="wl-live-topbar" />
                <div className="wl-live-thread-shell">
                    <div className="wl-live-log">
                        <div className="wl-live-empty-state">
                            <div style={{ color: "#555", fontSize: "0.9rem" }}>
                                Loading source…
                            </div>
                        </div>
                    </div>
                </div>
                <div className="wl-live-composer-dock" />
            </section>
        );
    }

    if (!source) {
        return (
            <section className="wl-live-shell">
                <div className="wl-live-topbar" />
                <div className="wl-live-thread-shell">
                    <div className="wl-live-log">
                        <div className="wl-live-empty-state">
                            <div style={{ color: "#f87171", fontSize: "0.9rem" }}>
                                {error || "Source not found"}
                            </div>
                        </div>
                    </div>
                </div>
                <div className="wl-live-composer-dock" />
            </section>
        );
    }

    return (
        <section className="wl-live-shell" data-testid="source-detail-panel">
            <div className="wl-live-topbar">
                <div
                    className="wl-live-topbar-left"
                    style={{ fontSize: "0.88rem", fontWeight: 600, color: "#ccc" }}
                >
                    {source.title}
                </div>
                <div style={{ fontSize: "0.75rem", color: "#777" }}>
                    {source.source_type} · {source.chunks.length} chunks ·{" "}
                    {formatDate(source.updated_at)}
                </div>
            </div>

            <div className="wl-live-thread-shell">
                {error && (
                    <div className="wl-live-error" data-testid="study-source-detail-error">
                        {error}
                    </div>
                )}

                <div data-testid="study-source-detail" className="wl-live-log">
                    <div className="wl-source-content-area" style={{ padding: 0 }}>
                        {source.content}
                    </div>

                    <div style={{ marginTop: 20 }}>
                        <div className="wl-sidebar-section-title" style={{ marginBottom: 10 }}>
                            Chunks ({source.chunks.length})
                        </div>
                        {source.chunks.map((chunk) => (
                            <div key={chunk.chunk_index} className="wl-source-chunk">
                                <div className="wl-source-chunk-label">
                                    Chunk {chunk.chunk_index + 1}
                                </div>
                                <div className="wl-source-chunk-text">{chunk.text}</div>
                            </div>
                        ))}
                    </div>

                    <div style={{ marginTop: 24 }}>
                        <form
                            onSubmit={handleSearch}
                            style={{ display: "flex", gap: 8, marginBottom: 12 }}
                        >
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="Search your study sources…"
                                className="wl-live-textarea"
                                style={{
                                    minHeight: 38,
                                    padding: "6px 12px",
                                    borderRadius: 12,
                                    border: "1px solid #424242",
                                    background: "#2f2f2f",
                                    flex: 1,
                                }}
                                data-testid="study-source-search-input"
                            />
                            <button
                                type="submit"
                                disabled={searching}
                                className="wl-live-send-button"
                                style={{ width: 36, height: 36 }}
                                data-testid="study-source-search-button"
                            >
                                🔍
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    setSearchQuery("");
                                    setSearchResults([]);
                                    setSearchError(null);
                                }}
                                className="wl-live-reset"
                                data-testid="study-source-search-clear-button"
                            >
                                Clear
                            </button>
                        </form>

                        {searchError && (
                            <div className="wl-live-error" data-testid="study-source-search-error">
                                {searchError}
                            </div>
                        )}

                        {!searchError &&
                            !searching &&
                            searchQuery.trim() !== "" &&
                            searchResults.length === 0 && (
                                <div
                                    style={{ color: "#555", fontSize: "0.82rem" }}
                                    data-testid="study-source-search-empty"
                                >
                                    No matching study chunks found.
                                </div>
                            )}

                        {searchResults.length > 0 && (
                            <div data-testid="study-source-search-results">
                                {searchResults.map((result) => (
                                    <div
                                        key={result.id}
                                        className="wl-source-chunk"
                                        data-testid="study-source-search-result"
                                    >
                                        <div className="wl-source-chunk-label">
                                            {result.document_title} · Chunk {result.chunk_index + 1}
                                        </div>
                                        <div className="wl-source-chunk-text">
                                            {result.text}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <div className="wl-live-composer-dock" />
        </section>
    );
}