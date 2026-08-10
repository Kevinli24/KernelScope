#include <cuda_runtime.h>

#if __has_include(<cub/cub.cuh>)
#include <cub/cub.cuh>
#define KERNELSCOPE_HAS_CUB 1
#else
#define KERNELSCOPE_HAS_CUB 0
#endif

#include <algorithm>
#include <cmath>
#include <cstdint>
#include <cstdlib>
#include <iomanip>
#include <iostream>
#include <limits>
#include <numeric>
#include <sstream>
#include <stdexcept>
#include <string>
#include <vector>

#define CUDA_CHECK(call)                                                                    \
    do {                                                                                    \
        const cudaError_t error = (call);                                                    \
        if (error != cudaSuccess) {                                                          \
            throw std::runtime_error(std::string(#call) + ": " + cudaGetErrorString(error)); \
        }                                                                                   \
    } while (0)

struct Configuration {
    std::string variant = "optimized";
    std::uint64_t input_size = 1U << 20U;
    int block_size = 256;
    int warmups = 5;
    int trials = 20;
};

__global__ void naive_reduction(const float* input, float* partial, std::uint64_t count) {
    extern __shared__ float values[];
    const std::uint64_t index = static_cast<std::uint64_t>(blockIdx.x) * blockDim.x + threadIdx.x;
    values[threadIdx.x] = index < count ? input[index] : 0.0F;
    __syncthreads();
    for (unsigned stride = blockDim.x / 2; stride > 0; stride >>= 1U) {
        if (threadIdx.x < stride) values[threadIdx.x] += values[threadIdx.x + stride];
        __syncthreads();
    }
    if (threadIdx.x == 0) partial[blockIdx.x] = values[0];
}

__device__ float warp_sum(float value) {
    for (int offset = warpSize / 2; offset > 0; offset /= 2) {
        value += __shfl_down_sync(0xffffffffU, value, offset);
    }
    return value;
}

__global__ void optimized_reduction(const float* input, float* partial, std::uint64_t count) {
    __shared__ float warp_totals[32];
    float sum = 0.0F;
    const std::uint64_t start =
        (static_cast<std::uint64_t>(blockIdx.x) * blockDim.x * 2) + threadIdx.x;
    const std::uint64_t stride = static_cast<std::uint64_t>(gridDim.x) * blockDim.x * 2;
    for (std::uint64_t index = start; index < count; index += stride) {
        sum += input[index];
        if (index + blockDim.x < count) sum += input[index + blockDim.x];
    }
    sum = warp_sum(sum);
    const int lane = threadIdx.x % warpSize;
    const int warp = threadIdx.x / warpSize;
    if (lane == 0) warp_totals[warp] = sum;
    __syncthreads();
    sum = threadIdx.x < (blockDim.x + warpSize - 1) / warpSize ? warp_totals[lane] : 0.0F;
    if (warp == 0) sum = warp_sum(sum);
    if (threadIdx.x == 0) partial[blockIdx.x] = sum;
}

std::string escape_json(const std::string& value) {
    std::ostringstream escaped;
    for (const char character : value) {
        if (character == '"' || character == '\\') escaped << '\\';
        escaped << character;
    }
    return escaped.str();
}

std::uint64_t parse_unsigned(const char* value, const char* option) {
    char* end = nullptr;
    const unsigned long long parsed = std::strtoull(value, &end, 10);
    if (end == value || *end != '\0') throw std::invalid_argument(std::string("invalid ") + option);
    return parsed;
}

Configuration parse_arguments(int argc, char** argv) {
    Configuration config;
    for (int i = 1; i < argc; ++i) {
        if (i + 1 >= argc) throw std::invalid_argument(std::string("missing value for ") + argv[i]);
        const std::string option = argv[i];
        const std::string value = argv[++i];
        if (option == "--variant") config.variant = value;
        else if (option == "--input-size") config.input_size = parse_unsigned(value.c_str(), "input size");
        else if (option == "--block-size") config.block_size = static_cast<int>(parse_unsigned(value.c_str(), "block size"));
        else if (option == "--warmups") config.warmups = static_cast<int>(parse_unsigned(value.c_str(), "warmups"));
        else if (option == "--trials") config.trials = static_cast<int>(parse_unsigned(value.c_str(), "trials"));
        else throw std::invalid_argument("unknown option: " + option);
    }
    const std::vector<int> blocks{32, 64, 128, 256, 512, 1024};
    if (config.variant != "naive" && config.variant != "optimized" && config.variant != "cub")
        throw std::invalid_argument("variant must be naive, optimized, or cub");
    if (config.input_size < 1024 || config.input_size > (1ULL << 30U))
        throw std::invalid_argument("input size must be between 1024 and 1073741824");
    if (std::find(blocks.begin(), blocks.end(), config.block_size) == blocks.end())
        throw std::invalid_argument("unsupported block size");
    if (config.warmups < 0 || config.warmups > 100 || config.trials < 1 || config.trials > 1000)
        throw std::invalid_argument("warmups or trials out of range");
    return config;
}

class DeviceBuffer {
  public:
    explicit DeviceBuffer(std::size_t bytes) : pointer_(nullptr) { CUDA_CHECK(cudaMalloc(&pointer_, bytes)); }
    ~DeviceBuffer() { cudaFree(pointer_); }
    DeviceBuffer(const DeviceBuffer&) = delete;
    DeviceBuffer& operator=(const DeviceBuffer&) = delete;
    void* get() const { return pointer_; }

  private:
    void* pointer_;
};

int main(int argc, char** argv) {
    try {
        const Configuration config = parse_arguments(argc, argv);
        int device = 0;
        CUDA_CHECK(cudaGetDevice(&device));
        cudaDeviceProp properties{};
        CUDA_CHECK(cudaGetDeviceProperties(&properties, device));
        if (config.block_size > properties.maxThreadsPerBlock)
            throw std::runtime_error("block size exceeds device capability");

        const std::size_t input_bytes = config.input_size * sizeof(float);
        std::vector<float> host_input(config.input_size, 1.0F);
        DeviceBuffer device_input(input_bytes);
        CUDA_CHECK(cudaMemcpy(device_input.get(), host_input.data(), input_bytes, cudaMemcpyHostToDevice));

        const std::uint64_t naive_block_count =
            (config.input_size + config.block_size - 1) / config.block_size;
        if (naive_block_count > static_cast<std::uint64_t>(properties.maxGridSize[0]))
            throw std::runtime_error("input requires more blocks than the device grid supports");
        const unsigned naive_blocks = static_cast<unsigned>(naive_block_count);
        const unsigned optimized_blocks = static_cast<unsigned>(std::min<std::uint64_t>(
            (config.input_size + config.block_size * 2ULL - 1) / (config.block_size * 2ULL),
            properties.multiProcessorCount * 32ULL));
        const unsigned blocks = config.variant == "naive" ? naive_blocks : std::max(1U, optimized_blocks);
        DeviceBuffer device_output(std::max<std::size_t>(sizeof(float), blocks * sizeof(float)));
        void* cub_temporary = nullptr;
        std::size_t cub_bytes = 0;
#if KERNELSCOPE_HAS_CUB
        if (config.variant == "cub") {
            CUDA_CHECK(cub::DeviceReduce::Sum(
                nullptr, cub_bytes, static_cast<float*>(device_input.get()),
                static_cast<float*>(device_output.get()), config.input_size));
            CUDA_CHECK(cudaMalloc(&cub_temporary, cub_bytes));
        }
#else
        if (config.variant == "cub") throw std::runtime_error("CUB is not available in this CUDA toolkit");
#endif

        auto launch = [&]() {
            if (config.variant == "naive") {
                naive_reduction<<<blocks, config.block_size, config.block_size * sizeof(float)>>>(
                    static_cast<float*>(device_input.get()), static_cast<float*>(device_output.get()),
                    config.input_size);
            } else if (config.variant == "optimized") {
                optimized_reduction<<<blocks, config.block_size>>>(
                    static_cast<float*>(device_input.get()), static_cast<float*>(device_output.get()),
                    config.input_size);
            } else {
#if KERNELSCOPE_HAS_CUB
                CUDA_CHECK(cub::DeviceReduce::Sum(
                    cub_temporary, cub_bytes, static_cast<float*>(device_input.get()),
                    static_cast<float*>(device_output.get()), config.input_size));
#endif
            }
            CUDA_CHECK(cudaGetLastError());
        };

        for (int i = 0; i < config.warmups; ++i) launch();
        CUDA_CHECK(cudaDeviceSynchronize());
        cudaEvent_t start{};
        cudaEvent_t stop{};
        CUDA_CHECK(cudaEventCreate(&start));
        CUDA_CHECK(cudaEventCreate(&stop));
        float total_ms = 0.0F;
        for (int i = 0; i < config.trials; ++i) {
            CUDA_CHECK(cudaEventRecord(start));
            launch();
            CUDA_CHECK(cudaEventRecord(stop));
            CUDA_CHECK(cudaEventSynchronize(stop));
            float elapsed = 0.0F;
            CUDA_CHECK(cudaEventElapsedTime(&elapsed, start, stop));
            total_ms += elapsed;
        }
        CUDA_CHECK(cudaEventDestroy(start));
        CUDA_CHECK(cudaEventDestroy(stop));

        const std::size_t output_count = config.variant == "cub" ? 1 : blocks;
        std::vector<float> host_partial(output_count);
        CUDA_CHECK(cudaMemcpy(host_partial.data(), device_output.get(), output_count * sizeof(float),
                              cudaMemcpyDeviceToHost));
        if (cub_temporary != nullptr) CUDA_CHECK(cudaFree(cub_temporary));
        const double actual = std::accumulate(host_partial.begin(), host_partial.end(), 0.0);
        const double expected = static_cast<double>(config.input_size);
        const double relative_error = std::abs(actual - expected) / std::max(std::abs(expected), 1.0);
        const bool correct = relative_error <= 1e-5;
        const double average_ms = total_ms / config.trials;
        const double seconds = average_ms / 1000.0;
        const double bandwidth = input_bytes / seconds / 1e9;
        const double throughput = config.input_size / seconds;
        int runtime_version = 0;
        int driver_version = 0;
        CUDA_CHECK(cudaRuntimeGetVersion(&runtime_version));
        CUDA_CHECK(cudaDriverGetVersion(&driver_version));

        std::cout << std::setprecision(12)
                  << "{\"schema_version\":1,\"kernel\":\"reduction-" << config.variant
                  << "\",\"correct\":" << (correct ? "true" : "false")
                  << ",\"actual_result\":" << actual << ",\"expected_result\":" << expected
                  << ",\"relative_error\":" << relative_error
                  << ",\"average_latency_ms\":" << average_ms
                  << ",\"effective_bandwidth_gbps\":" << bandwidth
                  << ",\"throughput_elements_per_second\":" << throughput
                  << ",\"gpu\":{\"name\":\"" << escape_json(properties.name)
                  << "\",\"cuda_version\":\"" << runtime_version / 1000 << "."
                  << (runtime_version % 1000) / 10 << "\",\"driver_version\":\""
                  << driver_version / 1000 << "." << (driver_version % 1000) / 10
                  << "\",\"compute_capability\":\"" << properties.major << "." << properties.minor
                  << "\",\"total_memory_bytes\":" << properties.totalGlobalMem
                  << "},\"configuration\":{\"input_size\":" << config.input_size
                  << ",\"block_size\":" << config.block_size << ",\"warmup_count\":"
                  << config.warmups << ",\"trial_count\":" << config.trials << "}}\n";
        return correct ? 0 : 3;
    } catch (const std::exception& error) {
        std::cerr << "reduction_benchmark: " << error.what() << '\n';
        return 2;
    }
}
