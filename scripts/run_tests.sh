#!/usr/bin/env bash
set -euo pipefail

# ensure venv installed dependencies
pip install -r requirements.txt
pip install pytest pytest-cov

# run tests
pytest -v --maxfail=1
