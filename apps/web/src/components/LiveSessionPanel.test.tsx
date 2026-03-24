import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import LiveSessionPanel from "./LiveSessionPanel";

/* ------------------------------------------------------------------
 * Stub out modules that need browser APIs unavailable in jsdom
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
 * Helpers
 * ----------------------------------------------------------------*/

function renderAndConnect() {
    render(<LiveSessionPanel />);
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

        act(() => {
            capturedOnMessage?.({ type: "transcript", text: "Hello world!" });
        });

        act(() => {
            capturedOnMessage?.({ type: "turn_complete", text: "Hello world!" });
        });

        expect(screen.queryByTestId("streaming-text")).toBeNull();

        const chatLog = screen.getByTestId("chat-log");
        expect(chatLog.textContent).toContain("WhisperLens");
        expect(chatLog.textContent).toContain("Hello world!");
    });

    it("shows error state when an error message arrives", () => {
        renderAndConnect();

        act(() => {
            capturedOnMessage?.({ type: "error", message: "Model not found" });
        });

        const errorEl = screen.getByTestId("error-message");
        expect(errorEl.textContent).toContain("Model not found");
    });

    it("sends text input over the websocket", () => {
        renderAndConnect();

        const input = screen.getByTestId("text-input") as HTMLInputElement;
        const sendBtn = screen.getByTestId("send-button");

        fireEvent.change(input, { target: { value: "hello" } });
        fireEvent.click(sendBtn);

        expect(mockSendTextMessage).toHaveBeenCalledWith("hello");
        expect(input.value).toBe("");

        const chatLog = screen.getByTestId("chat-log");
        expect(chatLog.textContent).toContain("You");
        expect(chatLog.textContent).toContain("hello");
    });

    it("shows stt_result as user message in chat", () => {
        renderAndConnect();

        act(() => {
            capturedOnMessage?.({ type: "stt_result", text: "hello from voice" });
        });

        const chatLog = screen.getByTestId("chat-log");
        expect(chatLog.textContent).toContain("You");
        expect(chatLog.textContent).toContain("hello from voice");
    });

    it("sends session_bind on connect when sessionId exists", () => {
        renderAndConnect();

        act(() => {
            capturedOnMessage?.({ type: "session_created", session_id: "existing-abc" });
        });

        mockSendControlMessage.mockClear();

        act(() => {
            capturedOnStatusChange?.("CONNECTED");
        });

        expect(mockSendControlMessage).toHaveBeenCalledWith({
            type: "session_bind",
            session_id: "existing-abc",
        });
    });

    it("sends session_bind after vision response while ws connected", async () => {
        const fakeStream = { getTracks: () => [] };
        Object.defineProperty(navigator, "mediaDevices", {
            value: { getUserMedia: vi.fn().mockResolvedValue(fakeStream) },
            writable: true,
        });

        renderAndConnect();

        const cameraBtn = screen.getByTestId("camera-toggle");
        await act(async () => {
            fireEvent.click(cameraBtn);
        });

        const mockCtx = { drawImage: vi.fn() };
        vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
            mockCtx as unknown as CanvasRenderingContext2D
        );
        vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue(
            "data:image/jpeg;base64,AAAA"
        );

        const video = document.querySelector("video");
        if (video) {
            Object.defineProperty(video, "videoWidth", { value: 640 });
            Object.defineProperty(video, "videoHeight", { value: 480 });
        }

        const captureBtn = screen.getByTestId("capture-button");
        fireEvent.click(captureBtn);

        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue({
                ok: true,
                json: async () => ({ answer: "I see something", session_id: "vision-sid-123" }),
            })
        );

        mockSendControlMessage.mockClear();

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

        act(() => {
            capturedOnMessage?.({ type: "turn_complete", text: "Done!" });
        });
        expect(onTurnSaved).not.toHaveBeenCalled();

        act(() => {
            capturedOnMessage?.({ type: "turn_saved" });
        });
        expect(onTurnSaved).toHaveBeenCalledTimes(1);
    });

    it("surfaces backend detail on vision error response", async () => {
        const fakeStream = { getTracks: () => [] };
        Object.defineProperty(navigator, "mediaDevices", {
            value: { getUserMedia: vi.fn().mockResolvedValue(fakeStream) },
            writable: true,
        });

        renderAndConnect();

        await act(async () => {
            fireEvent.click(screen.getByTestId("camera-toggle"));
        });

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

        fireEvent.click(screen.getByTestId("capture-button"));

        vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
            ok: false,
            status: 502,
            json: async () => ({ detail: "Vision request timed out. The model may be loading or the image too large." }),
        }));

        await act(async () => {
            fireEvent.click(screen.getByTestId("send-button"));
        });

        const errorEl = screen.getByTestId("error-message");
        expect(errorEl.textContent).toContain("timed out");
        expect(errorEl.textContent).not.toContain("HTTP 502");
    });

    it("clears stale error after successful vision response", async () => {
        const fakeStream = { getTracks: () => [] };
        Object.defineProperty(navigator, "mediaDevices", {
            value: { getUserMedia: vi.fn().mockResolvedValue(fakeStream) },
            writable: true,
        });

        renderAndConnect();

        vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));
        await act(async () => {
            fireEvent.click(screen.getByTestId("camera-toggle"));
        });

        act(() => {
            capturedOnMessage?.({ type: "error", message: "No audio data received" });
        });
        expect(screen.getByTestId("error-message")).toBeTruthy();

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

        fireEvent.click(screen.getByTestId("capture-button"));

        vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ answer: "A cat.", session_id: "s1" }),
        }));

        await act(async () => {
            fireEvent.click(screen.getByTestId("send-button"));
        });

        expect(screen.queryByTestId("error-message")).toBeNull();
    });

    it("shows a lightweight source hint under an assistant reply when turn_complete includes source_info", () => {
        renderAndConnect();

        act(() => {
            capturedOnMessage?.({
                type: "turn_complete",
                text: "A process is a program in execution.",
                source_info: {
                    matched: true,
                    match_count: 2,
                    source_titles: ["Operating Systems Notes"],
                },
            });
        });

        const chatLog = screen.getByTestId("chat-log");
        expect(chatLog.textContent).toContain("A process is a program in execution.");
        expect(chatLog.textContent).toContain(
            "Used 2 study chunks from Operating Systems Notes"
        );
    });

    it("does not show a source hint when turn_complete source_info reports no match", () => {
        renderAndConnect();

        act(() => {
            capturedOnMessage?.({
                type: "turn_complete",
                text: "I could not find a relevant match in your study sources.",
                source_info: { matched: false, match_count: 0, source_titles: [] },
            });
        });

        const chatLog = screen.getByTestId("chat-log");
        expect(chatLog.textContent).toContain(
            "I could not find a relevant match in your study sources."
        );
        expect(screen.queryByText(/Used study source:/i)).toBeNull();
        expect(screen.queryByText(/Used \d+ study chunks from/i)).toBeNull();
    });

    it("shows a compact multi-source hint when matches come from more than one study source", () => {
        renderAndConnect();

        act(() => {
            capturedOnMessage?.({
                type: "turn_complete",
                text: "Processes and threads are related but not the same.",
                source_info: {
                    matched: true,
                    match_count: 3,
                    source_titles: ["Operating Systems Notes", "Concurrency Notes"],
                },
            });
        });

        const chatLog = screen.getByTestId("chat-log");
        expect(chatLog.textContent).toContain(
            "Processes and threads are related but not the same."
        );
        expect(chatLog.textContent).toContain(
            "Used 3 study chunks from Operating Systems Notes and 1 other source"
        );
    });

    it("does not show a source hint when turn_complete has no source_info", () => {
        renderAndConnect();

        act(() => {
            capturedOnMessage?.({
                type: "turn_complete",
                text: "Here is a normal assistant reply without grounding metadata.",
            });
        });

        const chatLog = screen.getByTestId("chat-log");
        expect(chatLog.textContent).toContain(
            "Here is a normal assistant reply without grounding metadata."
        );
        expect(screen.queryByText(/Used study source:/i)).toBeNull();
        expect(screen.queryByText(/Used \d+ study chunks from/i)).toBeNull();
    });
});
