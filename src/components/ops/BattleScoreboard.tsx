import type { BattleScoreboard as BattleScoreboardType } from '../../lib/ops-types';

interface BattleScoreboardProps {
  scoreboard: BattleScoreboardType | null;
  step: number;
  maxSteps: number;
  episodeId: string;
}

export default function BattleScoreboard({ scoreboard, step, maxSteps, episodeId }: BattleScoreboardProps) {
  if (!scoreboard) return null;

  const fpNote = scoreboard.false_positives_this_episode > 0
    ? `${scoreboard.false_positives_this_episode} false positive${scoreboard.false_positives_this_episode > 1 ? 's' : ''}`
    : 'No false positives';

  return (
    <div className="ops-card px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        {/* Episode info */}
        <div className="flex items-center gap-3">
          <span className="ops-display text-sm tracking-widest">CYBERGUARDIAN AI</span>
          <span className="ops-muted text-xs">
            {episodeId} · STEP {step}/{maxSteps}
          </span>
        </div>

        {/* Node counts */}
        <div className="flex items-center gap-5">
          <ScoreBlock color="#ff0044" icon="☠" label="RED CAPTURED" value={scoreboard.red_nodes_controlled} />
          <ScoreBlock color="#ffcc00" icon="⚔" label="CONTESTED" value={scoreboard.contested_nodes} />
          <ScoreBlock color="#00e5ff" icon="🛡" label="BLUE SECURED" value={scoreboard.blue_nodes_secured} />
        </div>

        {/* FP count */}
        <div className="ops-muted text-[0.62rem]">
          <span className="text-amber-300/70">⚠</span> {fpNote}
        </div>
      </div>

      {/* Progress bars */}
      <div className="mt-3 grid gap-2 md:grid-cols-2">
        <ProgressRow
          color="#ff0044"
          label="RED PROGRESS"
          note={scoreboard.red_nodes_controlled > 0 ? 'closing on DB segment' : 'probing perimeter'}
          value={scoreboard.red_progress}
        />
        <ProgressRow
          color="#00e5ff"
          label="BLUE PROGRESS"
          note={`${scoreboard.blue_total_defenses + scoreboard.blue_total_recaptures} threats contained`}
          value={scoreboard.blue_progress}
        />
      </div>
    </div>
  );
}

function ScoreBlock({ icon, label, value, color }: { icon: string; label: string; value: number; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-lg">{icon}</span>
      <div>
        <div className="ops-data text-xl" style={{ color }}>{value}</div>
        <div className="ops-label text-[0.5rem]">{label}</div>
      </div>
    </div>
  );
}

function ProgressRow({ label, value, color, note }: { label: string; value: number; color: string; note: string }) {
  const pct = Math.round(value * 100);
  return (
    <div className="flex items-center gap-3">
      <div className="ops-label w-28 text-[0.58rem]">{label}</div>
      <div className="relative h-3 flex-1 rounded-sm bg-white/6 overflow-hidden">
        <div
          className="absolute inset-y-0 left-0 rounded-sm transition-all duration-500"
          style={{ width: `${pct}%`, backgroundColor: color, boxShadow: `0 0 10px ${color}40` }}
        />
      </div>
      <div className="ops-data w-10 text-right text-sm" style={{ color }}>{pct}%</div>
      <div className="ops-muted hidden text-[0.52rem] xl:block">← {note}</div>
    </div>
  );
}
