import { useSimulationStore } from '../store/simulationStore';

const stageCards = [
  { id: 'intent', label: 'Stage 1', title: 'Intent Vector' },
  { id: 'drift', label: 'Stage 2', title: 'Drift Detect' },
  { id: 'shadow', label: 'Stage 3', title: 'Neural Shadow Exec' },
  { id: 'attack', label: 'Stage 4', title: 'Attack Graph' },
  { id: 'capability', label: 'Stage 5', title: 'Capability Lattice' },
  { id: 'budget', label: 'Stage 6', title: 'Autonomy Budget' },
  { id: 'learning', label: 'Stage 9', title: 'Learning Loop' },
];

export function PipelinePage() {
  const { pipeline, step } = useSimulationStore();

  return (
    <div className="page-stack">
      <section className="ops-card p-5">
        <div className="section-heading-row">
          <div>
            <div className="ops-display text-[0.62rem] text-secondary/70">Neural Pipeline Visualizer</div>
            <h2 className="panel-title">Data flowing through the decision stack</h2>
          </div>
          <span className="status-pill">STEP {step}</span>
        </div>

        <div className="pipeline-grid">
          {stageCards.map((card) => (
            <div className="pipeline-stage-card" key={card.id}>
              <div className="ops-display text-[0.54rem] text-secondary/70">{card.label}</div>
              <h3>{card.title}</h3>
              <p>{describeStage(card.id, pipeline)}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="two-column-grid">
        <section className="ops-card p-5">
          <div className="ops-display text-[0.62rem] text-secondary/70">Shadow Branches</div>
          <div className="mt-4 space-y-3">
            {pipeline?.shadow_branches?.length ? pipeline.shadow_branches.slice(0, 3).map((branch) => (
              <div className="branch-card" key={`${branch.target_host}-${branch.action_name}`}>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="ops-label text-[0.52rem]">{branch.classification}</div>
                    <div className="mt-1 text-sm text-white">{branch.action_name} → {branch.target_label}</div>
                  </div>
                  <div className="ops-data text-sm">{Math.round(branch.risk_score * 100)}%</div>
                </div>
                <div className="meter-track mt-3 h-2">
                  <div className="meter-fill bg-secondary" style={{ width: `${Math.round(branch.risk_score * 100)}%` }} />
                </div>
              </div>
            )) : <div className="empty-panel !min-h-[220px]">Shadow execution data will render here after the first live step.</div>}
          </div>
        </section>

        <section className="ops-card p-5">
          <div className="ops-display text-[0.62rem] text-secondary/70">Budget + Learning</div>
          <div className="metric-stack mt-4">
            <MetricBar label="Autonomy Remaining" value={pipeline?.autonomy_budget.remaining || 0} max={pipeline?.autonomy_budget.max_budget || 100} />
            <MetricBar label="Blue Win Rate" value={(pipeline?.blue_win_rate_recent || 0) * 100} max={100} />
            <MetricBar label="Detection Rate" value={(pipeline?.detection_rate_recent || 0) * 100} max={100} />
            <MetricBar label="Risk Score" value={(pipeline?.shadow_risk_score || 0) * 100} max={100} />
          </div>
        </section>
      </div>
    </div>
  );
}

function describeStage(stageId: string, pipeline: ReturnType<typeof useSimulationStore.getState>['pipeline']) {
  if (!pipeline) {
    return 'Waiting for pipeline data.';
  }

  switch (stageId) {
    case 'intent':
      return `Risk class ${pipeline.risk_class} with intent vector size ${pipeline.intent_vector.length}.`;
    case 'drift':
      return pipeline.drift_detected ? pipeline.drift_description : 'No significant drift detected.';
    case 'shadow':
      return `${pipeline.shadow_branches.length} branches evaluated; recommendation: ${pipeline.recommended_action}.`;
    case 'attack':
      return `${pipeline.attack_graph_nodes.length} nodes in attack graph; ${pipeline.steps_to_db_breach ?? '-'} steps to DB breach.`;
    case 'capability':
      return `${pipeline.capability_edges.length} capability edges across ${pipeline.capability_nodes.length} nodes.`;
    case 'budget':
      return `${pipeline.autonomy_budget.remaining.toFixed(1)} of ${pipeline.autonomy_budget.max_budget.toFixed(1)} autonomy budget remaining.`;
    case 'learning':
      return `Blue ${Math.round(pipeline.blue_win_rate_recent * 100)}% vs Red ${Math.round(pipeline.red_win_rate_recent * 100)}% over the recent window.`;
    default:
      return 'Stage data unavailable.';
  }
}

function MetricBar({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = Math.max(0, Math.min(100, (value / Math.max(1, max)) * 100));
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <div className="ops-label text-[0.52rem]">{label}</div>
        <div className="ops-data text-sm">{value.toFixed(1)}</div>
      </div>
      <div className="meter-track mt-2 h-2">
        <div className="meter-fill bg-secondary" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
