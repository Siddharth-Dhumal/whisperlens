import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
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

describe("StudyVault", () => {
    it("shows empty-state message when no sessions exist", async () => {
        mockFetch(async () =>
            new Response(JSON.stringify([]), { status: 200 })
        );

        render(<StudyVault />);

        await waitFor(() => {
            expect(screen.getByTestId("vault-empty")).toBeTruthy();
        });

        expect(screen.getByTestId("vault-empty").textContent).toContain(
            "No saved sessions yet"
        );
    });

    it("shows session list and navigates to detail with voice indicator", async () => {
        const sessionId = "abc-123";

        const sessionsList = [
            {
                id: sessionId,
                title: "Test chat",
                created_at: "2026-03-09T12:00:00Z",
                updated_at: "2026-03-09T12:05:00Z",
            },
        ];

        const sessionDetail = {
            ...sessionsList[0],
            messages: [
                {
                    id: "m1",
                    role: "user",
                    text: "hello from mic",
                    source: "voice",
                    created_at: "2026-03-09T12:00:01Z",
                },
                {
                    id: "m2",
                    role: "assistant",
                    text: "Hi there!",
                    source: "typed",
                    created_at: "2026-03-09T12:00:02Z",
                },
            ],
        };

        mockFetch(async (url: string) => {
            if (url.endsWith("/api/sessions/" + sessionId)) {
                return new Response(JSON.stringify(sessionDetail), {
                    status: 200,
                });
            }
            return new Response(JSON.stringify(sessionsList), { status: 200 });
        });

        render(<StudyVault />);

        // Wait for session list to load
        await waitFor(() => {
            expect(screen.getByTestId("session-item")).toBeTruthy();
        });

        expect(screen.getByText("Test chat")).toBeTruthy();

        // Click the session
        fireEvent.click(screen.getByTestId("session-item"));

        // Wait for detail view to load
        await waitFor(() => {
            expect(screen.getByTestId("session-messages")).toBeTruthy();
        });

        const messages = screen.getByTestId("session-messages");

        // Voice user message with 🎤 indicator
        expect(messages.textContent).toContain("You");
        expect(messages.textContent).toContain("🎤");
        expect(messages.textContent).toContain("hello from mic");

        // Assistant message
        expect(messages.textContent).toContain("AI");
        expect(messages.textContent).toContain("Hi there!");
    });

    it("re-fetches sessions when refreshKey increments", async () => {
        const fetchMock = vi.fn().mockResolvedValue(
            new Response(JSON.stringify([]), { status: 200 })
        );
        vi.stubGlobal("fetch", fetchMock);

        const { rerender } = render(<StudyVault refreshKey={0} />);

        // Initial fetch on mount
        await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

        // Simulate parent signalling a new turn was saved
        rerender(<StudyVault refreshKey={1} />);

        await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    });

    it("re-fetches open session detail when refreshKey increments with session open", async () => {
        const sessionId = "detail-456";
        const sessionsList = [{
            id: sessionId, title: "Open session",
            created_at: "2026-03-10T10:00:00Z", updated_at: "2026-03-10T10:01:00Z",
        }];
        const detailV1 = {
            ...sessionsList[0], messages: [
                { id: "m1", role: "user", text: "hi", source: "typed", created_at: "2026-03-10T10:00:01Z" },
            ]
        };
        const detailV2 = {
            ...sessionsList[0], messages: [
                { id: "m1", role: "user", text: "hi", source: "typed", created_at: "2026-03-10T10:00:01Z" },
                { id: "m2", role: "assistant", text: "hello!", source: "typed", created_at: "2026-03-10T10:00:02Z" },
            ]
        };

        const fetchMock = vi.fn().mockImplementation(async (url: string) => {
            if (url.includes(`/api/sessions/${sessionId}`)) {
                // First detail fetch returns v1; second returns v2 (new message)
                const body = fetchMock.mock.calls.filter((c: string[]) => c[0].includes(sessionId)).length === 1
                    ? detailV1 : detailV2;
                return new Response(JSON.stringify(body), { status: 200 });
            }
            return new Response(JSON.stringify(sessionsList), { status: 200 });
        });
        vi.stubGlobal("fetch", fetchMock);

        const { rerender } = render(<StudyVault refreshKey={0} />);

        // Wait for list, then open the session
        await waitFor(() => screen.getByTestId("session-item"));
        fireEvent.click(screen.getByTestId("session-item"));
        await waitFor(() => screen.getByTestId("session-messages"));

        // One message visible
        expect(screen.getByTestId("session-messages").textContent).toContain("hi");
        expect(screen.getByTestId("session-messages").textContent).not.toContain("hello!");

        // Signal a new turn was saved
        rerender(<StudyVault refreshKey={1} />);

        // Detail should refresh and show the new assistant message
        await waitFor(() =>
            expect(screen.getByTestId("session-messages").textContent).toContain("hello!")
        );
    });
});
