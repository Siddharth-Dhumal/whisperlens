import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
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

describe("StudySources (sidebar list)", () => {
    it("shows empty-state message when no study sources exist", async () => {
        mockFetch(async () => new Response(JSON.stringify([]), { status: 200 }));

        render(<StudySources onSelect={vi.fn()} onNewSource={vi.fn()} />);

        await waitFor(() => {
            expect(screen.getByTestId("study-sources-empty")).toBeTruthy();
        });

        expect(screen.getByTestId("study-sources-empty").textContent).toContain(
            "No study sources yet"
        );
    });

    it("shows the list of saved study sources", async () => {
        mockFetch(async () =>
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
            )
        );

        render(<StudySources onSelect={vi.fn()} onNewSource={vi.fn()} />);

        await waitFor(() => {
            expect(screen.getAllByTestId("study-source-item").length).toBe(2);
        });

        expect(screen.getByText("Operating Systems Notes")).toBeTruthy();
        expect(screen.getByText("Linear Algebra Review")).toBeTruthy();
    });

    it("calls onSelect when a source item is clicked", async () => {
        mockFetch(async () =>
            new Response(
                JSON.stringify([
                    {
                        id: "doc-1",
                        title: "Operating Systems Notes",
                        source_type: "pasted_text",
                        content: "Processes",
                        created_at: "2026-03-18T12:00:00Z",
                        updated_at: "2026-03-18T12:00:00Z",
                    },
                ]),
                { status: 200 }
            )
        );

        const onSelect = vi.fn();
        render(<StudySources onSelect={onSelect} onNewSource={vi.fn()} />);

        await waitFor(() => {
            expect(screen.getByTestId("study-source-item")).toBeTruthy();
        });

        screen.getByTestId("study-source-item").click();
        expect(onSelect).toHaveBeenCalledWith("doc-1");
    });

    it("highlights the active source", async () => {
        mockFetch(async () =>
            new Response(
                JSON.stringify([
                    {
                        id: "doc-1",
                        title: "Operating Systems Notes",
                        source_type: "pasted_text",
                        content: "Processes",
                        created_at: "2026-03-18T12:00:00Z",
                        updated_at: "2026-03-18T12:00:00Z",
                    },
                ]),
                { status: 200 }
            )
        );

        render(
            <StudySources
                activeSourceId="doc-1"
                onSelect={vi.fn()}
                onNewSource={vi.fn()}
            />
        );

        await waitFor(() => {
            expect(screen.getByTestId("study-source-item")).toBeTruthy();
        });

        const item = screen.getByTestId("study-source-item");
        expect(item.className).toContain("wl-sidebar-item-active");
    });

    it("calls onNewSource when add button is clicked", async () => {
        mockFetch(async () => new Response(JSON.stringify([]), { status: 200 }));

        const onNewSource = vi.fn();
        render(<StudySources onSelect={vi.fn()} onNewSource={onNewSource} />);

        await waitFor(() => {
            expect(screen.getByTestId("new-source-button")).toBeTruthy();
        });

        screen.getByTestId("new-source-button").click();
        expect(onNewSource).toHaveBeenCalledTimes(1);
    });

    it("refetches the source list when refreshKey changes", async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }))
            .mockResolvedValueOnce(
                new Response(
                    JSON.stringify([
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
                )
            );

        vi.stubGlobal("fetch", fetchMock);

        const { rerender } = render(
            <StudySources
                refreshKey={0}
                onSelect={vi.fn()}
                onNewSource={vi.fn()}
            />
        );

        await waitFor(() => {
            expect(screen.getByTestId("study-sources-empty")).toBeTruthy();
        });

        rerender(
            <StudySources
                refreshKey={1}
                onSelect={vi.fn()}
                onNewSource={vi.fn()}
            />
        );

        await waitFor(() => {
            expect(screen.getByText("Linear Algebra Review")).toBeTruthy();
        });
    });
});