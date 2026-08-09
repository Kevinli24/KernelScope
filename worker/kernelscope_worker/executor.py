import hashlib
import json
import os
import subprocess
from pathlib import Path
from typing import Any

from .models import Job
from .parser import parse_benchmark_output

KERNEL_VARIANTS = {
    "reduction-naive": "naive",
    "reduction-optimized": "optimized",
    "reduction-cub": "cub",
}


def build_command(job: Job, benchmark_dir: Path) -> list[str]:
    variant = KERNEL_VARIANTS.get(job.kernel_slug)
    if variant is None:
        raise ValueError(f"unregistered kernel slug: {job.kernel_slug}")
    executable = benchmark_dir / job.executable
    if executable.name != "reduction_benchmark":
        raise ValueError("kernel executable is not allowlisted")
    return [
        str(executable),
        "--variant",
        variant,
        "--input-size",
        str(job.input_size),
        "--block-size",
        str(job.block_size),
        "--warmups",
        str(job.warmup_count),
        "--trials",
        str(job.trial_count),
    ]


def mock_result(job: Job) -> dict[str, Any]:
    variant_factor = {"reduction-naive": 1.0, "reduction-optimized": 0.42, "reduction-cub": 0.35}
    if job.kernel_slug not in variant_factor:
        raise ValueError(f"unregistered kernel slug: {job.kernel_slug}")
    seed_text = f"{job.kernel_slug}:{job.input_size}:{job.block_size}:{job.git_commit_hash}"
    seed = int(hashlib.sha256(seed_text.encode()).hexdigest()[:8], 16)
    stable_jitter = 0.94 + (seed % 1201) / 10_000
    latency_ms = max(
        0.008,
        job.input_size / 55_000_000 * variant_factor[job.kernel_slug] * stable_jitter,
    )
    bytes_processed = job.input_size * 4
    expected = float(job.input_size)
    return {
        "schema_version": 1,
        "kernel": job.kernel_slug,
        "correct": True,
        "actual_result": expected,
        "expected_result": expected,
        "relative_error": 0.0,
        "average_latency_ms": latency_ms,
        "effective_bandwidth_gbps": bytes_processed / (latency_ms / 1000) / 1e9,
        "throughput_elements_per_second": job.input_size / (latency_ms / 1000),
        "gpu": {
            "name": "KernelScope Deterministic Mock GPU",
            "cuda_version": "mock-1.0",
            "compute_capability": "mock",
            "driver_version": "mock",
            "total_memory_bytes": 8_589_934_592,
        },
        "configuration": {
            "input_size": job.input_size,
            "block_size": job.block_size,
            "warmup_count": job.warmup_count,
            "trial_count": job.trial_count,
            "git_commit_hash": job.git_commit_hash,
        },
        "mode": "mock",
    }


def execute(job: Job, mode: str, benchmark_dir: Path) -> dict[str, Any]:
    if mode == "mock":
        return mock_result(job)
    if mode != "real":
        raise ValueError('GPU_MODE must be either "mock" or "real"')
    command = build_command(job, benchmark_dir)
    timeout = int(os.environ.get("BENCHMARK_TIMEOUT_SECONDS", "300"))
    completed = subprocess.run(  # noqa: S603 - command is fully allowlisted above
        command,
        check=True,
        capture_output=True,
        text=True,
        timeout=timeout,
        shell=False,
    )
    result = parse_benchmark_output(completed.stdout)
    if result.get("kernel") != job.kernel_slug:
        raise ValueError("benchmark reported a different kernel than the claimed job")
    configuration = result["configuration"]
    expected_configuration = {
        "input_size": job.input_size,
        "block_size": job.block_size,
        "warmup_count": job.warmup_count,
        "trial_count": job.trial_count,
    }
    for field, expected in expected_configuration.items():
        if configuration.get(field) != expected:
            raise ValueError(f"benchmark reported a mismatched configuration field: {field}")
    configuration["git_commit_hash"] = job.git_commit_hash
    return result


def serialize_result(result: dict[str, Any]) -> str:
    return json.dumps(result, separators=(",", ":"), allow_nan=False)
