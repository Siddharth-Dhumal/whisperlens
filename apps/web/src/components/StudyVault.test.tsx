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
});
