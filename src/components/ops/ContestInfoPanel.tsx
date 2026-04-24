import { motion } from 'framer-motion';
import type { ContestEvent, DecisionScores, NetworkNode, NodeBattleResult } from '../../lib/ops-types';

interface ContestInfoPanelProps {
  node: NetworkNode;
  contest: ContestEvent | null;
  battleResult: NodeBattleResult | null;
  redThoughts: DecisionScores;
  blueThoughts: DecisionScores;
  step: number;
  maxSteps: number;
  onClose: () => void;
}

const SEVERITY_COLORS: Record<string, string> = {
  low: '#00ff88',
  medium: '#ffcc00',
  high: '#ff6600',
  critical: '#ff0044',
};

export default function ContestInfoPanel({
  node,
  contest,
  battleResult,
  redThoughts,
  blueThoughts,
  step,
  maxSteps,
  onClose,
}: ContestInfoPanelProps) {
  const severity = contest?.severity || (node.status === 'compromised' ? 'critical' : node.status === 'detected' ? 'high' : 'medium');
  const sevColor = SEVERITY_COLORS[severity] ?? '#ffcc00';
  const noMansLand = contest ? Math.max(0, Math.round((contest.red_control_pct + contest.blue_control_pct - 1) * 100)) : 0;
  const confPct = contest ? Math.round(contest.correlation_confidence * 100) : 0;
  const whyItWon =
    battleResult?.false_positive
      ? battleResult.false_positive_reason || battleResult.victory_reason
      : battleResult?.victory_reason || contest?.winning_reason || 'No resolved winner yet. Inspect the live decision overlay to understand current pressure.';

  return (
    <motion.div
      animate={{ opacity: 1, scale: 1, y: 0 }}
      className="fixed right-4 top-20 z-[1000] w-[420px] rounded-[18px] border border-white/10 shadow-2xl"
      exit={{ opacity: 0, scale: 0.95 }}
      initial={{ opacity: 0, scale: 0.92, y: 20 }}
      style={{
        background: 'rgba(12, 14, 18, 0.95)',
        backdropFilter: 'blur(18px)',
        borderLeftWidth: 4,
        borderLeftColor: sevColor,
      }}
      transition={{ type: 'spring', stiffness: 350, damping: 25 }}
    >
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div>
          <div className="ops-display text-sm">{node.label}</div>
          <div className="ops-muted mt-1 text-xs">{node.type.replace('_', ' ').toUpperCase()} · {node.status.replace('_', ' ')}</div>
        </div>
        <button className="ops-muted text-sm transition-colors hover:text-white" onClick={onClose} type="button">✕</button>
      </div>

      <div className="border-b border-white/10 px-4 py-2 ops-label text-[0.58rem]">
        {contest ? <>Phase: <span style={{ color: sevColor }}>{contest.phase.replace('_', ' ').toUpperCase()}</span></> : <>Node Insight</>}
        <span className="ops-muted ml-2">· {severity.toUpperCase()} · Step {step}/{maxSteps}</span>
      </div>

      <div className="grid grid-cols-3 gap-3 border-b border-white/10 px-4 py-4">
        <MiniMetric label="Vulnerability" value={`${Math.round(node.vulnerability_score * 100)}%`} />
        <MiniMetric label="Data Value" value={`${node.data_value_gb.toFixed(1)} GB`} />
        <MiniMetric label="Patch Level" value={node.patch_level} />
      </div>

      {contest ? (
        <div className="border-b border-white/10 px-4 py-3">
          <div className="ops-label text-[0.55rem]">
            Threat: {contest.active_threat_type?.replace('_', ' ').toUpperCase()} [{contest.mitre_id || 'TXXXX'} {contest.mitre_name || 'Pending Classification'}]
          </div>
          <div className="mt-2 flex items-center gap-2">
            <span className="ops-muted text-[0.55rem]">Confidence</span>
            <div className="relative h-2 flex-1 overflow-hidden rounded-sm bg-white/10">
              <div className="absolute inset-y-0 left-0 rounded-sm bg-cyan-300/60" style={{ width: `${confPct}%` }} />
            </div>
            <span className="ops-data text-[0.62rem]">{confPct}%</span>
          </div>
          <div className="mt-2 flex gap-3">
            {Object.entries(contest.layers_active).map(([layer, active]) => (
              <span className="ops-label text-[0.52rem]" key={layer}>
                {active ? '■' : '□'} {layer.charAt(0).toUpperCase() + layer.slice(1)}
              </span>
            ))}
          </div>
          <div className="ops-muted mt-1 text-[0.52rem] italic">{contest.cross_layer_note}</div>
          <div className="ops-muted mt-1 text-[0.52rem]">No-man&apos;s land: {noMansLand}% · contested for {contest.steps_contested} steps</div>
        </div>
      ) : null}

      <div className="border-b border-white/10 px-4 py-3">
        <div className="mb-2 text-[0.55rem] font-bold text-primary">WHY IT WON</div>
        <div className="rounded-[14px] border border-white/8 bg-white/[0.03] px-3 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="ops-label text-[0.5rem]">
              {battleResult ? `${battleResult.winner.toUpperCase()} ${battleResult.outcome.toUpperCase()}` : contest ? 'CURRENT EDGE' : 'NO RESOLUTION YET'}
            </div>
            {battleResult ? <div className="ops-data text-[0.68rem]">STEP {battleResult.step_resolved}</div> : null}
          </div>
          <p className="mt-2 text-sm leading-6 text-white/88">{whyItWon}</p>
        </div>
      </div>

      <div className="border-b border-white/10 px-4 py-3">
        <div className="mb-2 text-[0.55rem] font-bold text-red-300">RED Q-VALUES HEATMAP</div>
        <ThoughtBars color="#ff335f" items={topScores(redThoughts)} />
      </div>

      <div className="border-b border-white/10 px-4 py-3">
        <div className="mb-2 text-[0.55rem] font-bold text-cyan-300">BLUE POLICY PROBABILITY</div>
        <ThoughtBars color="#14d1ff" items={topScores(blueThoughts)} />
      </div>

      {contest ? (
        <>
          <div className="border-b border-white/10 px-4 py-3">
            <div className="mb-1 text-[0.55rem] font-bold text-red-400">WHY RED TARGETED THIS NODE</div>
            <div className="ops-muted text-xs leading-5">&ldquo;{contest.red_targeting_reason}&rdquo;</div>
          </div>

          <div className="border-b border-white/10 px-4 py-3">
            <div className="mb-1 text-[0.55rem] font-bold text-cyan-300">WHY THIS WAS FLAGGED</div>
            <div className="ops-muted text-xs leading-5">&ldquo;{contest.detection_reason}&rdquo;</div>
          </div>
        </>
      ) : null}

      <div className="px-4 py-3">
        <div className="mb-1 text-[0.55rem] font-bold text-amber-300">WHAT TO DO RIGHT NOW</div>
        <div className="ops-muted text-xs leading-5">
          &ldquo;{contest?.immediate_action || 'Investigate the node and compare the current Red and Blue decision weights before acting.'}&rdquo;
        </div>
        <div className="mt-3 flex gap-2">
          <ActionButton color="#ff0044" label="ISOLATE" />
          <ActionButton color="#00ff88" label="PATCH" />
          <ActionButton color="#00e5ff" label="PLAYBOOK" />
        </div>
      </div>

      {contest ? (
        <div className="border-t border-white/10 px-4 py-2">
          <div className="ops-muted text-[0.52rem]">
            MITRE ATT&CK: {contest.mitre_id || 'TXXXX'} {contest.mitre_name || 'Pending'}
          </div>
        </div>
      ) : null}
    </motion.div>
  );
}

function topScores(scores: DecisionScores) {
  return Object.entries(scores)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[14px] border border-white/8 bg-white/[0.03] px-3 py-3">
      <div className="ops-label text-[0.48rem]">{label}</div>
      <div className="mt-2 text-sm font-semibold text-white">{value}</div>
    </div>
  );
}

function ThoughtBars({ items, color }: { items: Array<[string, number]>; color: string }) {
  if (!items.length) {
    return <div className="ops-muted text-xs">No decision weights available yet.</div>;
  }

  return (
    <div className="space-y-2">
      {items.map(([label, value]) => (
        <div key={label}>
          <div className="mb-1 flex items-center justify-between gap-3">
            <span className="ops-label text-[0.5rem]">{label.replace(/_/g, ' ')}</span>
            <span className="ops-data text-[0.68rem]">{Math.round(value * 100)}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-white/8">
            <div className="h-full rounded-full" style={{ width: `${Math.round(value * 100)}%`, background: color }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function ActionButton({ label, color }: { label: string; color: string }) {
  return (
    <button
      className="ops-label cursor-pointer rounded-sm border px-3 py-1.5 text-[0.58rem] transition-colors hover:bg-white/8"
      style={{ borderColor: `${color}40`, color }}
      type="button"
    >
      {label}
    </button>
  );
}
