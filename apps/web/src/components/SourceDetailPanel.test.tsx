import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import SourceDetailPanel from "./SourceDetailPanel";

beforeEach(() => {
    vi.restoreAllMocks();
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe("SourceDetailPanel", () => {
    it("loads and shows study source detail when sourceId is provided", async () => {
        const fetchMock = vi.fn().mockResolvedValueOnce(
            new Response(
                JSON.stringify({
                    id: "doc-1",
                    title: "Operating Systems Notes",
                    source_type: "pasted_text",
                    content: "A process is a program in execution. Threads are smaller units.",
                    created_at: "2026-03-18T12:00:00Z",
                    updated_at: "2026-03-18T12:00:00Z",
                    chunks: [
                        { chunk_index: 0, text: "A process is a program in execution." },
                        { chunk_index: 1, text: "Threads are smaller units." },
                    ],
                }),
                { status: 200 }
            )
        );

        vi.stubGlobal("fetch", fetchMock);

        render(<SourceDetailPanel sourceId="doc-1" />);

        await waitFor(() => {
            expect(screen.getByTestId("study-source-detail")).toBeTruthy();
        });

        expect(screen.getByTestId("study-source-detail").textContent).toContain(
            "A process is a program in execution."
        );
        expect(screen.getByTestId("study-source-detail").textContent).toContain(
            "Chunk 1"
        );
        expect(screen.getByTestId("study-source-detail").textContent).toContain(
            "Chunk 2"
        );
    });

    it("shows the create form when sourceId is null", async () => {
        render(<SourceDetailPanel sourceId={null} />);

        expect(screen.getByTestId("study-source-title-input")).toBeTruthy();
        expect(screen.getByTestId("study-source-content-input")).toBeTruthy();
        expect(screen.getByTestId("study-source-save-button")).toBeTruthy();
    });

    it("creates a pasted-text study source and calls onSourceCreated", async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(
                new Response(
                    JSON.stringify({
                        document_id: "doc-1",
                        title: "OS Notes",
                        chunk_count: 1,
                    }),
                    { status: 200 }
                )
            );

        vi.stubGlobal("fetch", fetchMock);

        const onSourceCreated = vi.fn();
        render(<SourceDetailPanel sourceId={null} onSourceCreated={onSourceCreated} />);

        fireEvent.change(screen.getByTestId("study-source-title-input"), {
            target: { value: "OS Notes" },
        });

        fireEvent.change(screen.getByTestId("study-source-content-input"), {
            target: { value: "A process is a program in execution." },
        });

        fireEvent.click(screen.getByTestId("study-source-save-button"));

        await waitFor(() => {
            expect(onSourceCreated).toHaveBeenCalledTimes(1);
        });

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(fetchMock.mock.calls[0]?.[0]).toContain("/api/study-sources");

        const postOptions = fetchMock.mock.calls[0]?.[1] as RequestInit;
        expect(postOptions.method).toBe("POST");
        expect(postOptions.body).toBe(
            JSON.stringify({
                title: "OS Notes",
                source_type: "pasted_text",
                content: "A process is a program in execution.",
                max_chars: 800,
            })
        );
    });

    it("imports a .txt file and auto-fills title and content", async () => {
        render(<SourceDetailPanel sourceId={null} />);

        const fileInput = screen.getByTestId("study-source-file-input") as HTMLInputElement;
        const titleInput = screen.getByTestId("study-source-title-input") as HTMLInputElement;
        const contentInput = screen.getByTestId("study-source-content-input") as HTMLTextAreaElement;

        const file = new File(["A process is a program in execution."], "os-notes.txt", {
            type: "text/plain",
        });

        Object.defineProperty(file, "text", {
            value: vi.fn().mockResolvedValue("A process is a program in execution."),
        });

        fireEvent.change(fileInput, {
            target: { files: [file] },
        });

        await waitFor(() => {
            expect(titleInput.value).toBe("os-notes");
        });

        expect(contentInput.value).toBe("A process is a program in execution.");
        expect(screen.getByTestId("study-source-imported-file").textContent).toContain("os-notes.txt");
    });

    it("searches study sources and shows results", async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(
                new Response(
                    JSON.stringify({
                        id: "doc-1",
                        title: "OS Notes",
                        source_type: "pasted_text",
                        content: "Processes",
                        created_at: "2026-03-18T12:00:00Z",
                        updated_at: "2026-03-18T12:00:00Z",
                        chunks: [{ chunk_index: 0, text: "Processes" }],
                    }),
                    { status: 200 }
                )
            )
            .mockResolvedValueOnce(
                new Response(
                    JSON.stringify([
                        {
                            id: "chunk-11",
                            document_id: "doc-1",
                            document_title: "OS Notes",
                            chunk_index: 0,
                            text: "A process is a program in execution.",
                            snippet: "A [process] is a program in execution.",
                            score: -1.23,
                        },
                    ]),
                    { status: 200 }
                )
            );

        vi.stubGlobal("fetch", fetchMock);

        render(<SourceDetailPanel sourceId="doc-1" />);

        await waitFor(() => {
            expect(screen.getByTestId("study-source-detail")).toBeTruthy();
        });

        fireEvent.change(screen.getByTestId("study-source-search-input"), {
            target: { value: "process" },
        });

        fireEvent.click(screen.getByTestId("study-source-search-button"));

        await waitFor(() => {
            expect(screen.getByTestId("study-source-search-results")).toBeTruthy();
        });

        expect(screen.getByTestId("study-source-search-result").textContent).toContain(
            "A process is a program in execution."
        );
    });

    it("shows empty search state and clear resets the search UI", async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(
                new Response(
                    JSON.stringify({
                        id: "doc-1",
                        title: "OS Notes",
                        source_type: "pasted_text",
                        content: "Processes",
                        created_at: "2026-03-18T12:00:00Z",
                        updated_at: "2026-03-18T12:00:00Z",
                        chunks: [{ chunk_index: 0, text: "Processes" }],
                    }),
                    { status: 200 }
                )
            )
            .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }));

        vi.stubGlobal("fetch", fetchMock);

        render(<SourceDetailPanel sourceId="doc-1" />);

        await waitFor(() => {
            expect(screen.getByTestId("study-source-detail")).toBeTruthy();
        });

        const searchInput = screen.getByTestId("study-source-search-input") as HTMLInputElement;

        fireEvent.change(searchInput, {
            target: { value: "virtual memory" },
        });

        fireEvent.click(screen.getByTestId("study-source-search-button"));

        await waitFor(() => {
            expect(screen.getByTestId("study-source-search-empty")).toBeTruthy();
        });

        fireEvent.click(screen.getByTestId("study-source-search-clear-button"));

        expect(searchInput.value).toBe("");
        expect(screen.queryByTestId("study-source-search-empty")).toBeNull();
    });

    it("shows a search error when study-source search fails", async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(
                new Response(
                    JSON.stringify({
                        id: "doc-1",
                        title: "OS Notes",
                        source_type: "pasted_text",
                        content: "Processes",
                        created_at: "2026-03-18T12:00:00Z",
                        updated_at: "2026-03-18T12:00:00Z",
                        chunks: [{ chunk_index: 0, text: "Processes" }],
                    }),
                    { status: 200 }
                )
            )
            .mockResolvedValueOnce(new Response("server error", { status: 500 }));

        vi.stubGlobal("fetch", fetchMock);

        render(<SourceDetailPanel sourceId="doc-1" />);

        await waitFor(() => {
            expect(screen.getByTestId("study-source-detail")).toBeTruthy();
        });

        fireEvent.change(screen.getByTestId("study-source-search-input"), {
            target: { value: "paging" },
        });

        fireEvent.click(screen.getByTestId("study-source-search-button"));

        await waitFor(() => {
            expect(screen.getByTestId("study-source-search-error")).toBeTruthy();
        });

        expect(screen.getByTestId("study-source-search-error").textContent).toContain(
            "HTTP 500"
        );
    });

    it("does not keep showing the previous source when loading a new source fails", async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(
                new Response(
                    JSON.stringify({
                        id: "doc-1",
                        title: "OS Notes",
                        source_type: "pasted_text",
                        content: "Processes",
                        created_at: "2026-03-18T12:00:00Z",
                        updated_at: "2026-03-18T12:00:00Z",
                        chunks: [{ chunk_index: 0, text: "Processes" }],
                    }),
                    { status: 200 }
                )
            )
            .mockResolvedValueOnce(new Response("not found", { status: 404 }));

        vi.stubGlobal("fetch", fetchMock);

        const { rerender } = render(<SourceDetailPanel sourceId="doc-1" />);

        await waitFor(() => {
            expect(screen.getByTestId("study-source-detail")).toBeTruthy();
        });

        const detailView = screen.getByTestId("study-source-detail");
        expect(within(detailView).getAllByText("Processes").length).toBeGreaterThan(0);

        rerender(<SourceDetailPanel sourceId="doc-2" />);

        await waitFor(() => {
            expect(screen.getByText("HTTP 404")).toBeTruthy();
        });

        expect(screen.queryByTestId("study-source-detail")).toBeNull();
        expect(screen.queryByText("Processes")).toBeNull();
    });
});
