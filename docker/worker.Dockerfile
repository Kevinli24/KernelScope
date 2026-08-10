FROM nvidia/cuda:12.8.1-devel-ubuntu24.04 AS benchmark-build
RUN apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    cmake ninja-build g++ && rm -rf /var/lib/apt/lists/*
WORKDIR /source
COPY benchmarks benchmarks
RUN cmake -S benchmarks -B build -G Ninja -DCMAKE_BUILD_TYPE=Release -DBUILD_TESTING=OFF \
    && cmake --build build

FROM nvidia/cuda:12.8.1-runtime-ubuntu24.04
RUN apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    python3 python3-pip ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /opt/kernelscope
COPY worker worker
RUN python3 -m pip install --break-system-packages --no-cache-dir ./worker
COPY --from=benchmark-build /source/build/reduction_benchmark /opt/kernelscope/benchmarks/reduction_benchmark
ENV BENCHMARK_DIR=/opt/kernelscope/benchmarks PYTHONUNBUFFERED=1
RUN useradd --create-home --uid 10001 worker && chown -R worker:worker /opt/kernelscope
USER worker
CMD ["python3", "-m", "kernelscope_worker.main"]

