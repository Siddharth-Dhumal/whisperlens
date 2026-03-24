import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import StudyVault from "./StudyVault";

beforeEach(() => {
    vi.restoreAllMocks();
});

afterEach(() => {
    vi.restoreAllMocks();
});

function mockFetch(handler: (url: string) => Promise<Response>) {
    vi.stubGlobal("fetch", vi.fn(handler));
}

describe("StudyVault (sidebar list)", () => {
    it("shows empty-state message when no sessions exist", async () => {
        mockFetch(async () =>
            new Response(JSON.stringify([]), { status: 200 })
        );

        render(<StudyVault onSelect={vi.fn()} onNewChat={vi.fn()} />);

        await waitFor(() => {
            expect(screen.getByTestId("vault-empty")).toBeTruthy();
        });

        expect(screen.getByTestId("vault-empty").textContent).toContain(
            "No saved sessions yet"
        );
    });

    it("shows session list items and calls onSelect when clicked", async () => {
        const sessionsList = [
            {
                id: "abc-123",
                title: "Test chat",
                created_at: "2026-03-09T12:00:00Z",
                updated_at: "2026-03-09T12:05:00Z",
            },
        ];

        mockFetch(async () =>
            new Response(JSON.stringify(sessionsList), { status: 200 })
        );

        const onSelect = vi.fn();
        render(<StudyVault onSelect={onSelect} onNewChat={vi.fn()} />);

        await waitFor(() => {
            expect(screen.getByTestId("session-item")).toBeTruthy();
        });

        expect(screen.getByText("Test chat")).toBeTruthy();

        screen.getByTestId("session-item").click();
        expect(onSelect).toHaveBeenCalledWith("abc-123");
    });

    it("re-fetches sessions when refreshKey increments", async () => {
        const fetchMock = vi.fn().mockResolvedValue(
            new Response(JSON.stringify([]), { status: 200 })
        );
        vi.stubGlobal("fetch", fetchMock);

        const { rerender } = render(
            <StudyVault refreshKey={0} onSelect={vi.fn()} onNewChat={vi.fn()} />
        );

        await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

        rerender(
            <StudyVault refreshKey={1} onSelect={vi.fn()} onNewChat={vi.fn()} />
        );

        await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    });

    it("highlights the active session", async () => {
        const sessionsList = [
            {
                id: "abc-123",
                title: "Test chat",
                created_at: "2026-03-09T12:00:00Z",
                updated_at: "2026-03-09T12:05:00Z",
            },
        ];

        mockFetch(async () =>
            new Response(JSON.stringify(sessionsList), { status: 200 })
        );

        render(
            <StudyVault
                activeSessionId="abc-123"
                onSelect={vi.fn()}
                onNewChat={vi.fn()}
            />
        );

        await waitFor(() => {
            expect(screen.getByTestId("session-item")).toBeTruthy();
        });

        const item = screen.getByTestId("session-item");
        expect(item.className).toContain("wl-sidebar-item-active");
    });
});
