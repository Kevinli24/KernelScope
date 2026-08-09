from pathlib import Path

import pytest

from kernelscope_worker.executor import build_command, execute, mock_result
from kernelscope_worker.models import Job


def make_job(**changes):
    values = {
        "id": "job-1",
        "kernel_slug": "reduction-optimized",
        "executable": "reduction_benchmark",
        "input_size": 1_048_576,
        "block_size": 256,
        "warmup_count": 5,
        "trial_count": 20,
        "git_commit_hash": "abcdef1",
    }
    values.update(changes)
    return Job(**values)


def test_mock_is_deterministic_and_has_exact_configuration():
    first = mock_result(make_job())
    second = mock_result(make_job())
    assert first == second
    assert first["configuration"]["input_size"] == 1_048_576
    assert first["mode"] == "mock"


def test_command_is_argument_array_for_allowlisted_binary():
    command = build_command(make_job(), Path("/benchmarks"))
    assert command == [
        str(Path("/benchmarks") / "reduction_benchmark"),
        "--variant",
        "optimized",
        "--input-size",
        "1048576",
        "--block-size",
        "256",
        "--warmups",
        "5",
        "--trials",
        "20",
    ]


@pytest.mark.parametrize(
    "changes",
    [
        {"kernel_slug": "../../bin/sh"},
        {"executable": "reduction_benchmark;curl evil"},
    ],
)
def test_rejects_unregistered_execution(changes):
    with pytest.raises(ValueError):
        build_command(make_job(**changes), Path("/benchmarks"))


def test_real_execution_rejects_mismatched_structured_configuration(monkeypatch):
    payload = mock_result(make_job())
    payload["kernel"] = "reduction-optimized"
    payload["configuration"]["input_size"] = 1024

    class Completed:
        stdout = __import__("json").dumps(payload)

    monkeypatch.setattr("subprocess.run", lambda *args, **kwargs: Completed())
    with pytest.raises(ValueError, match="mismatched configuration"):
        execute(make_job(), "real", Path("/benchmarks"))
