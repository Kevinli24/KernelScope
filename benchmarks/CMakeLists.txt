cmake_minimum_required(VERSION 3.24)
project(KernelScopeBenchmarks LANGUAGES CXX CUDA)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CUDA_STANDARD 17)
set(CMAKE_CUDA_STANDARD_REQUIRED ON)

add_executable(reduction_benchmark src/reduction_benchmark.cu)
target_compile_options(reduction_benchmark PRIVATE
  $<$<COMPILE_LANGUAGE:CUDA>:--expt-relaxed-constexpr;-lineinfo>)
set_target_properties(reduction_benchmark PROPERTIES
  CUDA_ARCHITECTURES "70;75;80;86;89;90;100;120"
  CUDA_SEPARABLE_COMPILATION ON)

include(CTest)
if(BUILD_TESTING)
  add_test(NAME reduction_naive_correctness
    COMMAND reduction_benchmark --variant naive --input-size 65536 --block-size 256 --warmups 1 --trials 2)
  add_test(NAME reduction_optimized_correctness
    COMMAND reduction_benchmark --variant optimized --input-size 65536 --block-size 256 --warmups 1 --trials 2)
  add_test(NAME reduction_cub_correctness
    COMMAND reduction_benchmark --variant cub --input-size 65536 --block-size 256 --warmups 1 --trials 2)
endif()
