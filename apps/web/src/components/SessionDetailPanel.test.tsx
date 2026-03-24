import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import SessionDetailPanel from "./SessionDetailPanel";

/* ------------------------------------------------------------------
 * Mock liveSocket
 * ----------------------------------------------------------------*/

let capturedOnMessage: ((msg: Record<string, unknown>) => void) | null = null;
let capturedOnStatusChange: ((status: string) => void) | null = null;

const mockSendTextMessage = vi.fn();
const mockSendControlMessage = vi.fn();
const mockConnect = vi.fn();
const mockDisconnect = vi.fn();

vi.mock("@/lib/liveSocket", () => ({
    createLiveSocketClient: (args: {
        onStatusChange: (s: string) => void;
        onMessage: (m: Record<string, unknown>) => void;
    }) => {
        capturedOnStatusChange = args.onStatusChange;
        capturedOnMessage = args.onMessage;
        return {
            connect: mockConnect,
            disconnect: mockDisconnect,
            sendAudioChunk: vi.fn(),
            sendTextMessage: mockSendTextMessage,
            sendControlMessage: mockSendControlMessage,
        };
    },
}));

vi.mock("@/lib/audioRecorder", () => ({
    createAudioRecorder: () => ({
        start: vi.fn(),
        stop: vi.fn(),
    }),
}));

beforeEach(() => {
    capturedOnMessage = null;
    capturedOnStatusChange = null;
    mockSendTextMessage.mockClear();
    mockSendControlMessage.mockClear();
    mockConnect.mockClear();
    mockDisconnect.mockClear();
});

afterEach(() => {
    vi.restoreAllMocks();
});

/* ------------------------------------------------------------------
 * Tests
 * ----------------------------------------------------------------*/

const sessionDetail = {
    id: "session-1",
    title: "Test Session",
    created_at: "2026-03-09T12:00:00Z",
    updated_at: "2026-03-09T12:05:00Z",
    messages: [
        { id: "m1", role: "user", text: "hello from mic", source: "voice", created_at: "2026-03-09T12:00:01Z" },
        { id: "m2", role: "assistant", text: "Hi there!", source: "typed", created_at: "2026-03-09T12:00:02Z" },
    ],
};

describe("SessionDetailPanel", () => {
    it("loads and displays session messages", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
            new Response(JSON.stringify(sessionDetail), { status: 200 })
        ));

        render(<SessionDetailPanel sessionId="session-1" />);

        await waitFor(() => {
            expect(screen.getByTestId("session-messages")).toBeTruthy();
        });

        const messages = screen.getByTestId("session-messages");
        expect(messages.textContent).toContain("hello from mic");
        expect(messages.textContent).toContain("🎤");
        expect(messages.textContent).toContain("Hi there!");
    });

    it("sends session_bind when socket connects", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
            new Response(JSON.stringify(sessionDetail), { status: 200 })
        ));

        render(<SessionDetailPanel sessionId="session-1" />);

        await waitFor(() => {
            expect(screen.getByTestId("session-messages")).toBeTruthy();
        });

        act(() => {
            capturedOnStatusChange?.("CONNECTED");
        });

        expect(mockSendControlMessage).toHaveBeenCalledWith({
            type: "session_bind",
            session_id: "session-1",
        });
    });

    it("allows continuing conversation via text input", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
            new Response(JSON.stringify(sessionDetail), { status: 200 })
        ));

        render(<SessionDetailPanel sessionId="session-1" />);

        await waitFor(() => {
            expect(screen.getByTestId("session-messages")).toBeTruthy();
        });

        act(() => {
            capturedOnStatusChange?.("CONNECTED");
        });

        const input = screen.getByTestId("text-input") as HTMLInputElement;
        const sendBtn = screen.getByTestId("send-button");

        fireEvent.change(input, { target: { value: "follow up question" } });
        fireEvent.click(sendBtn);

        expect(mockSendTextMessage).toHaveBeenCalledWith("follow up question");

        const messages = screen.getByTestId("session-messages");
        expect(messages.textContent).toContain("follow up question");
    });

    it("shows streaming AI response and completes it", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
            new Response(JSON.stringify(sessionDetail), { status: 200 })
        ));

        render(<SessionDetailPanel sessionId="session-1" />);

        await waitFor(() => {
            expect(screen.getByTestId("session-messages")).toBeTruthy();
        });

        act(() => {
            capturedOnStatusChange?.("CONNECTED");
        });

        act(() => {
            capturedOnMessage?.({ type: "transcript", text: "Thinking..." });
        });

        expect(screen.getByTestId("streaming-text").textContent).toContain("Thinking...");

        act(() => {
            capturedOnMessage?.({ type: "turn_complete", text: "Here is my answer." });
        });

        expect(screen.queryByTestId("streaming-text")).toBeNull();
        expect(screen.getByTestId("session-messages").textContent).toContain("Here is my answer.");
    });
});
