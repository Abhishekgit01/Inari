import type { BattleBriefing } from '../../lib/ops-types';

const polarPoint = (angleDeg: number, radius: number, center: number) => {
  const angle = (angleDeg - 90) * (Math.PI / 180);
  return {
    x: center + Math.cos(angle) * radius,
    y: center + Math.sin(angle) * radius,
  };
};

export default function ThreatRadar({ briefing }: { briefing: BattleBriefing | null }) {
  if (!briefing?.hot_zones?.length) {
    return <div className="empty-panel !min-h-[360px]">The radar will light up once the battle starts.</div>;
  }

  const size = 320;
  const center = size / 2;
  const maxRadius = 118;
  const hotZones = briefing.hot_zones.slice(0, 6);

  return (
    <section>
      <div className="section-heading-row">
        <div>
          <div className="ops-display text-[0.62rem] text-secondary/70">Judge Visual 01</div>
          <h2 className="panel-title">Threat Radar</h2>
          <p className="mt-1 text-xs text-[var(--text-secondary)]" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{briefing.headline}</p>
        </div>
        <div className="status-pill status-pill-live">{briefing.last_updated_step === 0 ? 'READY' : `STEP ${briefing.last_updated_step}`}</div>
      </div>

      <div className="mt-3 grid gap-3 xl:grid-cols-[280px,minmax(0,1fr)]">
        <div className="radar-shell">
          <svg className="w-full" viewBox={`0 0 ${size} ${size}`}>
            <defs>
              <radialGradient id="radar-core" cx="50%" cy="50%" r="65%">
                <stop offset="0%" stopColor="rgba(20,209,255,0.24)" />
                <stop offset="100%" stopColor="rgba(20,209,255,0.02)" />
              </radialGradient>
            </defs>

            <circle cx={center} cy={center} fill="url(#radar-core)" r={maxRadius + 6} />
            {[0.3, 0.56, 0.82, 1].map((ring, index) => (
              <circle
                key={ring}
                cx={center}
                cy={center}
                fill="none"
                r={ring * maxRadius}
                stroke={index === 3 ? 'rgba(20,209,255,0.3)' : 'rgba(166,230,255,0.14)'}
                strokeWidth={index === 3 ? 1.5 : 1}
              />
            ))}
            <line stroke="rgba(166,230,255,0.12)" x1={center} x2={center} y1={22} y2={size - 22} />
            <line stroke="rgba(166,230,255,0.12)" x1={22} x2={size - 22} y1={center} y2={center} />

            <g className="threat-radar-sweep">
              <path
                d={`M ${center} ${center} L ${center} ${center - maxRadius} A ${maxRadius} ${maxRadius} 0 0 1 ${center + maxRadius * 0.72} ${center - maxRadius * 0.72} Z`}
                fill="rgba(20,209,255,0.12)"
                stroke="rgba(20,209,255,0.28)"
              />
            </g>

            {hotZones.map((zone, index) => {
              const angle = index * (360 / hotZones.length) + 24;
              const radius = 44 + zone.risk_score * 74;
              const point = polarPoint(angle, radius, center);
              return (
                <g key={zone.host_id}>
                  <line
                    stroke="rgba(166,230,255,0.14)"
                    strokeDasharray="4 6"
                    x1={center}
                    x2={point.x}
                    y1={center}
                    y2={point.y}
                  />
                  <circle className="threat-radar-ping" cx={point.x} cy={point.y} fill={zone.color} r={5 + zone.risk_score * 5} />
                  <circle cx={point.x} cy={point.y} fill="rgba(255,255,255,0.95)" r="2.3" />
                  <text
                    className="ops-label"
                    fill="rgba(255,255,255,0.68)"
                    fontSize="9"
                    textAnchor="middle"
                    x={point.x}
                    y={point.y - 14}
                  >
                    {zone.label}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>

        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <PressureCell label="Red Pressure" tone="#ff335f" value={briefing.attack_pressure.red} />
            <PressureCell label="Blue Pressure" tone="#14d1ff" value={briefing.attack_pressure.blue} />
            <PressureCell label="Building Calm" tone="#00ff88" value={briefing.attack_pressure.neutral} />
          </div>

          <div className="space-y-3">
            {hotZones.map((zone) => (
              <div className="feed-item feed-item-info" key={zone.host_id}>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="ops-label text-[0.52rem]">{zone.zone}</div>
                    <div className="mt-1 text-xs text-white" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{zone.label}</div>
                  </div>
                  <div className="ops-data text-base" style={{ color: zone.color }}>{zone.risk_percent}%</div>
                </div>
                <div className="meter-track mt-3 h-2">
                  <div className="meter-fill" style={{ width: `${zone.risk_percent}%`, background: `linear-gradient(90deg, ${zone.color}44, ${zone.color})` }} />
                </div>
                <p className="mt-2 text-xs text-[var(--text-secondary)]" style={{ overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{zone.reason}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function PressureCell({ label, tone, value }: { label: string; tone: string; value: number }) {
  return (
    <div className="ops-card p-4">
      <div className="ops-label text-[0.52rem]">{label}</div>
      <div className="ops-data mt-3 text-3xl" style={{ color: tone }}>{Math.round(value * 100)}%</div>
      <div className="meter-track mt-3 h-2">
        <div className="meter-fill" style={{ width: `${Math.round(value * 100)}%`, background: `linear-gradient(90deg, ${tone}55, ${tone})` }} />
      </div>
    </div>
  );
}
