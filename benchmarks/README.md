# KernelScope CUDA benchmarks

Build on a CUDA-capable Linux host:

```bash
cmake -S benchmarks -B build/benchmarks -DCMAKE_BUILD_TYPE=Release
cmake --build build/benchmarks --parallel
ctest --test-dir build/benchmarks --output-on-failure
```

Each executable writes one JSON object on its final stdout line. Timing covers GPU reduction work
using CUDA events; host-to-device allocation/copy, validation, and JSON serialization are excluded.
CUB is detected at compile time from the CUDA toolkit headers.
