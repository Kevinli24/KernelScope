import { describe, expect, it } from 'vitest';
import { calculateComparison } from '../src/repository.js';
import type { BenchmarkResult } from '../src/types.js';

const result = (latency: number): BenchmarkResult => ({
  correct: true,
  actual_result: 1,
  expected_result: 1,
  relative_error: 0,
  average_latency_ms: latency,
  effective_bandwidth_gbps: 100 / latency,
  throughput_elements_per_second: 1_000_000 / latency,
  raw_output: {},
  gpu_name: 'Mock GPU',
  cuda_version: 'mock',
  compute_capability: null,
  driver_version: null,
  total_memory_bytes: null,
});

describe('regression comparison', () => {
  it('flags latency degradation greater than 5 percent', () => {
    const comparison = calculateComparison('baseline', 'current', result(1), result(1.051));
    expect(comparison.latency_change_percent).toBeCloseTo(5.1);
    expect(comparison.is_regression).toBe(true);
  });

  it('does not flag exactly 5 percent', () => {
    const comparison = calculateComparison('baseline', 'current', result(1), result(1.05));
    expect(comparison.is_regression).toBe(false);
  });
});
