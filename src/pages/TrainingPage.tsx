import { useEffect } from 'react';
import { useSimulationStore } from '../store/simulationStore';
import { MagicBentoGrid, BentoCard } from '../components/ui/MagicBento';

export function TrainingPage() {
  const {
    agentsInfo, giskardReports, giskardStatus,
    loadAgentsInfo, loadGiskardReports, loadGiskardStatus, loadTrainingMetrics, runGiskardScan, trainingMetrics,
  } = useSimulationStore();

  useEffect(() => {
    void loadAgentsInfo();
    void loadTrainingMetrics();
    void loadGiskardStatus();
    void loadGiskardReports();
  }, [loadAgentsInfo, loadGiskardReports, loadGiskardStatus, loadTrainingMetrics]);

  return (
    <div className="page-stack">
      <div className="flex items-center justify-between mb-4 px-1">
        <div>
          <div style={{ fontFamily: '"Orbitron", monospace', fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#00e5ff' }}>
            Agent Training Dashboard
          </div>
          <h2 className="panel-title">Reward curves and readiness snapshots</h2>
        </div>
        <span className="status-pill">{trainingMetrics?.steps_trained || 0} trained</span>
      </div>

      <MagicBentoGrid className="grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        {/* Metric cards */}
        <BentoCard label="Blue Win Rate">
          <div className="ops-data mt-3 text-4xl text-white">{Math.round((agentsInfo?.blue.win_rate || 0) * 100)}%</div>
        </BentoCard>
        <BentoCard label="Red Win Rate">
          <div className="ops-data mt-3 text-4xl text-white">{Math.round((agentsInfo?.red.win_rate || 0) * 100)}%</div>
        </BentoCard>
        <BentoCard label="Detection Rate">
          <div className="ops-data mt-3 text-4xl text-white">{Math.round((agentsInfo?.blue.detection_rate || 0) * 100)}%</div>
        </BentoCard>
        <BentoCard label="False Positive Rate">
          <div className="ops-data mt-3 text-4xl text-white">{Math.round((agentsInfo?.blue.false_positive_rate || 0) * 100)}%</div>
        </BentoCard>

        {/* Training chart */}
        <BentoCard label="Reward Curves" className="sm:col-span-2 lg:col-span-4">
          <TrainingChart history={trainingMetrics?.reward_history || []} />
        </BentoCard>

        {/* Giskard Validation */}
        <BentoCard label="Giskard Validation" className="sm:col-span-1 lg:col-span-2">
          <div className="flex items-center gap-2 mb-3">
            <span className={`status-pill ${giskardStatus?.using_real_giskard ? 'status-pill-live' : ''}`}>
              {giskardStatus?.runtime || 'unknown'}
            </span>
          </div>
          <div className="space-y-3">
            <MetricBar label="Reports Available" value={giskardStatus?.reports_available || 0} max={10} />
            <MetricBar label="Runtime Mode" value={giskardStatus?.using_real_giskard ? 100 : 45} max={100} />
          </div>
          <div className="mt-3 text-sm text-[var(--text-secondary)]">
            Version: <span className="ops-data text-white">{giskardStatus?.version || 'unavailable'}</span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button className="ops-button ops-button-primary" onClick={() => void runGiskardScan('blue')}>Run Blue Scan</button>
            <button className="ops-button" onClick={() => void runGiskardScan('red')}>Run Red Scan</button>
          </div>
        </BentoCard>

        {/* Reports */}
        <BentoCard label="Recent Reports" className="sm:col-span-1 lg:col-span-2">
          <div className="space-y-3 max-h-[320px] overflow-y-auto pr-1">
            {giskardReports.length ? giskardReports.slice(0, 6).map((r) => (
              <div className="feed-item feed-item-info" key={r.name}>
                <div className="flex items-center justify-between gap-3">
                  <div className="ops-label text-[0.5rem]">{r.type} · {r.format}</div>
                  <div className="ops-data text-[0.65rem]">{r.size_kb} KB</div>
                </div>
                <p className="mt-2 text-sm text-white/85">{r.name}</p>
              </div>
            )) : <div className="empty-panel !min-h-[220px]">No Giskard reports yet.</div>}
          </div>
        </BentoCard>
      </MagicBentoGrid>
    </div>
  );
}

function MetricBar({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = Math.max(0, Math.min(100, (value / Math.max(1, max)) * 100));
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <div className="ops-label text-[0.52rem]">{label}</div>
        <div className="ops-data text-sm">{value.toFixed(0)}</div>
      </div>
      <div className="meter-track mt-2 h-2">
        <div className="meter-fill bg-secondary" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function TrainingChart({ history }: { history: Array<{ step: number; red_reward?: number; blue_reward?: number }> }) {
  const width = 980; const height = 280;
  if (!history.length) return <div className="empty-panel !min-h-[280px]">Training curves load from the backend metrics endpoint.</div>;
  const red = history.map((p) => p.red_reward || 0);
  const blue = history.map((p) => p.blue_reward || 0);
  const minV = Math.min(...red, ...blue); const maxV = Math.max(...red, ...blue, 1);
  const range = Math.max(1, maxV - minV);
  const buildPath = (vals: number[]) =>
    vals.map((v, i) => {
      const x = (i / Math.max(1, vals.length - 1)) * (width - 60) + 30;
      const y = height - 30 - ((v - minV) / range) * (height - 60);
      return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
    }).join(' ');
  return (
    <svg className="h-[280px] w-full" preserveAspectRatio="none" viewBox={`0 0 ${width} ${height}`}>
      <line stroke="rgba(255,255,255,0.08)" x1="30" x2={width - 30} y1={height - 30} y2={height - 30} />
      <line stroke="rgba(255,255,255,0.08)" x1="30" x2="30" y1="30" y2={height - 30} />
      <path d={buildPath(red)} fill="none" stroke="#ff335f" strokeWidth="3" />
      <path d={buildPath(blue)} fill="none" stroke="#14d1ff" strokeWidth="3" />
    </svg>
  );
}
