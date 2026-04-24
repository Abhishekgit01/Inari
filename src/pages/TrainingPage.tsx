import { useEffect } from 'react';
import { useSimulationStore } from '../store/simulationStore';

export function TrainingPage() {
  const {
    agentsInfo,
    giskardReports,
    giskardStatus,
    loadAgentsInfo,
    loadGiskardReports,
    loadGiskardStatus,
    loadTrainingMetrics,
    runGiskardScan,
    trainingMetrics,
  } = useSimulationStore();

  useEffect(() => {
    void loadAgentsInfo();
    void loadTrainingMetrics();
    void loadGiskardStatus();
    void loadGiskardReports();
  }, [loadAgentsInfo, loadGiskardReports, loadGiskardStatus, loadTrainingMetrics]);

  return (
    <div className="page-stack">
      <section className="ops-card p-5">
        <div className="section-heading-row">
          <div>
            <div className="ops-display text-[0.62rem] text-secondary/70">Agent Training Dashboard</div>
            <h2 className="panel-title">Reward curves and readiness snapshots</h2>
          </div>
          <span className="status-pill">{trainingMetrics?.steps_trained || 0} trained</span>
        </div>
        <TrainingChart history={trainingMetrics?.reward_history || []} />
      </section>

      <div className="training-metric-grid">
        <MetricCell label="Blue Win Rate" value={`${Math.round((agentsInfo?.blue.win_rate || 0) * 100)}%`} />
        <MetricCell label="Red Win Rate" value={`${Math.round((agentsInfo?.red.win_rate || 0) * 100)}%`} />
        <MetricCell label="Detection Rate" value={`${Math.round((agentsInfo?.blue.detection_rate || 0) * 100)}%`} />
        <MetricCell label="False Positive Rate" value={`${Math.round((agentsInfo?.blue.false_positive_rate || 0) * 100)}%`} />
      </div>

      <section className="two-column-grid">
        <div className="ops-card p-5">
          <div className="section-heading-row">
            <div>
              <div className="ops-display text-[0.62rem] text-secondary/70">Giskard Validation</div>
              <h2 className="panel-title">Scan runtime</h2>
            </div>
            <span className={`status-pill ${giskardStatus?.using_real_giskard ? 'status-pill-live' : ''}`}>
              {giskardStatus?.runtime || 'unknown'}
            </span>
          </div>

          <div className="metric-stack mt-5">
            <MetricBar label="Reports Available" value={giskardStatus?.reports_available || 0} max={10} />
            <MetricBar label="Runtime Mode" value={giskardStatus?.using_real_giskard ? 100 : 45} max={100} />
          </div>

          <div className="mt-5 text-sm leading-7 text-[var(--text-secondary)]">
            Version: <span className="ops-data text-white">{giskardStatus?.version || 'unavailable'}</span>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <button className="ops-button ops-button-primary" onClick={() => void runGiskardScan('blue')} type="button">
              Run Blue Scan
            </button>
            <button className="ops-button" onClick={() => void runGiskardScan('red')} type="button">
              Run Red Scan
            </button>
          </div>
        </div>

        <div className="ops-card p-5">
          <div className="section-heading-row">
            <div>
              <div className="ops-display text-[0.62rem] text-secondary/70">Recent Reports</div>
              <h2 className="panel-title">Generated artifacts</h2>
            </div>
          </div>

          <div className="panel-scroll mt-4 max-h-[320px] space-y-3 overflow-y-auto pr-1">
            {giskardReports.length ? (
              giskardReports.slice(0, 6).map((report) => (
                <div className="feed-item feed-item-info" key={report.name}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="ops-label text-[0.5rem]">{report.type} · {report.format}</div>
                    <div className="ops-data text-[0.65rem]">{report.size_kb} KB</div>
                  </div>
                  <p className="mt-2 text-sm text-white/85">{report.name}</p>
                </div>
              ))
            ) : (
              <div className="empty-panel !min-h-[220px]">No Giskard reports yet.</div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function MetricCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="ops-card p-5">
      <div className="ops-label text-[0.52rem]">{label}</div>
      <div className="ops-data mt-3 text-4xl text-white">{value}</div>
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
  const width = 980;
  const height = 280;

  if (!history.length) {
    return <div className="empty-panel !min-h-[280px] mt-4">Training curves load from the backend metrics endpoint.</div>;
  }

  const redValues = history.map((point) => point.red_reward || 0);
  const blueValues = history.map((point) => point.blue_reward || 0);
  const minValue = Math.min(...redValues, ...blueValues);
  const maxValue = Math.max(...redValues, ...blueValues, 1);
  const range = Math.max(1, maxValue - minValue);

  const buildPath = (values: number[]) =>
    values
      .map((value, index) => {
        const x = (index / Math.max(1, values.length - 1)) * (width - 60) + 30;
        const y = height - 30 - ((value - minValue) / range) * (height - 60);
        return `${index === 0 ? 'M' : 'L'} ${x} ${y}`;
      })
      .join(' ');

  return (
    <svg className="mt-4 h-[280px] w-full" preserveAspectRatio="none" viewBox={`0 0 ${width} ${height}`}>
      <line stroke="rgba(255,255,255,0.08)" x1="30" x2={width - 30} y1={height - 30} y2={height - 30} />
      <line stroke="rgba(255,255,255,0.08)" x1="30" x2="30" y1="30" y2={height - 30} />
      <path d={buildPath(redValues)} fill="none" stroke="#ff335f" strokeWidth="3" />
      <path d={buildPath(blueValues)} fill="none" stroke="#14d1ff" strokeWidth="3" />
    </svg>
  );
}
