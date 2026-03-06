export type AudioChunkHandler = (chunk: ArrayBuffer) => void;

export type AudioRecorder = {
    start: () => Promise<void>;
    stop: () => void;
};

export function createAudioRecorder(
    stream: MediaStream,
    onChunk: AudioChunkHandler
): AudioRecorder {
    const mediaRecorder = new MediaRecorder(stream, {
        mimeType: "audio/webm;codecs=opus",
    });

    mediaRecorder.ondataavailable = async (event) => {
        if (event.data && event.data.size > 0) {
            const buffer = await event.data.arrayBuffer();
            onChunk(buffer);
        }
    };

    return {
        async start() {
            mediaRecorder.start(250);
        },
        stop() {
            if (mediaRecorder.state !== "inactive") {
                mediaRecorder.stop();
            }
        },
    };
}