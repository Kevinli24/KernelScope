#!/usr/bin/env python3
"""Black-box smoke test for a running KernelScope mock-mode stack."""

import json
import os
import time
import urllib.error
import urllib.request

API_URL = os.environ.get("KERNELSCOPE_API_URL", "http://localhost:3001")


def request(path: str, method: str = "GET", payload: dict | None = None):
    data = json.dumps(payload).encode() if payload is not None else None
    headers = {"Content-Type": "application/json"} if data else {}
    with urllib.request.urlopen(
        urllib.request.Request(
            f"{API_URL}{path}", data=data, headers=headers, method=method
        ),
        timeout=10,
    ) as response:
        return json.load(response)["data"]


def main() -> None:
    deadline = time.monotonic() + 90
    while True:
        try:
            kernels = request("/api/kernels")
            break
        except (urllib.error.URLError, ConnectionError):
            if time.monotonic() >= deadline:
                raise TimeoutError("KernelScope API did not become ready")
            time.sleep(1)
    kernel = next(item for item in kernels if item["slug"] == "reduction-optimized")
    job = request(
        "/api/jobs",
        "POST",
        {
            "kernelId": kernel["id"],
            "inputSize": 1048576,
            "blockSize": 256,
            "warmupCount": 2,
            "trialCount": 5,
            "gitCommitHash": "unknown",
        },
    )
    observed = [job["status"]]
    while time.monotonic() < deadline:
        job = request(f"/api/jobs/{job['id']}")
        if job["status"] not in observed:
            observed.append(job["status"])
        if job["status"] == "completed":
            break
        if job["status"] == "failed":
            raise AssertionError(job["failure_message"])
        time.sleep(0.25)
    else:
        raise TimeoutError("benchmark job did not complete")
    result = job["result"]
    assert result["correct"] is True
    assert result["average_latency_ms"] > 0
    assert result["gpu_name"] == "KernelScope Deterministic Mock GPU"
    print(f"Mock E2E passed for {job['id']}; states observed: {' -> '.join(observed)}")


if __name__ == "__main__":
    main()
