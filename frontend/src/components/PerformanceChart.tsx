import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { shortId } from '../format';
import type { Job } from '../types';

interface HistoryPoint {
  run: string;
  latency: number;
  bandwidth: number;
  throughput: number;
}

export function PerformanceChart({ jobs }: { jobs: Job[] }) {
  const data: HistoryPoint[] = jobs
    .filter((job) => job.result)
    .slice(0, 10)
    .reverse()
    .map((job) => ({
      run: shortId(job.id),
      latency: job.result!.average_latency_ms,
      bandwidth: job.result!.effective_bandwidth_gbps,
      throughput: job.result!.throughput_elements_per_second / 1e9,
    }));
  return (
    <section className="panel chart-panel">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">Completed runs</span>
          <h2>Performance history</h2>
        </div>
        <span className="legend">latest ten completed runs</span>
      </div>
      {data.length ? (
        <div className="charts-grid">
          <MetricHistory data={data} dataKey="latency" label="Latency" unit="ms" color="#36d1c4" />
          <MetricHistory
            data={data}
            dataKey="bandwidth"
            label="Bandwidth"
            unit="GB/s"
            color="#8975e9"
          />
          <MetricHistory
            data={data}
            dataKey="throughput"
            label="Throughput"
            unit="Gelem/s"
            color="#61c8ff"
          />
        </div>
      ) : (
        <div className="chart-empty">Completed-run metrics will appear here.</div>
      )}
    </section>
  );
}

function MetricHistory({
  data,
  dataKey,
  label,
  unit,
  color,
}: {
  data: HistoryPoint[];
  dataKey: keyof Omit<HistoryPoint, 'run'>;
  label: string;
  unit: string;
  color: string;
}) {
  return (
    <div className="metric-chart">
      <div>
        <span>{label}</span>
        <small>{unit}</small>
      </div>
      <ResponsiveContainer width="100%" height={180}>
        <AreaChart data={data} margin={{ top: 10, right: 6, bottom: 0, left: -25 }}>
          <defs>
            <linearGradient id={`fill-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.35} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis dataKey="run" stroke="#718294" tickLine={false} axisLine={false} fontSize={9} />
          <YAxis stroke="#718294" tickLine={false} axisLine={false} fontSize={9} />
          <Tooltip
            contentStyle={{ background: '#111c27', border: '1px solid #263849', borderRadius: 8 }}
          />
          <Area
            type="monotone"
            dataKey={dataKey}
            stroke={color}
            fill={`url(#fill-${dataKey})`}
            strokeWidth={2}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
