import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import StudySources from "./StudySources";

beforeEach(() => {
    vi.restoreAllMocks();
});

afterEach(() => {
    vi.restoreAllMocks();
});

function mockFetch(handler: (url: string) => Promise<Response>) {
    vi.stubGlobal("fetch", vi.fn(handler));
}

describe("StudySources", () => {
    it("shows empty-state message when no study sources exist", async () => {
        mockFetch(async () => new Response(JSON.stringify([]), { status: 200 }));

        render(<StudySources />);

        await waitFor(() => {
            expect(screen.getByTestId("study-sources-empty")).toBeTruthy();
        });

        expect(screen.getByTestId("study-sources-empty").textContent).toContain(
            "No study sources yet"
        );
    });

    it("shows the list of saved study sources", async () => {
        mockFetch(async (url: string) => {
            expect(url).toContain("/api/study-sources");

            return new Response(
                JSON.stringify([
                    {
                        id: "doc-1",
                        title: "Operating Systems Notes",
                        source_type: "pasted_text",
                        content: "Processes and threads",
                        created_at: "2026-03-18T12:00:00Z",
                        updated_at: "2026-03-18T12:00:00Z",
                    },
                    {
                        id: "doc-2",
                        title: "Linear Algebra Review",
                        source_type: "pasted_text",
                        content: "Matrices and vectors",
                        created_at: "2026-03-18T12:05:00Z",
                        updated_at: "2026-03-18T12:05:00Z",
                    },
                ]),
                { status: 200 }
            );
        });

        render(<StudySources />);

        await waitFor(() => {
            expect(screen.getAllByTestId("study-source-item").length).toBe(2);
        });

        expect(screen.getByText("Operating Systems Notes")).toBeTruthy();
        expect(screen.getByText("Linear Algebra Review")).toBeTruthy();
    });

    it("creates a pasted-text study source and refreshes the list", async () => {
        const fetchMock = vi
            .fn()
            // Initial GET on mount
            .mockResolvedValueOnce(
                new Response(JSON.stringify([]), { status: 200 })
            )
            // POST create
            .mockResolvedValueOnce(
                new Response(
                    JSON.stringify({
                        document_id: "doc-1",
                        title: "Operating Systems Notes",
                        chunk_count: 1,
                    }),
                    { status: 200 }
                )
            )
            // Refresh GET after successful create
            .mockResolvedValueOnce(
                new Response(
                    JSON.stringify([
                        {
                            id: "doc-1",
                            title: "Operating Systems Notes",
                            source_type: "pasted_text",
                            content: "A process is a program in execution.",
                            created_at: "2026-03-18T12:00:00Z",
                            updated_at: "2026-03-18T12:00:00Z",
                        },
                    ]),
                    { status: 200 }
                )
            );

        vi.stubGlobal("fetch", fetchMock);

        render(<StudySources />);

        await waitFor(() => {
            expect(screen.getByTestId("study-sources-empty")).toBeTruthy();
        });

        fireEvent.change(screen.getByTestId("study-source-title-input"), {
            target: { value: "Operating Systems Notes" },
        });

        fireEvent.change(screen.getByTestId("study-source-content-input"), {
            target: { value: "A process is a program in execution." },
        });

        fireEvent.click(screen.getByTestId("study-source-save-button"));

        await waitFor(() => {
            expect(screen.getByText("Operating Systems Notes")).toBeTruthy();
        });

        expect(fetchMock).toHaveBeenCalledTimes(3);

        expect(fetchMock.mock.calls[1]?.[0]).toContain("/api/study-sources");

        const postOptions = fetchMock.mock.calls[1]?.[1] as RequestInit;
        expect(postOptions.method).toBe("POST");
        expect(postOptions.headers).toEqual({ "Content-Type": "application/json" });

        expect(postOptions.body).toBe(
            JSON.stringify({
                title: "Operating Systems Notes",
                source_type: "pasted_text",
                content: "A process is a program in execution.",
                max_chars: 800,
            })
        );
    });

    it("loads and shows study source detail when a source is clicked", async () => {
        const fetchMock = vi
            .fn()
            // Initial GET list on mount
            .mockResolvedValueOnce(
                new Response(
                    JSON.stringify([
                        {
                            id: "doc-1",
                            title: "Operating Systems Notes",
                            source_type: "pasted_text",
                            content: "Processes and threads",
                            created_at: "2026-03-18T12:00:00Z",
                            updated_at: "2026-03-18T12:00:00Z",
                        },
                    ]),
                    { status: 200 }
                )
            )
            // GET detail after clicking item
            .mockResolvedValueOnce(
                new Response(
                    JSON.stringify({
                        id: "doc-1",
                        title: "Operating Systems Notes",
                        source_type: "pasted_text",
                        content:
                            "A process is a program in execution. Threads are smaller units of execution inside a process.",
                        created_at: "2026-03-18T12:00:00Z",
                        updated_at: "2026-03-18T12:00:00Z",
                        chunks: [
                            {
                                id: "chunk-1",
                                chunk_index: 0,
                                text: "A process is a program in execution.",
                            },
                            {
                                id: "chunk-2",
                                chunk_index: 1,
                                text: "Threads are smaller units of execution inside a process.",
                            },
                        ],
                    }),
                    { status: 200 }
                )
            );

        vi.stubGlobal("fetch", fetchMock);

        render(<StudySources />);

        await waitFor(() => {
            expect(screen.getByText("Operating Systems Notes")).toBeTruthy();
        });

        fireEvent.click(screen.getByText("Operating Systems Notes"));

        await waitFor(() => {
            expect(screen.getByTestId("study-source-detail")).toBeTruthy();
        });

        expect(
            screen.getByText("A process is a program in execution. Threads are smaller units of execution inside a process.")
        ).toBeTruthy();

        expect(screen.getByText("2 chunks")).toBeTruthy();

        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(fetchMock.mock.calls[1]?.[0]).toContain("/api/study-sources/doc-1");
    });

    it("imports a .txt file and auto-fills title and content", async () => {
        const fetchMock = vi
            .fn()
            // Initial GET on mount
            .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }));

        vi.stubGlobal("fetch", fetchMock);

        render(<StudySources />);

        await waitFor(() => {
            expect(screen.getByTestId("study-sources-empty")).toBeTruthy();
        });

        const titleInput = screen.getByTestId(
            "study-source-title-input"
        ) as HTMLInputElement;
        const contentInput = screen.getByTestId(
            "study-source-content-input"
        ) as HTMLTextAreaElement;
        const fileInput = screen.getByTestId(
            "study-source-file-input"
        ) as HTMLInputElement;

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
        expect(screen.getByTestId("study-source-imported-file").textContent).toContain(
            "os-notes.txt"
        );

        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("imports a .md file, keeps an existing title, and saves the imported content", async () => {
        const fetchMock = vi
            .fn()
            // Initial GET on mount
            .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }))
            // POST create
            .mockResolvedValueOnce(
                new Response(
                    JSON.stringify({
                        document_id: "doc-1",
                        title: "Custom OS Notes",
                        chunk_count: 1,
                    }),
                    { status: 200 }
                )
            )
            // Refresh GET after successful create
            .mockResolvedValueOnce(
                new Response(
                    JSON.stringify([
                        {
                            id: "doc-1",
                            title: "Custom OS Notes",
                            source_type: "pasted_text",
                            content: "# Processes\nA process is a program in execution.",
                            created_at: "2026-03-18T12:00:00Z",
                            updated_at: "2026-03-18T12:00:00Z",
                        },
                    ]),
                    { status: 200 }
                )
            );

        vi.stubGlobal("fetch", fetchMock);

        render(<StudySources />);

        await waitFor(() => {
            expect(screen.getByTestId("study-sources-empty")).toBeTruthy();
        });

        const titleInput = screen.getByTestId(
            "study-source-title-input"
        ) as HTMLInputElement;
        const contentInput = screen.getByTestId(
            "study-source-content-input"
        ) as HTMLTextAreaElement;
        const fileInput = screen.getByTestId(
            "study-source-file-input"
        ) as HTMLInputElement;

        fireEvent.change(titleInput, {
            target: { value: "Custom OS Notes" },
        });

        const file = new File(
            ["# Processes\nA process is a program in execution."],
            "lecture-notes.md",
            { type: "text/markdown" }
        );

        Object.defineProperty(file, "text", {
            value: vi
                .fn()
                .mockResolvedValue("# Processes\nA process is a program in execution."),
        });

        fireEvent.change(fileInput, {
            target: { files: [file] },
        });

        await waitFor(() => {
            expect(contentInput.value).toBe(
                "# Processes\nA process is a program in execution."
            );
        });

        expect(titleInput.value).toBe("Custom OS Notes");
        expect(screen.getByTestId("study-source-imported-file").textContent).toContain(
            "lecture-notes.md"
        );

        fireEvent.click(screen.getByTestId("study-source-save-button"));

        await waitFor(() => {
            expect(screen.getByText("Custom OS Notes")).toBeTruthy();
        });

        expect(fetchMock).toHaveBeenCalledTimes(3);

        const postOptions = fetchMock.mock.calls[1]?.[1] as RequestInit;
        expect(postOptions.method).toBe("POST");
        expect(postOptions.body).toBe(
            JSON.stringify({
                title: "Custom OS Notes",
                source_type: "local_file",
                content: "# Processes\nA process is a program in execution.",
                max_chars: 800,
            })
        );
    });

    it("searches study sources and opens source detail from a search result", async () => {
        const fetchMock = vi
            .fn()
            // Initial GET on mount
            .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }))
            // Search request
            .mockResolvedValueOnce(
                new Response(
                    JSON.stringify([
                        {
                            chunk_id: 11,
                            document_id: "doc-1",
                            document_title: "Operating Systems Notes",
                            chunk_index: 0,
                            content: "A process is a program in execution.",
                        },
                    ]),
                    { status: 200 }
                )
            )
            // Detail request after clicking the search result
            .mockResolvedValueOnce(
                new Response(
                    JSON.stringify({
                        id: "doc-1",
                        title: "Operating Systems Notes",
                        source_type: "local_file",
                        content: "A process is a program in execution.",
                        created_at: "2026-03-18T12:00:00Z",
                        updated_at: "2026-03-18T12:00:00Z",
                        chunks: [
                            {
                                chunk_index: 0,
                                text: "A process is a program in execution.",
                            },
                        ],
                    }),
                    { status: 200 }
                )
            );

        vi.stubGlobal("fetch", fetchMock);

        render(<StudySources />);

        await waitFor(() => {
            expect(screen.getByTestId("study-sources-empty")).toBeTruthy();
        });

        fireEvent.change(screen.getByTestId("study-source-search-input"), {
            target: { value: "process" },
        });

        fireEvent.click(screen.getByTestId("study-source-search-button"));

        await waitFor(() => {
            expect(screen.getByTestId("study-source-search-results")).toBeTruthy();
        });

        expect(screen.getByText("Operating Systems Notes")).toBeTruthy();
        expect(screen.getByText("Chunk 1")).toBeTruthy();
        expect(
            screen.getByText("A process is a program in execution.")
        ).toBeTruthy();

        fireEvent.click(screen.getByTestId("study-source-search-result"));

        await waitFor(() => {
            expect(screen.getByTestId("study-source-detail")).toBeTruthy();
        });

        expect(screen.getByTestId("study-source-detail").textContent).toContain(
            "Operating Systems Notes"
        );
        expect(screen.getByTestId("study-source-detail").textContent).toContain(
            "1 chunks"
        );

        expect(fetchMock).toHaveBeenCalledTimes(3);
        expect(fetchMock.mock.calls[1]?.[0]).toContain(
            "/api/study-sources/search?q=process"
        );
        expect(fetchMock.mock.calls[2]?.[0]).toContain("/api/study-sources/doc-1");
    });

    it("shows empty search state and clear resets the search UI", async () => {
        const fetchMock = vi
            .fn()
            // Initial GET on mount
            .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }))
            // Search request with no results
            .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }));

        vi.stubGlobal("fetch", fetchMock);

        render(<StudySources />);

        await waitFor(() => {
            expect(screen.getByTestId("study-sources-empty")).toBeTruthy();
        });

        const searchInput = screen.getByTestId(
            "study-source-search-input"
        ) as HTMLInputElement;

        fireEvent.change(searchInput, {
            target: { value: "virtual memory" },
        });

        fireEvent.click(screen.getByTestId("study-source-search-button"));

        await waitFor(() => {
            expect(screen.getByTestId("study-source-search-empty")).toBeTruthy();
        });

        expect(screen.getByTestId("study-source-search-empty").textContent).toContain(
            "No matching study chunks found."
        );

        fireEvent.click(screen.getByTestId("study-source-search-clear-button"));

        expect(searchInput.value).toBe("");
        expect(screen.queryByTestId("study-source-search-empty")).toBeNull();
        expect(screen.queryByTestId("study-source-search-results")).toBeNull();

        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(fetchMock.mock.calls[1]?.[0]).toContain(
            "/api/study-sources/search?q=virtual%20memory"
        );
    });

    it("shows a search error when study-source search fails", async () => {
        const fetchMock = vi
            .fn()
            // Initial GET on mount
            .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }))
            // Search request fails
            .mockResolvedValueOnce(new Response("server error", { status: 500 }));

        vi.stubGlobal("fetch", fetchMock);

        render(<StudySources />);

        await waitFor(() => {
            expect(screen.getByTestId("study-sources-empty")).toBeTruthy();
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
        expect(screen.queryByTestId("study-source-search-results")).toBeNull();
        expect(screen.queryByTestId("study-source-search-empty")).toBeNull();

        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(fetchMock.mock.calls[1]?.[0]).toContain(
            "/api/study-sources/search?q=paging"
        );
    });
});