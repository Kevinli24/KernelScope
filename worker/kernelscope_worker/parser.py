import json
import math
from typing import Any

REQUIRED_FIELDS = {
    "correct": bool,
    "actual_result": (int, float),
    "expected_result": (int, float),
    "relative_error": (int, float),
    "average_latency_ms": (int, float),
    "effective_bandwidth_gbps": (int, float),
    "throughput_elements_per_second": (int, float),
    "gpu": dict,
    "configuration": dict,
}


class BenchmarkOutputError(ValueError):
    """Raised when a benchmark violates the structured-output contract."""


def parse_benchmark_output(stdout: str) -> dict[str, Any]:
    lines = [line.strip() for line in stdout.splitlines() if line.strip()]
    if not lines:
        raise BenchmarkOutputError("benchmark produced no output")
    try:
        payload = json.loads(lines[-1])
    except json.JSONDecodeError as error:
        raise BenchmarkOutputError("last output line is not valid JSON") from error
    if not isinstance(payload, dict):
        raise BenchmarkOutputError("benchmark output must be a JSON object")
    for field, expected_type in REQUIRED_FIELDS.items():
        if field not in payload or not isinstance(payload[field], expected_type):
            raise BenchmarkOutputError(f"missing or invalid field: {field}")
    for field in (
        "actual_result",
        "expected_result",
        "relative_error",
        "average_latency_ms",
        "effective_bandwidth_gbps",
        "throughput_elements_per_second",
    ):
        if not math.isfinite(float(payload[field])):
            raise BenchmarkOutputError(f"non-finite metric: {field}")
    if payload["average_latency_ms"] <= 0 or payload["relative_error"] < 0:
        raise BenchmarkOutputError("latency must be positive and relative error non-negative")
    gpu = payload["gpu"]
    if not isinstance(gpu.get("name"), str) or not isinstance(gpu.get("cuda_version"), str):
        raise BenchmarkOutputError("gpu.name and gpu.cuda_version are required")
    return payload
