#!/usr/bin/env bash
set -euo pipefail
variant="${1:-optimized}"
input_size="${2:-1048576}"
block_size="${3:-256}"
warmups="${4:-5}"
trials="${5:-20}"
"${BENCHMARK_BINARY:-./build/benchmarks/reduction_benchmark}" \
  --variant "$variant" --input-size "$input_size" --block-size "$block_size" \
  --warmups "$warmups" --trials "$trials"

