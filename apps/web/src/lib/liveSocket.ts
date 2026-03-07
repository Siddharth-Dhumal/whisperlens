export type LiveSocketStatus =
    | "DISCONNECTED"
    | "CONNECTING"
    | "CONNECTED"
    | "ERROR";

export type LiveSocketMessage =
    | {
        type: "audio_ack";
        chunk_size: number;
        total_bytes_received: number;
    }
    | {
        type: "text_ack";
        message: string;
    };

export type LiveSocketClient = {
    connect: () => void;
    disconnect: () => void;
    sendAudioChunk: (chunk: ArrayBuffer) => void;
    sendTextMessage: (message: string) => void;
};

type CreateLiveSocketClientArgs = {
    socketUrl: string;
    onStatusChange: (status: LiveSocketStatus) => void;
    onMessage: (message: LiveSocketMessage) => void;
    onError: (message: string) => void;
};

export function createLiveSocketClient({
    socketUrl,
    onStatusChange,
    onMessage,
    onError,
}: CreateLiveSocketClientArgs): LiveSocketClient {
    let socket: WebSocket | null = null;

    function connect() {
        if (socket && socket.readyState === WebSocket.OPEN) {
            return;
        }

        onStatusChange("CONNECTING");

        socket = new WebSocket(socketUrl);

        socket.onopen = () => {
            onStatusChange("CONNECTED");
        };

        socket.onmessage = (event) => {
            try {
                const parsed = JSON.parse(event.data) as LiveSocketMessage;
                onMessage(parsed);
            } catch {
                onError("Failed to parse websocket message");
                onStatusChange("ERROR");
            }
        };

        socket.onerror = () => {
            onError("WebSocket error");
            onStatusChange("ERROR");
        };

        socket.onclose = () => {
            onStatusChange("DISCONNECTED");
        };
    }

    function disconnect() {
        if (socket) {
            socket.close();
            socket = null;
        }
    }

    function sendAudioChunk(chunk: ArrayBuffer) {
        if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send(chunk);
        }
    }

    function sendTextMessage(message: string) {
        if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send(message);
        }
    }

    return {
        connect,
        disconnect,
        sendAudioChunk,
        sendTextMessage,
    };
}