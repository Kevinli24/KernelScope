CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE kernels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    executable TEXT NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    baseline_job_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE benchmark_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kernel_id UUID NOT NULL REFERENCES kernels(id),
    input_size BIGINT NOT NULL CHECK (input_size BETWEEN 1024 AND 1073741824),
    block_size INTEGER NOT NULL CHECK (block_size IN (32, 64, 128, 256, 512, 1024)),
    warmup_count INTEGER NOT NULL CHECK (warmup_count BETWEEN 0 AND 100),
    trial_count INTEGER NOT NULL CHECK (trial_count BETWEEN 1 AND 1000),
    git_commit_hash TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'completed', 'failed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    failure_message TEXT,
    claimed_by TEXT,
    CONSTRAINT terminal_job_has_completion CHECK (
      status NOT IN ('completed', 'failed') OR completed_at IS NOT NULL
    )
);

CREATE INDEX benchmark_jobs_queue_idx ON benchmark_jobs (created_at) WHERE status = 'queued';
CREATE INDEX benchmark_jobs_kernel_idx ON benchmark_jobs (kernel_id, created_at DESC);

CREATE TABLE hardware_information (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    fingerprint TEXT NOT NULL UNIQUE,
    gpu_name TEXT NOT NULL,
    cuda_version TEXT NOT NULL,
    compute_capability TEXT,
    driver_version TEXT,
    total_memory_bytes BIGINT,
    raw_info JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE benchmark_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL UNIQUE REFERENCES benchmark_jobs(id) ON DELETE CASCADE,
    hardware_id UUID NOT NULL REFERENCES hardware_information(id),
    correct BOOLEAN NOT NULL,
    actual_result DOUBLE PRECISION NOT NULL,
    expected_result DOUBLE PRECISION NOT NULL,
    relative_error DOUBLE PRECISION NOT NULL CHECK (relative_error >= 0),
    average_latency_ms DOUBLE PRECISION NOT NULL CHECK (average_latency_ms > 0),
    effective_bandwidth_gbps DOUBLE PRECISION NOT NULL CHECK (effective_bandwidth_gbps >= 0),
    throughput_elements_per_second DOUBLE PRECISION NOT NULL CHECK (throughput_elements_per_second >= 0),
    raw_output JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE performance_comparisons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    baseline_job_id UUID NOT NULL REFERENCES benchmark_jobs(id),
    current_job_id UUID NOT NULL REFERENCES benchmark_jobs(id),
    latency_change_percent DOUBLE PRECISION NOT NULL,
    bandwidth_change_percent DOUBLE PRECISION NOT NULL,
    throughput_change_percent DOUBLE PRECISION NOT NULL,
    is_regression BOOLEAN NOT NULL,
    threshold_percent DOUBLE PRECISION NOT NULL DEFAULT 5.0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (baseline_job_id, current_job_id),
    CHECK (baseline_job_id <> current_job_id)
);

ALTER TABLE kernels
  ADD CONSTRAINT kernels_baseline_job_fk
  FOREIGN KEY (baseline_job_id) REFERENCES benchmark_jobs(id) ON DELETE SET NULL;

