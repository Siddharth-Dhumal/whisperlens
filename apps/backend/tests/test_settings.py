"""Tests for app.settings."""

import os
from unittest import mock

from app.settings import Settings


def test_settings_defaults():
    """Settings should have sensible defaults when env vars are absent."""
    with mock.patch.dict(os.environ, {}, clear=True):
        s = Settings()
    assert s.ollama_base_url == "http://localhost:11434"
    assert s.ollama_model == "llama3.2"
    assert s.ollama_vision_model == "moondream"
    assert s.stt_model == "base"
    assert s.db_path == "whisperlens.db"


def test_settings_from_env():
    """Settings should be overridden by environment variables."""
    env = {
        "OLLAMA_BASE_URL": "http://gpu-box:11434",
        "OLLAMA_MODEL": "mistral",
        "OLLAMA_VISION_MODEL": "llava",
        "STT_MODEL": "tiny",
        "DB_PATH": "/tmp/test.db",
    }
    with mock.patch.dict(os.environ, env, clear=True):
        s = Settings()
    assert s.ollama_base_url == "http://gpu-box:11434"
    assert s.ollama_model == "mistral"
    assert s.ollama_vision_model == "llava"
    assert s.stt_model == "tiny"
    assert s.db_path == "/tmp/test.db"
