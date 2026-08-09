import logging
import os
import time
from pathlib import Path

from .database import JobStore
from .executor import execute

logging.basicConfig(level=os.environ.get("LOG_LEVEL", "INFO"))
LOGGER = logging.getLogger("kernelscope.worker")


def run() -> None:
    database_url = os.environ.get(
        "DATABASE_URL", "postgresql://kernelscope:kernelscope@localhost:5432/kernelscope"
    )
    mode = os.environ.get("GPU_MODE", "mock")
    poll_seconds = float(os.environ.get("WORKER_POLL_SECONDS", "1"))
    benchmark_dir = Path(os.environ.get("BENCHMARK_DIR", "/opt/kernelscope/benchmarks"))
    store = JobStore(database_url)
    LOGGER.info("worker started in %s mode", mode)
    while True:
        job = store.claim()
        if job is None:
            time.sleep(poll_seconds)
            continue
        LOGGER.info("claimed job %s (%s)", job.id, job.kernel_slug)
        try:
            result = execute(job, mode, benchmark_dir)
            store.complete(job, result)
            LOGGER.info("completed job %s", job.id)
        except Exception as error:  # worker must isolate job failures and continue
            LOGGER.exception("job %s failed", job.id)
            store.fail(job.id, f"{type(error).__name__}: {error}")


if __name__ == "__main__":
    run()
