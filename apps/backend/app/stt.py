"""Local speech-to-text service using faster-whisper."""

from __future__ import annotations

import logging
import os
import tempfile

logger = logging.getLogger(__name__)

# Lazy-loaded to avoid import cost at startup
_WhisperModel = None


def _get_whisper_model_class():
    global _WhisperModel
    if _WhisperModel is None:
        from faster_whisper import WhisperModel as WM
        _WhisperModel = WM
    return _WhisperModel


class SttError(Exception):
    """Raised when transcription fails."""


class SpeechToTextService:
    """Wraps faster-whisper for local speech-to-text.

    The model is loaded lazily on the first call to ``transcribe()``.

    Usage::

        stt = SpeechToTextService(model_name="base")
        text = stt.transcribe(audio_bytes)
    """

    def __init__(self, model_name: str = "base") -> None:
        self._model_name = model_name
        self._model = None

    def _ensure_model(self) -> None:
        """Load the Whisper model if not already loaded."""
        if self._model is None:
            WhisperModel = _get_whisper_model_class()
            logger.info("Loading Whisper model '%s' (first call)...", self._model_name)
            self._model = WhisperModel(self._model_name, compute_type="int8")
            logger.info("Whisper model '%s' loaded", self._model_name)

    def transcribe(self, audio_bytes: bytes) -> str:
        """Transcribe raw audio bytes to text.

        Writes audio to a temporary file, runs faster-whisper, and returns
        the joined transcript.  The temp file is always cleaned up.

        Args:
            audio_bytes: Raw audio data (webm/opus, wav, mp3, etc.).

        Returns:
            Transcribed text string.

        Raises:
            SttError: If audio is empty or transcription fails.
        """
        if not audio_bytes:
            raise SttError("No audio data to transcribe")

        self._ensure_model()

        tmp_path: str | None = None
        try:
            # Write audio to a temp file (faster-whisper needs a file path)
            fd, tmp_path = tempfile.mkstemp(suffix=".webm")
            os.write(fd, audio_bytes)
            os.close(fd)

            segments, _info = self._model.transcribe(tmp_path)
            text = " ".join(seg.text.strip() for seg in segments if seg.text.strip())

            if not text:
                raise SttError("Transcription produced no text")

            logger.info("Transcribed %d bytes → %d chars", len(audio_bytes), len(text))
            return text

        except SttError:
            raise
        except Exception as exc:
            raise SttError(f"Transcription failed: {exc}") from exc
        finally:
            # Always clean up the temp file
            if tmp_path and os.path.exists(tmp_path):
                os.unlink(tmp_path)
