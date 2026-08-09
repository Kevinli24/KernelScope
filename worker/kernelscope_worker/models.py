from dataclasses import dataclass


@dataclass(frozen=True)
class Job:
    id: str
    kernel_slug: str
    executable: str
    input_size: int
    block_size: int
    warmup_count: int
    trial_count: int
    git_commit_hash: str
