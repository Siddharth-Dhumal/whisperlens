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

    it("shows stt_result as user message in chat", () => {
        renderAndConnect();

        act(() => {
            capturedOnMessage?.({ type: "stt_result", text: "hello from voice" });
        });

        const chatLog = screen.getByTestId("chat-log");
        expect(chatLog.textContent).toContain("You:");
        expect(chatLog.textContent).toContain("hello from voice");
    });

    it("sends session_bind on connect when sessionId exists", () => {
        renderAndConnect();

        // Simulate receiving session_created from a prior turn
        act(() => {
            capturedOnMessage?.({ type: "session_created", session_id: "existing-abc" });
        });

        mockSendControlMessage.mockClear();

        // Simulate a reconnect — status goes to CONNECTED again
        act(() => {
            capturedOnStatusChange?.("CONNECTED");
        });

        expect(mockSendControlMessage).toHaveBeenCalledWith({
            type: "session_bind",
            session_id: "existing-abc",
        });
    });

    it("sends session_bind after vision response while ws connected", async () => {
        // Mock getUserMedia so camera can be granted
        const fakeStream = { getTracks: () => [] };
        Object.defineProperty(navigator, "mediaDevices", {
            value: { getUserMedia: vi.fn().mockResolvedValue(fakeStream) },
            writable: true,
        });

        renderAndConnect();

        // Grant camera permission
        const cameraBtn = screen.getByText("Enable Camera");
        await act(async () => {
            fireEvent.click(cameraBtn);
        });

        // Mock canvas so captureSnapshot works
        const mockCtx = { drawImage: vi.fn() };
        vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
            mockCtx as unknown as CanvasRenderingContext2D
        );
        vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue(
            "data:image/jpeg;base64,AAAA"
        );

        // Set videoRef dimensions so captureSnapshot proceeds
        const video = document.querySelector("video");
        if (video) {
            Object.defineProperty(video, "videoWidth", { value: 640 });
            Object.defineProperty(video, "videoHeight", { value: 480 });
        }

        // Click Capture to set snapshotData
        const captureBtn = screen.getByTestId("capture-button");
        fireEvent.click(captureBtn);

        // Mock fetch for vision endpoint
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue({
                ok: true,
                json: async () => ({ answer: "I see something", session_id: "vision-sid-123" }),
            })
        );

        mockSendControlMessage.mockClear();

        // Click Send (with snapshot attached, no text → sends vision)
        const sendBtn = screen.getByTestId("send-button");
        await act(async () => {
            fireEvent.click(sendBtn);
        });

        expect(mockSendControlMessage).toHaveBeenCalledWith({
            type: "session_bind",
            session_id: "vision-sid-123",
        });
    });

    it("calls onTurnSaved on turn_saved, not on turn_complete", () => {
        const onTurnSaved = vi.fn();
        render(<LiveSessionPanel onTurnSaved={onTurnSaved} />);
        act(() => { capturedOnStatusChange?.("CONNECTED"); });

        // turn_complete updates chat UI but does NOT call onTurnSaved
        act(() => {
            capturedOnMessage?.({ type: "turn_complete", text: "Done!" });
        });
        expect(onTurnSaved).not.toHaveBeenCalled();

        // turn_saved fires the callback
        act(() => {
            capturedOnMessage?.({ type: "turn_saved" });
        });
        expect(onTurnSaved).toHaveBeenCalledTimes(1);
    });

    it("surfaces backend detail on vision error response", async () => {
        // Mock getUserMedia so camera can be granted
        const fakeStream = { getTracks: () => [] };
        Object.defineProperty(navigator, "mediaDevices", {
            value: { getUserMedia: vi.fn().mockResolvedValue(fakeStream) },
            writable: true,
        });

        renderAndConnect();

        // Grant camera
        await act(async () => {
            fireEvent.click(screen.getByText("Enable Camera"));
        });

        // Mock canvas
        vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
            { drawImage: vi.fn() } as unknown as CanvasRenderingContext2D
        );
        vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue(
            "data:image/jpeg;base64,AAAA"
        );
        const video = document.querySelector("video");
        if (video) {
            Object.defineProperty(video, "videoWidth", { value: 640 });
            Object.defineProperty(video, "videoHeight", { value: 480 });
        }

        // Capture snapshot
        fireEvent.click(screen.getByTestId("capture-button"));

        // Mock 502 with JSON detail
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
            ok: false,
            status: 502,
            json: async () => ({ detail: "Vision request timed out. The model may be loading or the image too large." }),
        }));

        await act(async () => {
            fireEvent.click(screen.getByTestId("send-button"));
        });

        // The real detail should be shown, not just "HTTP 502"
        const errorEl = screen.getByTestId("error-message");
        expect(errorEl.textContent).toContain("timed out");
        expect(errorEl.textContent).not.toContain("HTTP 502");
    });

    it("clears stale error after successful vision response", async () => {
        // Mock getUserMedia
        const fakeStream = { getTracks: () => [] };
        Object.defineProperty(navigator, "mediaDevices", {
            value: { getUserMedia: vi.fn().mockResolvedValue(fakeStream) },
            writable: true,
        });

        renderAndConnect();

        // Grant camera (ignore warm-up fetch)
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));
        await act(async () => {
            fireEvent.click(screen.getByText("Enable Camera"));
        });

        // Inject a stale error from a prior action
        act(() => {
            capturedOnMessage?.({ type: "error", message: "No audio data received" });
        });
        expect(screen.getByTestId("error-message")).toBeTruthy();

        // Mock canvas
        vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
            { drawImage: vi.fn() } as unknown as CanvasRenderingContext2D
        );
        vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue(
            "data:image/jpeg;base64,AAAA"
        );
        const video = document.querySelector("video");
        if (video) {
            Object.defineProperty(video, "videoWidth", { value: 640 });
            Object.defineProperty(video, "videoHeight", { value: 480 });
        }

        // Capture snapshot
        fireEvent.click(screen.getByTestId("capture-button"));

        // Mock successful vision response
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ answer: "A cat.", session_id: "s1" }),
        }));

        await act(async () => {
            fireEvent.click(screen.getByTestId("send-button"));
        });

        // Error should be cleared
        expect(screen.queryByTestId("error-message")).toBeNull();
    });
});
