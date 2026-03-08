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


def test_settings_from_env():
    """Settings should be overridden by environment variables."""
    env = {
        "OLLAMA_BASE_URL": "http://gpu-box:11434",
        "OLLAMA_MODEL": "mistral",
    }
    with mock.patch.dict(os.environ, env, clear=True):
        s = Settings()
    assert s.ollama_base_url == "http://gpu-box:11434"
    assert s.ollama_model == "mistral"
