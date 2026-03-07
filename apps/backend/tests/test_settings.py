"""Tests for app.settings."""

import os
from unittest import mock

from app.settings import Settings


def test_settings_defaults():
    """Settings should have sensible defaults when env vars are absent."""
    with mock.patch.dict(os.environ, {}, clear=True):
        s = Settings()
    assert s.google_cloud_project == ""
    assert s.google_cloud_location == "global"
    assert s.google_genai_use_vertexai is True
    assert s.gemini_live_model == "gemini-2.5-flash-native-audio-preview-12-2025"


def test_settings_from_env():
    """Settings should be overridden by environment variables."""
    env = {
        "GOOGLE_CLOUD_PROJECT": "test-project",
        "GOOGLE_CLOUD_LOCATION": "us-central1",
        "GOOGLE_GENAI_USE_VERTEXAI": "false",
        "GEMINI_LIVE_MODEL": "gemini-2.5-flash-native-audio-preview-12-2025",
    }
    with mock.patch.dict(os.environ, env, clear=True):
        s = Settings()
    assert s.google_cloud_project == "test-project"
    assert s.google_cloud_location == "us-central1"
    assert s.google_genai_use_vertexai is False
    assert s.gemini_live_model == "gemini-2.5-flash-native-audio-preview-12-2025"
