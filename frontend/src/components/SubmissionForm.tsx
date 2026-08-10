import { useEffect, useState, type FormEvent } from 'react';
import type { JobInput, Kernel } from '../types';

interface Props {
  kernels: Kernel[];
  submitting: boolean;
  onSubmit: (input: JobInput) => Promise<void>;
}

export function SubmissionForm({ kernels, submitting, onSubmit }: Props) {
  const [kernelId, setKernelId] = useState('');
  const [inputSize, setInputSize] = useState(1_048_576);
  const [blockSize, setBlockSize] = useState<JobInput['blockSize']>(256);
  const [warmupCount, setWarmupCount] = useState(5);
  const [trialCount, setTrialCount] = useState(20);
  const [gitCommitHash, setGitCommitHash] = useState('unknown');

  useEffect(() => {
    if (!kernelId && kernels[0]) setKernelId(kernels[0].id);
  }, [kernelId, kernels]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    await onSubmit({ kernelId, inputSize, blockSize, warmupCount, trialCount, gitCommitHash });
  };

  return (
    <form className="panel submission" onSubmit={submit}>
      <div className="panel-heading">
        <div>
          <span className="eyebrow">Dispatch</span>
          <h2>New benchmark</h2>
        </div>
        <span className="safe-chip">registered kernels only</span>
      </div>
      <label className="field field-wide">
        <span>Kernel</span>
        <select value={kernelId} onChange={(event) => setKernelId(event.target.value)} required>
          {kernels.map((kernel) => (
            <option key={kernel.id} value={kernel.id}>
              {kernel.name}
            </option>
          ))}
        </select>
      </label>
      <div className="form-grid">
        <label className="field">
          <span>Input elements</span>
          <input
            type="number"
            min={1024}
            max={1_073_741_824}
            value={inputSize}
            onChange={(event) => setInputSize(Number(event.target.value))}
          />
        </label>
        <label className="field">
          <span>Block size</span>
          <select
            value={blockSize}
            onChange={(event) => setBlockSize(Number(event.target.value) as JobInput['blockSize'])}
          >
            {[32, 64, 128, 256, 512, 1024].map((size) => (
              <option key={size}>{size}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Warmups</span>
          <input
            type="number"
            min={0}
            max={100}
            value={warmupCount}
            onChange={(event) => setWarmupCount(Number(event.target.value))}
          />
        </label>
        <label className="field">
          <span>Timed trials</span>
          <input
            type="number"
            min={1}
            max={1000}
            value={trialCount}
            onChange={(event) => setTrialCount(Number(event.target.value))}
          />
        </label>
      </div>
      <label className="field field-wide">
        <span>Git commit</span>
        <input
          value={gitCommitHash}
          maxLength={64}
          pattern="unknown|[0-9a-fA-F]{7,64}"
          onChange={(event) => setGitCommitHash(event.target.value)}
        />
      </label>
      <button className="primary-button" disabled={submitting || !kernelId}>
        <span>{submitting ? 'Queueing…' : 'Queue benchmark'}</span>
        <kbd>↵</kbd>
      </button>
    </form>
  );
}
