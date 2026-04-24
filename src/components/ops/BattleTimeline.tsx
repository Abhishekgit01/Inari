import type { NodeBattleResult } from '../../lib/ops-types';

interface BattleTimelineProps {
  results: NodeBattleResult[];
  step: number;
  maxSteps: number;
}

const ICON_MAP: Record<string, string> = {
  captured: '☠',
  defended: '🛡',
  recaptured: '♻',
};

const COLOR_MAP: Record<string, { winner: string; bg: string }> = {
  captured: { winner: '#ff0044', bg: '#ff004420' },
  defended: { winner: '#00e5ff', bg: '#00e5ff20' },
  recaptured: { winner: '#00ff88', bg: '#00ff8820' },
};

export default function BattleTimeline({ results, step, maxSteps }: BattleTimelineProps) {
  if (results.length === 0) return null;

  return (
    <div className="ops-card px-4 py-2">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-sm">⏱</span>
        <span className="ops-display text-[0.65rem]">BATTLE TIMELINE</span>
        <span className="ops-muted text-[0.55rem]">{results.length} event{results.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Timeline bar */}
      <div className="relative h-6">
        {/* Track */}
        <div className="absolute left-0 right-0 top-3 h-px bg-white/15" />

        {/* Cursor */}
        <div
          className="absolute top-1 h-4 w-0.5 bg-white/40 rounded-full z-10"
          style={{ left: `${(step / maxSteps) * 100}%` }}
        />

        {/* Event markers */}
        {results.map((r, i) => {
          const leftPct = (r.step_resolved / maxSteps) * 100;
          const icon = r.false_positive ? '⚠' : ICON_MAP[r.outcome] ?? '❓';
          const colors = r.false_positive
            ? { winner: '#ffcc00', bg: '#ffcc0020' }
            : COLOR_MAP[r.outcome] ?? COLOR_MAP.captured;
          return (
            <div
              className="absolute top-0 cursor-pointer transform -translate-x-1/2 group"
              key={`${r.node_id}-${r.step_resolved}-${i}`}
              style={{ left: `${leftPct}%` }}
            >
              {/* Marker */}
              <div
                className="w-5 h-5 flex items-center justify-center text-[0.6rem] rounded-full border transition-transform hover:scale-125"
                style={{ borderColor: colors.winner, backgroundColor: colors.bg, color: colors.winner }}
              >
                {icon}
              </div>

              {/* Tooltip */}
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-50">
                <div className="w-52 rounded-sm border border-white/15 px-3 py-2" style={{ background: 'rgba(10, 18, 34, 0.95)' }}>
                  <div className="ops-label text-[0.55rem]" style={{ color: colors.winner }}>
                    {r.winner.toUpperCase()} {r.outcome.toUpperCase()} — {r.node_label}
                  </div>
                  <div className="ops-muted mt-1 text-[0.52rem]">{r.incident_summary}</div>
                  <div className="ops-muted mt-1 text-[0.5rem]">
                    Step {r.step_resolved} · {r.total_steps_fought} steps fought
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
