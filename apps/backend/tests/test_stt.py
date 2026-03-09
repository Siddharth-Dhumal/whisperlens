"""Tests for app.stt — SpeechToTextService wrapper."""

from __future__ import annotations

import os

import pytest
from unittest.mock import MagicMock, patch

from app.stt import SpeechToTextService, SttError


class _FakeSegment:
    """Minimal stand-in for faster_whisper transcription segment."""

    def __init__(self, text: str):
        self.text = text


# ------------------------------------------------------------------
# transcribe()
# ------------------------------------------------------------------


def test_transcribe_returns_joined_text():
    """transcribe() should return joined text from all segments."""
    mock_model = MagicMock()
    mock_model.transcribe.return_value = (
        [_FakeSegment("Hello"), _FakeSegment(" world")],
        None,
    )

    with patch("app.stt._get_whisper_model_class", return_value=lambda *a, **kw: mock_model):
        stt = SpeechToTextService(model_name="base")
        result = stt.transcribe(b"fake-audio-data")

    assert result == "Hello world"
    mock_model.transcribe.assert_called_once()


def test_transcribe_empty_audio_raises():
    """transcribe() should raise SttError for empty audio."""
    stt = SpeechToTextService(model_name="base")

    with pytest.raises(SttError, match="No audio data"):
        stt.transcribe(b"")


def test_transcribe_no_text_raises():
    """transcribe() should raise SttError when transcription produces no text."""
    mock_model = MagicMock()
    mock_model.transcribe.return_value = (
        [_FakeSegment(""), _FakeSegment("   ")],
        None,
    )

    with patch("app.stt._get_whisper_model_class", return_value=lambda *a, **kw: mock_model):
        stt = SpeechToTextService(model_name="base")

        with pytest.raises(SttError, match="no text"):
            stt.transcribe(b"fake-audio-data")


def test_transcribe_model_error_raises():
    """transcribe() should raise SttError when the model throws."""
    mock_model = MagicMock()
    mock_model.transcribe.side_effect = RuntimeError("model exploded")

    with patch("app.stt._get_whisper_model_class", return_value=lambda *a, **kw: mock_model):
        stt = SpeechToTextService(model_name="base")

        with pytest.raises(SttError, match="Transcription failed"):
            stt.transcribe(b"fake-audio-data")


def test_transcribe_cleans_up_temp_file():
    """transcribe() should always remove the temp file, even on success."""
    created_paths: list[str] = []

    mock_model = MagicMock()
    mock_model.transcribe.side_effect = (
        lambda path, *a, **kw: (created_paths.append(path), ([_FakeSegment("ok")], None))[1]
    )

    with patch("app.stt._get_whisper_model_class", return_value=lambda *a, **kw: mock_model):
        stt = SpeechToTextService(model_name="base")
        stt.transcribe(b"fake-audio-data")

    assert len(created_paths) == 1
    assert not os.path.exists(created_paths[0]), "Temp file should be deleted"
