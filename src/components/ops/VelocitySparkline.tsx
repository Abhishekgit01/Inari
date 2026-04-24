interface VelocitySparklineProps {
  history: number[];
  label: string;
  color: string;
}

export default function VelocitySparkline({ history, label, color }: VelocitySparklineProps) {
  const w = 200;
  const h = 48;
  const pad = 4;

  if (!history.length) {
    return (
      <div className="flex flex-col gap-1">
        <div className="flex justify-between items-center">
          <span className="text-xs" style={{ fontFamily: 'Orbitron', color: '#7a9cc4' }}>
            VELOCITY
          </span>
          <span className="text-xs font-bold" style={{ fontFamily: 'Share Tech Mono', color }}>
            {label}
          </span>
        </div>
        <div className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>No velocity data yet</div>
      </div>
    );
  }

  const min = Math.min(...history, 0);
  const max = Math.max(...history, 0.01);
  const range = max - min || 1;

  const points = history.map((v, i) => {
    const x = pad + (i / Math.max(1, history.length - 1)) * (w - pad * 2);
    const y = h - pad - ((v - min) / range) * (h - pad * 2);
    return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(' ');

  const areaPath = `${points} L ${(pad + (w - pad * 2)).toFixed(1)} ${h - pad} L ${pad} ${h - pad} Z`;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between items-center">
        <span className="text-xs" style={{ fontFamily: 'Orbitron', color: '#7a9cc4' }}>
          VELOCITY
        </span>
        <span className="text-xs font-bold" style={{ fontFamily: 'Share Tech Mono', color }}>
          {label}
        </span>
      </div>
      <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
        <defs>
          <linearGradient id="velGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.4} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <path d={areaPath} fill="url(#velGrad)" />
        <path d={points} fill="none" stroke={color} strokeWidth={2} />
      </svg>
    </div>
  );
}
