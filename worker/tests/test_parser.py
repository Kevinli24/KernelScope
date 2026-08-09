import json

import pytest

from kernelscope_worker.parser import BenchmarkOutputError, parse_benchmark_output


def valid_payload():
    return {
        "correct": True,
        "actual_result": 42.0,
        "expected_result": 42.0,
        "relative_error": 0.0,
        "average_latency_ms": 0.5,
        "effective_bandwidth_gbps": 120.0,
        "throughput_elements_per_second": 2e9,
        "gpu": {"name": "Test GPU", "cuda_version": "13.0"},
        "configuration": {"input_size": 1024},
    }


def test_parses_last_nonempty_json_line():
    parsed = parse_benchmark_output("diagnostic\n" + json.dumps(valid_payload()) + "\n")
    assert parsed["correct"] is True


@pytest.mark.parametrize(
    "output, expected",
    [
        ("", "no output"),
        ("not json", "not valid JSON"),
        (json.dumps({}), "missing or invalid field"),
        (json.dumps({**valid_payload(), "average_latency_ms": 0}), "latency must be positive"),
    ],
)
def test_rejects_invalid_output(output, expected):
    with pytest.raises(BenchmarkOutputError, match=expected):
        parse_benchmark_output(output)
