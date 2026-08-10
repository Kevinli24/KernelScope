#!/usr/bin/env bash
set -euo pipefail
export GPU_MODE="${GPU_MODE:-mock}"
docker compose up --build

