import type { ContestPhase, NetworkNode } from '../../lib/ops-types';

interface ContestNodeProps {
  cx: number;
  cy: number;
  r: number;
  nodeType: NetworkNode['type'];
  phase: ContestPhase;
  redControl: number;
  blueControl: number;
  label: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  contestIntensity: number;
  isRedHere?: boolean;
  isSelected?: boolean;
  attentionLevel?: number;
  onClick?: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

const PHASE_CONFIG: Record<ContestPhase, {
  stroke: string;
  fill: string;
  icon: string;
  label: string;
  pulse: boolean;
}> = {
  idle: { stroke: '#365579', fill: '#081120', icon: '', label: '', pulse: false },
  probing: { stroke: '#ff8c5c', fill: '#170b0d', icon: '?', label: 'PROBING', pulse: true },
  contested: { stroke: '#ffcf5c', fill: '#130d14', icon: '⚔', label: 'CONTESTED', pulse: true },
  red_winning: { stroke: '#ff335f', fill: '#1a0911', icon: '⚔', label: 'LOSING', pulse: true },
  blue_winning: { stroke: '#4dd8ff', fill: '#071824', icon: '⚔', label: 'DEFENDING', pulse: true },
  red_captured: { stroke: '#ff335f', fill: '#250811', icon: '☠', label: 'COMPROMISED', pulse: false },
  blue_defended: { stroke: '#59f0c1', fill: '#08161a', icon: '🛡', label: 'SECURED', pulse: false },
  blue_recaptured: { stroke: '#4dd8ff', fill: '#061624', icon: '♻', label: 'RECAPTURED', pulse: false },
};

export default function ContestNode({
  cx,
  cy,
  r,
  nodeType,
  phase,
  redControl,
  blueControl,
  label,
  severity,
  contestIntensity,
  isRedHere = false,
  isSelected = false,
  attentionLevel = 0,
  onClick,
  onMouseEnter,
  onMouseLeave,
}: ContestNodeProps) {
  const cfg = PHASE_CONFIG[phase] ?? PHASE_CONFIG.idle;
  const isActive = phase !== 'idle';
  const fillId = `contest-fill-${label.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()}`;
  const severityWidth = { low: 1.5, medium: 2, high: 3, critical: 4 }[severity];
  const controlTotal = Math.max(0.01, redControl + blueControl);
  const redShare = Math.min(100, Math.max(8, (redControl / controlTotal) * 100));
  const arcOuter = r + 7;
  const arcInner = r + 3.5;
  const bodyPath = isHexNode(nodeType) ? hexagonPath(cx, cy, r + 1) : '';

  return (
    <g
      aria-label={onClick ? `${label} ${cfg.label || phase}` : undefined}
      className={onClick ? 'cursor-pointer' : undefined}
      onClick={onClick}
      onKeyDown={
        onClick
          ? (event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      {attentionLevel > 0.5 ? (
        <circle
          cx={cx}
          cy={cy}
          fill="none"
          r={r + 14}
          stroke={phase === 'red_captured' || phase === 'red_winning' ? '#ff335f' : '#14d1ff'}
          strokeOpacity={0.22 + attentionLevel * 0.32}
          strokeWidth={1.5}
        >
          <animate attributeName="stroke-opacity" dur="1.6s" repeatCount="indefinite" values="0.2;0.55;0.2" />
        </circle>
      ) : null}

      <defs>
        <linearGradient id={fillId} x1="0%" x2="100%" y1="0%" y2="100%">
          <stop offset="0%" stopColor={phase === 'blue_defended' || phase === 'blue_recaptured' ? '#06202a' : '#080f18'} />
          <stop offset={`${redShare}%`} stopColor={phase === 'blue_defended' || phase === 'blue_recaptured' ? '#07242d' : '#2a0813'} />
          <stop offset={`${redShare}%`} stopColor={phase === 'red_captured' ? '#450a18' : '#0a1623'} />
          <stop offset="100%" stopColor={phase === 'red_captured' ? '#1f0710' : phase === 'blue_winning' ? '#092534' : '#0a1019'} />
        </linearGradient>
      </defs>

      {isActive ? (
        <circle
          cx={cx}
          cy={cy}
          fill="none"
          r={r + 10}
          stroke={cfg.stroke}
          strokeDasharray="4 3"
          strokeOpacity={0.25 + contestIntensity * 0.32}
          strokeWidth={1}
        >
          <animate attributeName="r" begin="0s" dur="1.8s" repeatCount="indefinite" values={`${r + 8};${r + 20};${r + 8}`} />
          <animate attributeName="stroke-opacity" begin="0s" dur="1.8s" repeatCount="indefinite" values="0.45;0.08;0.45" />
        </circle>
      ) : null}

      {isHexNode(nodeType) ? (
        <path d={bodyPath} fill={`url(#${fillId})`} stroke={cfg.stroke} strokeWidth={severityWidth} />
      ) : (
        <circle cx={cx} cy={cy} fill={`url(#${fillId})`} r={r} stroke={cfg.stroke} strokeWidth={severityWidth} />
      )}

      {redControl > 0.01 ? (
        <circle
          cx={cx}
          cy={cy}
          fill="none"
          r={arcInner}
          stroke="#ff335f"
          strokeDasharray={`${Math.max(8, redControl * 140)} 160`}
          strokeLinecap="round"
          strokeWidth={2.8}
          transform={`rotate(-90 ${cx} ${cy})`}
        />
      ) : null}

      {blueControl > 0.01 ? (
        <circle
          cx={cx}
          cy={cy}
          fill="none"
          r={arcOuter}
          stroke="#4dd8ff"
          strokeDasharray={`${Math.max(8, blueControl * 160)} 180`}
          strokeLinecap="round"
          strokeWidth={2.6}
          transform={`rotate(90 ${cx} ${cy})`}
        />
      ) : null}

      {cfg.pulse ? (
        <circle cx={cx} cy={cy} fill="none" r={r} stroke={cfg.stroke} strokeWidth={1}>
          <animate attributeName="r" begin="0s" dur="1.5s" repeatCount="indefinite" values={`${r};${r + 5};${r}`} />
          <animate attributeName="stroke-opacity" begin="0s" dur="1.5s" repeatCount="indefinite" values="0.6;0.05;0.6" />
        </circle>
      ) : null}

      {isSelected ? (
        <circle cx={cx} cy={cy} fill="none" r={r + 18} stroke="#b0c6ff" strokeDasharray="6 6" strokeOpacity={0.85} strokeWidth={1.8}>
          <animateTransform
            attributeName="transform"
            dur="2.4s"
            from={`0 ${cx} ${cy}`}
            repeatCount="indefinite"
            to={`360 ${cx} ${cy}`}
            type="rotate"
          />
        </circle>
      ) : null}

      {cfg.icon ? (
        <text dominantBaseline="central" fill="white" fontSize={r * 0.72} textAnchor="middle" x={cx} y={cy}>
          {cfg.icon}
        </text>
      ) : null}

      {isRedHere ? (
        <circle cx={cx} cy={cy} fill="none" r={r + 14} stroke="#ff335f" strokeDasharray="6 6" strokeWidth={1.5}>
          <animateTransform
            attributeName="transform"
            dur="1.2s"
            from={`0 ${cx} ${cy}`}
            repeatCount="indefinite"
            to={`360 ${cx} ${cy}`}
            type="rotate"
          />
        </circle>
      ) : null}

      <text
        dominantBaseline="hanging"
        fill={cfg.stroke}
        fontFamily="'IBM Plex Mono', monospace"
        fontSize={7}
        textAnchor="middle"
        x={cx}
        y={cy + r + 8}
      >
        {label}
      </text>

      {cfg.label ? (
        <text
          dominantBaseline="auto"
          fill={cfg.stroke}
          fontFamily="'Orbitron', sans-serif"
          fontSize={5}
          opacity={0.82}
          textAnchor="middle"
          x={cx}
          y={cy - r - 10}
        >
          {cfg.label}
        </text>
      ) : null}
    </g>
  );
}

function isHexNode(nodeType: NetworkNode['type']) {
  return nodeType === 'dmz' || nodeType === 'db_server';
}

function hexagonPath(cx: number, cy: number, r: number) {
  const points = Array.from({ length: 6 }, (_, index) => {
    const angle = (Math.PI / 3) * index - Math.PI / 6;
    return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)];
  });

  return points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point[0]} ${point[1]}`).join(' ') + ' Z';
}
