INSERT INTO kernels (slug, name, description, executable) VALUES
  ('reduction-naive', 'Naive FP32 Reduction', 'One-element-per-thread tree reduction baseline.', 'reduction_benchmark'),
  ('reduction-optimized', 'Optimized FP32 Reduction', 'Grid-stride loads, warp shuffles, and two-stage reduction.', 'reduction_benchmark'),
  ('reduction-cub', 'CUB DeviceReduce Baseline', 'NVIDIA CUB DeviceReduce::Sum reference implementation.', 'reduction_benchmark')
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  executable = EXCLUDED.executable,
  enabled = TRUE;

