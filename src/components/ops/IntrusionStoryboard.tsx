import type { BattleBriefing } from '../../lib/ops-types';

const teamAccent: Record<string, string> = {
  red: '#ff335f',
  blue: '#14d1ff',
  system: '#ffcc00',
};

export default function IntrusionStoryboard({ briefing }: { briefing: BattleBriefing | null }) {
  if (!briefing?.storyline?.length) {
    return <div className="empty-panel !min-h-[360px]">The story reel will fill in as the guard and burglar make their moves.</div>;
  }

  return (
    <section>
      <div className="section-heading-row">
        <div>
          <div className="ops-display text-[0.62rem] text-secondary/70">Judge Visual 02</div>
          <h2 className="panel-title">Intrusion Storyboard</h2>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">{briefing.summary}</p>
        </div>
        <div className="status-pill">LIVE EXPLANATION</div>
      </div>

      <div className="storyboard-strip mt-5">
        {briefing.storyline.map((beat, index) => {
          const accent = beat.color || teamAccent[beat.team] || '#b0c6ff';
          return (
            <article className="storyboard-card" key={beat.id} style={{ borderColor: `${accent}55` }}>
              <div className="flex items-center justify-between gap-3">
                <div className="ops-label text-[0.5rem]" style={{ color: accent }}>
                  {beat.team.toUpperCase()} · STEP {beat.step}
                </div>
                <div className="storyboard-dot" style={{ background: accent }} />
              </div>
              <h3 className="mt-3 text-base font-semibold text-white">{beat.title}</h3>
              <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">{beat.detail}</p>
              {index < briefing.storyline.length - 1 ? <div className="storyboard-link" style={{ background: `linear-gradient(90deg, ${accent}, rgba(255,255,255,0.08))` }} /> : null}
            </article>
          );
        })}
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {briefing.zone_heat.map((zone) => (
          <div className="ops-card p-4" key={zone.zone}>
            <div className="ops-label text-[0.52rem]">{zone.zone}</div>
            <div className="ops-data mt-3 text-3xl" style={{ color: zone.color }}>{zone.risk_percent}%</div>
            <div className="mt-3 text-xs text-[var(--text-secondary)]">
              {zone.compromised_hosts} compromised · {zone.detected_hosts} spotted · {zone.host_count} hosts
            </div>
            <div className="meter-track mt-3 h-2">
              <div className="meter-fill" style={{ width: `${zone.risk_percent}%`, background: `linear-gradient(90deg, ${zone.color}55, ${zone.color})` }} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
