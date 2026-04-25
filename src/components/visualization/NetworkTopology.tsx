import * as d3 from 'd3';
import { useState } from 'react';
import type { ContestEvent, DecisionScores, NetworkEdge, NetworkNode } from '../../lib/ops-types';
import BattleParticleCanvas from '../ops/BattleParticleCanvas';
import ContestNode from '../ops/ContestNode';

interface PositionedNode extends NetworkNode {
  x: number;
  y: number;
}

interface NetworkTopologyProps {
  nodes: NetworkNode[];
  links: NetworkEdge[];
  width?: number;
  height?: number;
  contestEvents?: ContestEvent[];
  redQValues?: Record<string, DecisionScores>;
  bluePolicyProbs?: Record<string, DecisionScores>;
  selectedNodeId?: number | null;
  onNodeClick?: (nodeId: number) => void;
}

const DEFAULT_WIDTH = 1100;
const DEFAULT_HEIGHT = 660;
const NODE_RADIUS = 22;

const zoneOrder: Array<NetworkNode['type']> = ['internet', 'dmz', 'app_server', 'db_server', 'workstation'];

// ── Zone color system (clear, accessible, high-contrast) ────────────────────
const ZONE_COLORS: Record<string, { bg: string; border: string; label: string; tag: string }> = {
  dmz:         { bg: 'rgba(0,180,216,0.06)',  border: 'rgba(0,180,216,0.25)',  label: '#00b4d8', tag: 'DMZ' },
  app_server:  { bg: 'rgba(255,165,0,0.06)',  border: 'rgba(255,165,0,0.25)',  label: '#ffa500', tag: 'APPLICATION' },
  db_server:   { bg: 'rgba(190,80,255,0.06)', border: 'rgba(190,80,255,0.25)', label: '#be50ff', tag: 'DATABASE' },
  workstation: { bg: 'rgba(0,255,136,0.06)',  border: 'rgba(0,255,136,0.25)',  label: '#00ff88', tag: 'WORKSTATION' },
  internet:    { bg: 'rgba(255,255,255,0.03)', border: 'rgba(255,255,255,0.12)', label: '#ffffff', tag: 'INTERNET' },
};

const ZONE_LABELS: Record<string, string> = {
  dmz: 'DMZ — Perimeter',
  app_server: 'Application Servers',
  db_server: 'Databases',
  workstation: 'Workstations & Users',
  internet: 'Internet',
};

const edgeStyle = (edge: NetworkEdge) => {
  if (!edge.is_active) {
    return { stroke: 'rgba(88, 102, 129, 0.55)', width: 1.2, dash: '8 10' };
  }
  if (edge.edge_type === 'attack' || edge.edge_type === 'exfil') {
    return { stroke: '#ff335f', width: 3, dash: '' };
  }
  if (edge.edge_type === 'lateral') {
    return { stroke: '#ff9f43', width: 2.6, dash: '10 8' };
  }
  if (edge.edge_type === 'beacon') {
    return { stroke: '#ffcf5c', width: 2.2, dash: '4 10' };
  }
  return { stroke: '#4dd8ff', width: 1.8, dash: '' };
};

const fallbackPhase = (node: NetworkNode): ContestEvent['phase'] => {
  if (node.status === 'compromised') {
    return 'red_captured';
  }
  if (node.status === 'isolated') {
    return 'blue_defended';
  }
  if (node.status === 'under_attack' || node.status === 'detected') {
    return 'contested';
  }
  return 'idle';
};

export function NetworkTopology({
  nodes,
  links,
  width = DEFAULT_WIDTH,
  height = DEFAULT_HEIGHT,
  contestEvents = [],
  redQValues = {},
  bluePolicyProbs = {},
  selectedNodeId = null,
  onNodeClick,
}: NetworkTopologyProps) {
  const [hoveredNodeId, setHoveredNodeId] = useState<number | null>(null);
  const positionedNodes = layoutNodes(nodes, width, height);
  const nodeMap = new Map(positionedNodes.map((node) => [node.id, node]));
  const contestMap = new Map(contestEvents.map((event) => [event.node_id, event]));
  const linkPaths = links
    .map((link, index) => {
      const source = nodeMap.get(link.source);
      const target = nodeMap.get(link.target);
      if (!source || !target) {
        return null;
      }
      const pathId = `battle-edge-${index}-${source.id}-${target.id}`;
      return {
        ...link,
        pathId,
        path: buildEdgePath(source, target),
        source,
        target,
      };
    })
    .filter(Boolean) as Array<NetworkEdge & { pathId: string; path: string; source: PositionedNode; target: PositionedNode }>;

  const nodePositions = new Map(positionedNodes.map((node) => [node.id, { x: node.x, y: node.y }]));
  const overlayNodeId = hoveredNodeId ?? selectedNodeId;
  const overlayNode = overlayNodeId !== null ? nodeMap.get(overlayNodeId) || null : null;
  const overlayContest = overlayNodeId !== null ? contestMap.get(overlayNodeId) || null : null;
  const overlayRed = overlayNodeId !== null ? redQValues[String(overlayNodeId)] || {} : {};
  const overlayBlue = overlayNodeId !== null ? bluePolicyProbs[String(overlayNodeId)] || {} : {};

  return (
    <div className="relative min-h-[620px] overflow-hidden rounded-[20px] border border-cyan-400/10 bg-[radial-gradient(circle_at_top,rgba(12,52,89,0.24),transparent_45%),linear-gradient(180deg,rgba(5,12,24,0.96),rgba(6,10,18,0.99))]">
      <svg className="h-full w-full" preserveAspectRatio="xMidYMid meet" viewBox={`0 0 ${width} ${height}`}>
        <defs>
          <filter id="edge-glow">
            <feGaussianBlur result="blur" stdDeviation="2.5" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {zoneOrder
          .filter((type) => type !== 'internet')
          .map((type) => {
            const zoneNodes = positionedNodes.filter((node) => node.type === type);
            if (!zoneNodes.length) {
              return null;
            }
            const zc = ZONE_COLORS[type] || ZONE_COLORS.internet;
            const minY = Math.min(...zoneNodes.map((n) => n.y));
            const maxY = Math.max(...zoneNodes.map((n) => n.y));
            const padY = 36;
            return (
              <g key={type}>
                {/* Zone background band */}
                <rect
                  fill={zc.bg}
                  height={maxY - minY + padY * 2}
                  rx={8}
                  stroke={zc.border}
                  strokeWidth={1}
                  width={width - 120}
                  x={60}
                  y={minY - padY}
                />
                {/* Zone label with tag */}
                <text className="ops-display" fill={zc.label} fontSize="10" fontWeight="600" x={72} y={minY - padY + 14}>
                  {ZONE_LABELS[type] || type.replace('_', ' ').toUpperCase()}
                </text>
                {/* Zone tag badge */}
                <rect fill={zc.label} height="14" rx={3} width={zc.tag.length * 7 + 12} x={72} y={minY - padY + 20} />
                <text fill="#0a1628" fontSize="8" fontWeight="700" x={78} y={minY - padY + 30}>
                  {zc.tag}
                </text>
              </g>
            );
          })}

        <g filter="url(#edge-glow)">
          {linkPaths.map((link) => {
            const style = edgeStyle(link);
            return (
              <g key={link.pathId}>
                <path
                  d={link.path}
                  fill="none"
                  id={link.pathId}
                  stroke={style.stroke}
                  strokeDasharray={style.dash}
                  strokeLinecap="round"
                  strokeOpacity={link.is_active ? 0.9 : 0.45}
                  strokeWidth={style.width}
                >
                  {style.dash ? (
                    <animate
                      attributeName="stroke-dashoffset"
                      dur={link.edge_type === 'beacon' ? '2.4s' : '3.2s'}
                      from="0"
                      repeatCount="indefinite"
                      to="-40"
                    />
                  ) : null}
                </path>

                {link.is_active
                  ? Array.from({ length: Math.min(3, Math.max(1, link.particle_count || 1)) }).map((_, particleIndex) => (
                      <circle fill={link.particle_color} key={`${link.pathId}-${particleIndex}`} r={2.2}>
                        <animateMotion
                          begin={`${particleIndex * 0.35}s`}
                          dur={`${Math.max(1.2, 3.6 - link.particle_speed)}s`}
                          path={link.path}
                          repeatCount="indefinite"
                        />
                      </circle>
                    ))
                  : null}
              </g>
            );
          })}
        </g>

        <g>
          {positionedNodes.map((node) => {
            const contest = contestMap.get(node.id);
            const attentionLevel = Math.max(
              ...Object.values(redQValues[String(node.id)] || {}),
              ...Object.values(bluePolicyProbs[String(node.id)] || {}),
              0,
            );
            return (
              <ContestNode
                attentionLevel={attentionLevel}
                blueControl={contest?.blue_control_pct ?? (node.status === 'isolated' ? 0.92 : 0.28)}
                contestIntensity={contest?.contest_intensity ?? (node.status === 'under_attack' ? 0.55 : 0.08)}
                cx={node.x}
                cy={node.y}
                isRedHere={node.is_red_current_position}
                isSelected={selectedNodeId === node.id}
                key={node.id}
                label={node.label}
                nodeType={node.type}
                onClick={onNodeClick ? () => onNodeClick(node.id) : undefined}
                onMouseEnter={() => setHoveredNodeId(node.id)}
                onMouseLeave={() => setHoveredNodeId((current) => (current === node.id ? null : current))}
                phase={contest?.phase ?? fallbackPhase(node)}
                r={NODE_RADIUS}
                redControl={contest?.red_control_pct ?? (node.status === 'compromised' ? 0.92 : node.status === 'under_attack' ? 0.55 : 0.06)}
                severity={contest?.severity ?? 'low'}
              />
            );
          })}
        </g>

        {overlayNode ? (
          <DecisionThoughtBubble
            blueScores={overlayBlue}
            contest={overlayContest}
            height={height}
            node={overlayNode}
            redScores={overlayRed}
            width={width}
          />
        ) : null}

        {/* ── Legend Panel ─────────────────────────────────────── */}
        <g transform={`translate(${width - 180}, 12)`}>
          <rect fill="rgba(8,14,24,0.92)" height={148} rx={8} stroke="rgba(255,255,255,0.1)" strokeWidth={1} width={172} />
          <text fill="rgba(255,255,255,0.7)" fontSize="9" fontWeight="600" x={10} y={16}>LEGEND</text>

          {/* Zone colors */}
          {['dmz', 'app_server', 'db_server', 'workstation'].map((zone, i) => {
            const zc = ZONE_COLORS[zone];
            return (
              <g key={zone} transform={`translate(10, ${28 + i * 16})`}>
                <rect fill={zc.label} height={8} rx={2} width={8} />
                <text fill="rgba(255,255,255,0.65)" fontSize={8} x={14} y={8}>{ZONE_LABELS[zone]}</text>
              </g>
            );
          })}

          {/* Edge types */}
          <line stroke="#ff335f" strokeWidth={2} x1={10} x2={30} y1={100} y2={100} />
          <text fill="rgba(255,255,255,0.65)" fontSize={8} x={34} y={103}>Attack / Exfil</text>

          <line stroke="#ff9f43" strokeDasharray="6 4" strokeWidth={2} x1={10} x2={30} y1={114} y2={114} />
          <text fill="rgba(255,255,255,0.65)" fontSize={8} x={34} y={117}>Lateral Move</text>

          <line stroke="#4dd8ff" strokeWidth={1.5} x1={10} x2={30} y1={128} y2={128} />
          <text fill="rgba(255,255,255,0.65)" fontSize={8} x={34} y={131}>Normal Traffic</text>

          {/* Node shapes */}
          <text fill="rgba(255,255,255,0.45)" fontSize={7} x={10} y={145}>⬡ DMZ/DB  ○ App/WS</text>
        </g>
      </svg>

      <BattleParticleCanvas events={contestEvents} height={height} nodePositions={nodePositions} width={width} />
    </div>
  );
}

function DecisionThoughtBubble({
  node,
  redScores,
  blueScores,
  width,
  height,
  contest,
}: {
  node: PositionedNode;
  redScores: DecisionScores;
  blueScores: DecisionScores;
  width: number;
  height: number;
  contest: ContestEvent | null;
}) {
  const bubbleWidth = 272;
  const hasContext = Boolean(contest?.detection_reason || contest?.immediate_action);
  const bubbleHeight = hasContext ? 288 : 172;
  const x = node.x > width - bubbleWidth - 36 ? node.x - bubbleWidth - 28 : node.x + 28;
  const y = Math.max(24, Math.min(height - bubbleHeight - 24, node.y - bubbleHeight / 2));
  const redEntries = rankedScores(redScores);
  const blueEntries = rankedScores(blueScores);
  const attention = contest?.phase === 'red_winning' || contest?.phase === 'red_captured' ? 'HIGH ATTENTION' : 'BLUE CONSIDERING';

  return (
    <g pointerEvents="none" transform={`translate(${x} ${y})`}>
      <rect
        fill="rgba(12, 14, 18, 0.94)"
        height={bubbleHeight}
        rx="18"
        stroke="rgba(176, 198, 255, 0.16)"
        width={bubbleWidth}
      />
      <text className="ops-display" fill="#e1e2e7" fontSize="10" x="14" y="20">
        {node.label}
      </text>
      <text className="ops-label" fill="#a6e6ff" fontSize="8" x={bubbleWidth - 112} y="20">
        {attention}
      </text>

      <text className="ops-label" fill="#ff6f91" fontSize="8" x="14" y="42">RED Q-VALUES</text>
      {redEntries.map(([label, value], index) => (
        <BarRow color="#ff335f" key={`red-${label}`} label={label} value={value} x={14} y={56 + index * 22} />
      ))}

      <text className="ops-label" fill="#82e8ff" fontSize="8" x="14" y="128">BLUE POLICY</text>
      {blueEntries.map(([label, value], index) => (
        <BarRow color="#14d1ff" key={`blue-${label}`} label={label} value={value} x={14} y={142 + index * 22} />
      ))}

      {contest?.detection_reason ? (
        <>
          <line stroke="rgba(255,255,255,0.08)" x1="14" x2={bubbleWidth - 14} y1="182" y2="182" />
          <text className="ops-label" fill="#ffcc00" fontSize="7" x="14" y="198">WHY FLAGGED</text>
          <WrappedText fill="rgba(225,226,231,0.75)" fontSize={8} maxWidth={bubbleWidth - 28} text={contest.detection_reason} x={14} y={212} />
        </>
      ) : null}

      {contest?.immediate_action ? (
        <>
          <line stroke="rgba(255,255,255,0.08)" x1="14" x2={bubbleWidth - 14} y1="240" y2="240" />
          <text className="ops-label" fill="#00ff88" fontSize="7" x="14" y="256">WHAT TO DO</text>
          <WrappedText fill="rgba(225,226,231,0.75)" fontSize={8} maxWidth={bubbleWidth - 28} text={contest.immediate_action} x={14} y={270} />
        </>
      ) : null}
    </g>
  );
}

function WrappedText({ text, x, y, fontSize, fill, maxWidth }: { text: string; x: number; y: number; fontSize: number; fill: string; maxWidth: number }) {
  const charsPerLine = Math.floor(maxWidth / (fontSize * 0.52));
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    if ((current + ' ' + word).trim().length > charsPerLine && current) {
      lines.push(current);
      current = word;
    } else {
      current = current ? current + ' ' + word : word;
    }
  }
  if (current) lines.push(current);
  return (
    <>
      {lines.slice(0, 2).map((line, i) => (
        <text fill={fill} fontSize={fontSize} key={i} x={x} y={y + i * (fontSize + 3)}>
          {line}{i === 1 && lines.length > 2 ? '…' : ''}
        </text>
      ))}
    </>
  );
}

function BarRow({
  label,
  value,
  color,
  x,
  y,
}: {
  label: string;
  value: number;
  color: string;
  x: number;
  y: number;
}) {
  const width = 96;
  return (
    <g transform={`translate(${x} ${y})`}>
      <text className="ops-label" fill="rgba(225,226,231,0.8)" fontSize="7" x="0" y="0">
        {label.replace(/_/g, ' ')}
      </text>
      <rect fill="rgba(255,255,255,0.08)" height="8" rx="4" width={width} x="92" y="-7" />
      <rect fill={color} height="8" rx="4" width={Math.max(8, width * value)} x="92" y="-7" />
      <text className="ops-data" fill="#ffffff" fontSize="8" textAnchor="end" x="206" y="0">
        {Math.round(value * 100)}%
      </text>
    </g>
  );
}

function rankedScores(scores: DecisionScores) {
  return Object.entries(scores).sort((a, b) => b[1] - a[1]).slice(0, 3);
}

function buildEdgePath(source: PositionedNode, target: PositionedNode) {
  const deltaY = Math.abs(target.y - source.y);
  const controlOffset = Math.max(40, deltaY * 0.35);
  return `M ${source.x} ${source.y} C ${source.x} ${source.y + controlOffset} ${target.x} ${target.y - controlOffset} ${target.x} ${target.y}`;
}

function layoutNodes(nodes: NetworkNode[], width: number, height: number): PositionedNode[] {
  const byType = new Map<NetworkNode['type'], NetworkNode[]>();

  for (const type of zoneOrder) {
    byType.set(type, []);
  }

  nodes.forEach((node) => {
    const current = byType.get(node.type) || [];
    current.push(node);
    byType.set(node.type, current);
  });

  return nodes.map((node) => {
    if (node.type === 'internet') {
      return {
        ...node,
        x: width / 2,
        y: 72,
      };
    }

    const siblings = byType.get(node.type) || [node];
    const scale = d3
      .scalePoint<number>()
      .domain(siblings.map((item) => item.id))
      .range([110, width - 110])
      .padding(0.6);

    return {
      ...node,
      x: scale(node.id) ?? width / 2,
      y: Math.round(Math.max(112, Math.min(height - 72, node.zone_y * height))),
    };
  });
}
