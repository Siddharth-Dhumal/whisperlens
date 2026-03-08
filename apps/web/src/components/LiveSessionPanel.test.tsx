import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import LiveSessionPanel from "./LiveSessionPanel";

/* ------------------------------------------------------------------
 * Stub out modules that need browser APIs unavailable in jsdom
 * ----------------------------------------------------------------*/

// Capture the onMessage callback so we can simulate server messages
let capturedOnMessage: ((msg: Record<string, unknown>) => void) | null = null;
let capturedOnStatusChange: ((status: string) => void) | null = null;

const mockSendTextMessage = vi.fn();
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
    mockConnect.mockClear();
    mockDisconnect.mockClear();
});

afterEach(() => {
    vi.restoreAllMocks();
});

/* ------------------------------------------------------------------
 * Helpers
 * ----------------------------------------------------------------*/

function renderAndConnect() {
    render(<LiveSessionPanel />);
    // Simulate socket becoming connected
    act(() => {
        capturedOnStatusChange?.("CONNECTED");
    });
}

/* ------------------------------------------------------------------
 * Tests
 * ----------------------------------------------------------------*/

describe("LiveSessionPanel message handling", () => {
    it("displays transcript chunks as they stream in", () => {
        renderAndConnect();

        act(() => {
            capturedOnMessage?.({ type: "transcript", text: "Hello " });
        });

        const streaming = screen.getByTestId("streaming-text");
        expect(streaming.textContent).toContain("Hello ");

        act(() => {
            capturedOnMessage?.({ type: "transcript", text: "world!" });
        });

        expect(streaming.textContent).toContain("Hello world!");
    });

    it("moves completed response to chat history on turn_complete", () => {
        renderAndConnect();

        // Stream a chunk
        act(() => {
            capturedOnMessage?.({ type: "transcript", text: "Hello world!" });
        });

        // Complete the turn
        act(() => {
            capturedOnMessage?.({ type: "turn_complete", text: "Hello world!" });
        });

        // Streaming indicator should be gone
        expect(screen.queryByTestId("streaming-text")).toBeNull();

        // Chat log should show the completed response
        const chatLog = screen.getByTestId("chat-log");
        expect(chatLog.textContent).toContain("AI:");
        expect(chatLog.textContent).toContain("Hello world!");
    });

    it("shows error state when an error message arrives", () => {
        renderAndConnect();

        act(() => {
            capturedOnMessage?.({ type: "error", message: "Model not found" });
        });

        // Error should be visible in the state label
        expect(screen.getByText(/ERROR.*Model not found/)).toBeTruthy();
    });

    it("sends text input over the websocket", () => {
        renderAndConnect();

        const input = screen.getByTestId("text-input") as HTMLInputElement;
        const sendBtn = screen.getByTestId("send-button");

        fireEvent.change(input, { target: { value: "hello" } });
        fireEvent.click(sendBtn);

        expect(mockSendTextMessage).toHaveBeenCalledWith("hello");

        // Input should be cleared after send
        expect(input.value).toBe("");

        // User message should appear in chat
        const chatLog = screen.getByTestId("chat-log");
        expect(chatLog.textContent).toContain("You:");
        expect(chatLog.textContent).toContain("hello");
    });
});
