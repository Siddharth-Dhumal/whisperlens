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
});