#!/usr/bin/env bash
set -e

python3 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
pip install -r requirements-dev.txt

uvicorn app.main:app --reload --host 0.0.0.0 --port 8000