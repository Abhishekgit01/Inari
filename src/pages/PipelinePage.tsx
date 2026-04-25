import { useSimulationStore } from '../store/simulationStore';
import { MagicBentoGrid, BentoCard } from '../components/ui/MagicBento';

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
      <div className="flex items-center justify-between mb-4 px-1">
        <div>
          <div style={{ fontFamily: '"Orbitron", monospace', fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#00e5ff' }}>
            Neural Pipeline Visualizer
          </div>
          <h2 className="panel-title">Data flowing through the decision stack</h2>
        </div>
        <span className="status-pill">STEP {step}</span>
      </div>

      <MagicBentoGrid className="flex flex-col gap-3">
        {/* Stages Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {stageCards.map((card) => (
            <BentoCard key={card.id} label={card.label}>
              <h3 className="text-sm font-semibold text-white mb-2">{card.title}</h3>
              <p className="text-xs leading-5 text-white/65">{describeStage(card.id, pipeline)}</p>
            </BentoCard>
          ))}
        </div>

        {/* Wide Analysis Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {/* Shadow Branches */}
          <BentoCard label="Shadow Branches">
            {pipeline?.shadow_branches?.length ? pipeline.shadow_branches.slice(0, 3).map((branch) => (
              <div className="branch-card mb-3" key={`${branch.target_host}-${branch.action_name}`}>
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
            )) : <div className="empty-panel !min-h-[180px]">Shadow execution data will render here after the first live step.</div>}
          </BentoCard>

          {/* Budget + Learning */}
          <BentoCard label="Budget + Learning">
            <div className="space-y-4">
              <MetricBar label="Autonomy Remaining" value={pipeline?.autonomy_budget.remaining || 0} max={pipeline?.autonomy_budget.max_budget || 100} />
              <MetricBar label="Blue Win Rate" value={(pipeline?.blue_win_rate_recent || 0) * 100} max={100} />
              <MetricBar label="Detection Rate" value={(pipeline?.detection_rate_recent || 0) * 100} max={100} />
              <MetricBar label="Risk Score" value={(pipeline?.shadow_risk_score || 0) * 100} max={100} />
            </div>
          </BentoCard>
        </div>
      </MagicBentoGrid>
    </div>
  );
}

function describeStage(stageId: string, pipeline: ReturnType<typeof useSimulationStore.getState>['pipeline']) {
  if (!pipeline) return 'Waiting for pipeline data.';
  switch (stageId) {
    case 'intent': return `Risk class ${pipeline.risk_class} with intent vector size ${pipeline.intent_vector.length}.`;
    case 'drift': return pipeline.drift_detected ? pipeline.drift_description : 'No significant drift detected.';
    case 'shadow': return `${pipeline.shadow_branches.length} branches evaluated; recommendation: ${pipeline.recommended_action}.`;
    case 'attack': return `${pipeline.attack_graph_nodes.length} nodes in attack graph; ${pipeline.steps_to_db_breach ?? '-'} steps to DB breach.`;
    case 'capability': return `${pipeline.capability_edges.length} capability edges across ${pipeline.capability_nodes.length} nodes.`;
    case 'budget': return `${pipeline.autonomy_budget.remaining.toFixed(1)} of ${pipeline.autonomy_budget.max_budget.toFixed(1)} autonomy budget remaining.`;
    case 'learning': return `Blue ${Math.round(pipeline.blue_win_rate_recent * 100)}% vs Red ${Math.round(pipeline.red_win_rate_recent * 100)}% over recent window.`;
    default: return 'Stage data unavailable.';
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
