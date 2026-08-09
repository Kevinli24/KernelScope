import json
import socket
from collections.abc import Iterator
from contextlib import contextmanager
from typing import Any

import psycopg
from psycopg.rows import dict_row

from .models import Job

CLAIM_SQL = """
WITH next_job AS (
  SELECT j.id
  FROM benchmark_jobs j
  WHERE j.status = 'queued'
  ORDER BY j.created_at
  FOR UPDATE SKIP LOCKED
  LIMIT 1
)
UPDATE benchmark_jobs j
SET status = 'running', started_at = NOW(), claimed_by = %s
FROM next_job
WHERE j.id = next_job.id
RETURNING j.id, j.input_size, j.block_size, j.warmup_count, j.trial_count,
          j.git_commit_hash, j.kernel_id
"""


class JobStore:
    def __init__(self, database_url: str, worker_id: str | None = None):
        self.database_url = database_url
        self.worker_id = worker_id or socket.gethostname()

    @contextmanager
    def connection(self) -> Iterator[psycopg.Connection[Any]]:
        with psycopg.connect(self.database_url, row_factory=dict_row) as connection:
            yield connection

    def claim(self) -> Job | None:
        with self.connection() as connection, connection.transaction():
            row = connection.execute(CLAIM_SQL, (self.worker_id,)).fetchone()
            if row is None:
                return None
            kernel = connection.execute(
                "SELECT slug, executable FROM kernels WHERE id = %s AND enabled",
                (row["kernel_id"],),
            ).fetchone()
            if kernel is None:
                raise RuntimeError("queued job references a missing or disabled kernel")
            return Job(
                id=str(row["id"]),
                kernel_slug=kernel["slug"],
                executable=kernel["executable"],
                input_size=int(row["input_size"]),
                block_size=row["block_size"],
                warmup_count=row["warmup_count"],
                trial_count=row["trial_count"],
                git_commit_hash=row["git_commit_hash"],
            )

    def complete(self, job: Job, result: dict[str, Any]) -> None:
        gpu = result["gpu"]
        fingerprint = (
            f"{gpu['name']}|{gpu['cuda_version']}|{gpu.get('driver_version', '')}|"
            f"{gpu.get('compute_capability', '')}|{gpu.get('total_memory_bytes', '')}"
        )
        with self.connection() as connection, connection.transaction():
            hardware = connection.execute(
                """INSERT INTO hardware_information
                     (fingerprint, gpu_name, cuda_version, compute_capability, driver_version,
                      total_memory_bytes, raw_info)
                   VALUES (%s, %s, %s, %s, %s, %s, %s::jsonb)
                   ON CONFLICT (fingerprint) DO UPDATE SET raw_info = EXCLUDED.raw_info
                   RETURNING id""",
                (
                    fingerprint,
                    gpu["name"],
                    gpu["cuda_version"],
                    gpu.get("compute_capability"),
                    gpu.get("driver_version"),
                    gpu.get("total_memory_bytes"),
                    json.dumps(gpu),
                ),
            ).fetchone()
            connection.execute(
                """INSERT INTO benchmark_results
                     (job_id, hardware_id, correct, actual_result, expected_result, relative_error,
                      average_latency_ms, effective_bandwidth_gbps,
                      throughput_elements_per_second, raw_output)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb)""",
                (
                    job.id,
                    hardware["id"],
                    result["correct"],
                    result["actual_result"],
                    result["expected_result"],
                    result["relative_error"],
                    result["average_latency_ms"],
                    result["effective_bandwidth_gbps"],
                    result["throughput_elements_per_second"],
                    json.dumps(result),
                ),
            )
            connection.execute(
                """UPDATE benchmark_jobs
                   SET status = 'completed', completed_at = NOW(), failure_message = NULL
                   WHERE id = %s AND status = 'running'""",
                (job.id,),
            )
            self._compare_to_baseline(connection, job.id)

    def _compare_to_baseline(self, connection: psycopg.Connection[Any], job_id: str) -> None:
        connection.execute(
            """INSERT INTO performance_comparisons
                 (baseline_job_id, current_job_id, latency_change_percent,
                  bandwidth_change_percent, throughput_change_percent,
                  is_regression, threshold_percent)
               SELECT k.baseline_job_id, current.job_id,
                 100.0 * (current.average_latency_ms - baseline.average_latency_ms)
                   / baseline.average_latency_ms,
                 100.0 * (current.effective_bandwidth_gbps - baseline.effective_bandwidth_gbps)
                   / baseline.effective_bandwidth_gbps,
                 100.0 * (current.throughput_elements_per_second
                   - baseline.throughput_elements_per_second)
                   / baseline.throughput_elements_per_second,
                 current.average_latency_ms > baseline.average_latency_ms * 1.05,
                 5.0
               FROM benchmark_jobs j
               JOIN kernels k ON k.id = j.kernel_id
               JOIN benchmark_results current ON current.job_id = j.id
               JOIN benchmark_results baseline ON baseline.job_id = k.baseline_job_id
               JOIN benchmark_jobs baseline_job ON baseline_job.id = k.baseline_job_id
               WHERE j.id = %s AND k.baseline_job_id IS NOT NULL
                 AND k.baseline_job_id <> j.id
                 AND current.hardware_id = baseline.hardware_id
                 AND j.input_size = baseline_job.input_size
                 AND j.block_size = baseline_job.block_size
                 AND j.warmup_count = baseline_job.warmup_count
                 AND j.trial_count = baseline_job.trial_count
               ON CONFLICT (baseline_job_id, current_job_id) DO NOTHING""",
            (job_id,),
        )

    def fail(self, job_id: str, message: str) -> None:
        safe_message = message[:2000]
        with self.connection() as connection:
            connection.execute(
                """UPDATE benchmark_jobs SET status = 'failed', completed_at = NOW(),
                     failure_message = %s WHERE id = %s AND status = 'running'""",
                (safe_message, job_id),
            )
