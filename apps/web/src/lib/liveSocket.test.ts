import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
    createLiveSocketClient,
    type LiveSocketMessage,
} from "./liveSocket";

/* ------------------------------------------------------------------
 * Minimal WebSocket mock
 * ----------------------------------------------------------------*/

type MockSocket = {
    onopen: (() => void) | null;
    onmessage: ((event: { data: string }) => void) | null;
    onerror: (() => void) | null;
    onclose: (() => void) | null;
    send: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
    readyState: number;
};

let mockSocket: MockSocket;

beforeEach(() => {
    mockSocket = {
        onopen: null,
        onmessage: null,
        onerror: null,
        onclose: null,
        send: vi.fn(),
        close: vi.fn(),
        readyState: 1, // WebSocket.OPEN
    };

    // WebSocket is called with `new`, so we need a function that acts as a constructor
    const FakeWebSocket = function () {
        return mockSocket;
    } as unknown as typeof WebSocket;
    Object.defineProperty(FakeWebSocket, "OPEN", { value: 1 });

    vi.stubGlobal("WebSocket", FakeWebSocket);
});

afterEach(() => {
    vi.restoreAllMocks();
});

/* ------------------------------------------------------------------
 * Tests
 * ----------------------------------------------------------------*/

describe("liveSocket message handling", () => {
    it("dispatches transcript messages via onMessage", () => {
        const onMessage = vi.fn();
        const client = createLiveSocketClient({
            socketUrl: "ws://localhost:8000/ws/live",
            onStatusChange: vi.fn(),
            onMessage,
            onError: vi.fn(),
        });

        client.connect();
        mockSocket.onopen?.();

        const payload: LiveSocketMessage = { type: "transcript", text: "Hello" };
        mockSocket.onmessage?.({ data: JSON.stringify(payload) });

        expect(onMessage).toHaveBeenCalledWith(payload);
    });

    it("dispatches turn_complete messages via onMessage", () => {
        const onMessage = vi.fn();
        const client = createLiveSocketClient({
            socketUrl: "ws://localhost:8000/ws/live",
            onStatusChange: vi.fn(),
            onMessage,
            onError: vi.fn(),
        });

        client.connect();
        mockSocket.onopen?.();

        const payload: LiveSocketMessage = {
            type: "turn_complete",
            text: "Hello world!",
        };
        mockSocket.onmessage?.({ data: JSON.stringify(payload) });

        expect(onMessage).toHaveBeenCalledWith(payload);
    });

    it("dispatches error messages via onMessage", () => {
        const onMessage = vi.fn();
        const client = createLiveSocketClient({
            socketUrl: "ws://localhost:8000/ws/live",
            onStatusChange: vi.fn(),
            onMessage,
            onError: vi.fn(),
        });

        client.connect();
        mockSocket.onopen?.();

        const payload: LiveSocketMessage = {
            type: "error",
            message: "Model not found",
        };
        mockSocket.onmessage?.({ data: JSON.stringify(payload) });

        expect(onMessage).toHaveBeenCalledWith(payload);
    });

    it("calls onError for malformed JSON", () => {
        const onError = vi.fn();
        const onStatusChange = vi.fn();
        const client = createLiveSocketClient({
            socketUrl: "ws://localhost:8000/ws/live",
            onStatusChange,
            onMessage: vi.fn(),
            onError,
        });

        client.connect();
        mockSocket.onopen?.();

        mockSocket.onmessage?.({ data: "not json" });

        expect(onError).toHaveBeenCalledWith("Failed to parse websocket message");
        expect(onStatusChange).toHaveBeenCalledWith("ERROR");
    });

    it("sends text via sendTextMessage", () => {
        const client = createLiveSocketClient({
            socketUrl: "ws://localhost:8000/ws/live",
            onStatusChange: vi.fn(),
            onMessage: vi.fn(),
            onError: vi.fn(),
        });

        client.connect();
        mockSocket.onopen?.();

        client.sendTextMessage("hello");

        expect(mockSocket.send).toHaveBeenCalledWith("hello");
    });
});
