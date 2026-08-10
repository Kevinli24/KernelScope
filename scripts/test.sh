#!/usr/bin/env bash
set -euo pipefail
npm test
npm run build
npm run lint
python3 -m pytest worker/tests
python3 -m ruff check worker
python3 -m ruff format --check worker

