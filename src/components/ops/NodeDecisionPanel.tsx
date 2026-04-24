import type { DecisionScores, KillChainState, NodeBattleResult, ThreatAlert } from '../../lib/ops-types';

interface NodeDecisionPanelProps {
  nodeId: number;
  nodeLabel: string;
  nodeStatus: string;
  nodeDescription?: string;
  redQValues: DecisionScores | undefined;
  bluePolicyProbs: DecisionScores | undefined;
  alerts: ThreatAlert[];
  battleResult: NodeBattleResult | undefined;
  killChain: KillChainState | null;
  onClose: () => void;
}

const ACTION_LABELS: Record<string, string> = {
  monitor: 'Monitor',
  isolate: 'Isolate',
  patch: 'Patch',
  scan: 'Scan',
  decoy: 'Deploy Decoy',
  block: 'Block Traffic',
  brute_force: 'Brute Force',
  lateral_movement: 'Lateral Movement',
  data_exfiltration: 'Data Exfiltration',
  c2_beacon: 'C2 Beacon',
  recon: 'Reconnaissance',
  exploit: 'Exploit Vulnerability',
  persist: 'Establish Persistence',
};

function formatAction(key: string): string {
  return ACTION_LABELS[key] || key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function DecisionBar({ label, value, maxVal, isChosen, color }: {
  label: string; value: number; maxVal: number; isChosen: boolean; color: string;
}) {
  const pct = maxVal > 0 ? Math.max(2, (Math.abs(value) / maxVal) * 100) : 2;
  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
        <span style={{
          fontFamily: '"IBM Plex Mono", monospace',
          fontSize: 11,
          color: isChosen ? color : 'rgba(255,255,255,0.7)',
          fontWeight: isChosen ? 700 : 400,
        }}>
          {formatAction(label)} {isChosen ? '← CHOSEN' : ''}
        </span>
        <span style={{
          fontFamily: '"Share Tech Mono", monospace',
          fontSize: 12,
          color: isChosen ? color : 'rgba(255,255,255,0.5)',
          fontWeight: isChosen ? 700 : 400,
        }}>
          {(value * 100).toFixed(1)}%
        </span>
      </div>
      <div style={{ height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
        <div style={{
          height: '100%',
          width: `${pct}%`,
          borderRadius: 3,
          background: isChosen ? color : 'rgba(255,255,255,0.15)',
          boxShadow: isChosen ? `0 0 8px ${color}44` : 'none',
          transition: 'width 300ms ease',
        }} />
      </div>
    </div>
  );
}

export default function NodeDecisionPanel({
  nodeId,
  nodeLabel,
  nodeStatus,
  nodeDescription,
  redQValues,
  bluePolicyProbs,
  alerts,
  battleResult,
  killChain,
  onClose,
}: NodeDecisionPanelProps) {
  const nodeAlerts = alerts.filter((a) => a.affected_hosts?.includes(nodeId));
  const maxRed = redQValues ? Math.max(...Object.values(redQValues), 0.01) : 1;
  const maxBlue = bluePolicyProbs ? Math.max(...Object.values(bluePolicyProbs), 0.01) : 1;
  const chosenRed = redQValues
    ? (Object.entries(redQValues).sort(([, a], [, b]) => b - a)[0]?.[0] ?? null)
    : null;
  const chosenBlue = bluePolicyProbs
    ? (Object.entries(bluePolicyProbs).sort(([, a], [, b]) => b - a)[0]?.[0] ?? null)
    : null;

  /* Build reasoning chain */
  const reasoningChain: string[] = [];
  if (nodeStatus === 'compromised' || nodeStatus === 'under_attack') {
    reasoningChain.push(`Host ${nodeLabel} is currently ${nodeStatus.replace('_', ' ')}`);
  }
  if (nodeAlerts.length > 0) {
    nodeAlerts.forEach((a) => {
      reasoningChain.push(`Alert: ${a.mitre_name} (${a.severity}) — ${a.headline}`);
    });
  }
  if (battleResult) {
    reasoningChain.push(`Contest result: ${battleResult.winner === 'red' ? 'Red captured' : battleResult.winner === 'blue' ? 'Blue defended' : 'Contested'}`);
  }
  if (killChain && killChain.current_stage >= 3) {
    reasoningChain.push(`Kill Chain Oracle: Stage ${killChain.current_stage_name} — breach in ${killChain.breach_countdown_display}`);
  }
  if (redQValues && chosenRed) {
    const topRedVal = redQValues[chosenRed];
    if (topRedVal > 0.5) {
      reasoningChain.push(`Red agent high confidence (${(topRedVal * 100).toFixed(0)}%) on ${formatAction(chosenRed)} — indicates active exploitation`);
    }
  }

  const statusColor: Record<string, string> = {
    clean: '#00e5ff',
    compromised: '#ff0044',
    detected: '#ffcc00',
    isolated: '#5b6b89',
    under_attack: '#ff6600',
  };

  return (
    <div style={{
      position: 'fixed',
      top: 80,
      right: 24,
      width: 380,
      maxWidth: 'calc(100vw - 48px)',
      maxHeight: 'calc(100vh - 120px)',
      overflowY: 'auto',
      zIndex: 100,
      background: 'rgba(8, 14, 28, 0.92)',
      backdropFilter: 'blur(20px)',
      border: '1px solid rgba(0, 229, 255, 0.2)',
      borderRadius: 14,
      padding: '20px 22px',
      boxShadow: '0 12px 48px rgba(0,0,0,0.5), 0 0 0 1px rgba(0,229,255,0.08)',
      pointerEvents: 'auto',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div>
          <div style={{
            fontFamily: '"Orbitron", monospace',
            fontSize: 14,
            fontWeight: 700,
            color: statusColor[nodeStatus] || '#00e5ff',
            letterSpacing: '0.1em',
          }}>
            {nodeLabel}
          </div>
          <div style={{
            fontFamily: '"IBM Plex Mono", monospace',
            fontSize: 10,
            color: 'rgba(255,255,255,0.45)',
            textTransform: 'uppercase',
            letterSpacing: '0.12em',
            marginTop: 4,
          }}>
            Node {nodeId} · {nodeStatus.replace('_', ' ')}
          </div>
          {nodeDescription && nodeDescription.split('\n').map((line, i) => (
            <div key={i} style={{
              fontFamily: '"IBM Plex Mono", monospace',
              fontSize: 11,
              color: i === 0 ? 'rgba(255,255,255,0.65)' : 'rgba(255,255,255,0.4)',
              lineHeight: 1.5,
              marginTop: i === 0 ? 6 : 0,
            }}>{line}</div>
          ))}
        </div>
        <button
          onClick={onClose}
          style={{
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 8,
            color: 'rgba(255,255,255,0.5)',
            cursor: 'pointer',
            fontSize: 14,
            lineHeight: '20px',
            padding: '2px 10px',
          }}
          type="button"
        >
          ✕
        </button>
      </div>

      {/* MITRE ATT&CK MAPPER INJECTION */}
      {nodeAlerts.length > 0 && (
        <div style={{
          background: 'rgba(255, 102, 0, 0.04)',
          border: '1px solid rgba(255, 102, 0, 0.2)',
          borderRadius: 8,
          padding: '10px 12px',
          marginBottom: 16,
        }}>
          <div style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: 10, color: 'rgba(255, 102, 0, 0.6)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 }}>
            MITRE ATT&CK MAPPER
          </div>
          {nodeAlerts.map((a, i) => (
             <div key={i} style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: 11, color: '#ffcc00', lineHeight: 1.6, marginBottom: i < nodeAlerts.length - 1 ? 6 : 0 }}>
               <strong>[{a.mitre_id || 'TXXXX'}]</strong> {a.mitre_name || 'Pending'}
               <div style={{color: 'rgba(255,255,255,0.4)', fontSize: 10, marginTop: 2}}>{a.headline}</div>
             </div>
          ))}
        </div>
      )}

      {/* Traditional vs RL explanation */}
      <div style={{
        background: 'rgba(0, 229, 255, 0.04)',
        border: '1px solid rgba(0, 229, 255, 0.1)',
        borderRadius: 8,
        padding: '10px 12px',
        marginBottom: 16,
      }}>
        <div style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: 10, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 }}>
          Decision Transparency
        </div>
        <div style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: 11, color: 'rgba(255,255,255,0.6)', lineHeight: 1.6 }}>
          <span style={{ color: 'rgba(255,255,255,0.35)' }}>Traditional:</span> &quot;Alert fired because score &gt; threshold&quot;
          <br />
          <span style={{ color: '#00e5ff' }}>RL Agent:</span> We show the <strong style={{ color: '#00e5ff' }}>Q-value distribution</strong> — the actual probabilities the agent considered before deciding.
        </div>
      </div>

      {/* Red Agent Q-Values */}
      {redQValues && Object.keys(redQValues).length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{
            fontFamily: '"Orbitron", monospace',
            fontSize: 10,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: '#ff335f',
            marginBottom: 8,
          }}>
            Red Agent — Attack Q-Values
          </div>
          {Object.entries(redQValues)
            .sort(([, a], [, b]) => b - a)
            .map(([key, val]) => (
              <DecisionBar
                key={key}
                label={key}
                value={val}
                maxVal={maxRed}
                isChosen={key === chosenRed}
                color="#ff335f"
              />
            ))}
        </div>
      )}

      {/* Blue Agent Policy Probs */}
      {bluePolicyProbs && Object.keys(bluePolicyProbs).length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{
            fontFamily: '"Orbitron", monospace',
            fontSize: 10,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: '#14d1ff',
            marginBottom: 8,
          }}>
            Blue Agent — Defense Policy
          </div>
          {Object.entries(bluePolicyProbs)
            .sort(([, a], [, b]) => b - a)
            .map(([key, val]) => (
              <DecisionBar
                key={key}
                label={key}
                value={val}
                maxVal={maxBlue}
                isChosen={key === chosenBlue}
                color="#14d1ff"
              />
            ))}
        </div>
      )}

      {/* Reasoning Chain */}
      {reasoningChain.length > 0 && (
        <div>
          <div style={{
            fontFamily: '"Orbitron", monospace',
            fontSize: 10,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: '#ffcc00',
            marginBottom: 8,
          }}>
            Why This Decision?
          </div>
          <div style={{
            background: 'rgba(255, 204, 0, 0.04)',
            border: '1px solid rgba(255, 204, 0, 0.1)',
            borderRadius: 8,
            padding: '10px 12px',
          }}>
            {reasoningChain.map((reason, i) => (
              <div key={i} style={{
                fontFamily: '"IBM Plex Mono", monospace',
                fontSize: 11,
                color: 'rgba(255,255,255,0.7)',
                lineHeight: 1.7,
                paddingBottom: i < reasoningChain.length - 1 ? 6 : 0,
                marginBottom: i < reasoningChain.length - 1 ? 6 : 0,
                borderBottom: i < reasoningChain.length - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none',
              }}>
                <span style={{ color: '#ffcc00', marginRight: 6 }}>▸</span>
                {reason}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* No data state */}
      {!redQValues && !bluePolicyProbs && reasoningChain.length === 0 && (
        <div style={{
          fontFamily: '"IBM Plex Mono", monospace',
          fontSize: 12,
          color: 'rgba(255,255,255,0.35)',
          textAlign: 'center',
          padding: '20px 0',
        }}>
          Connect and advance the simulation to see agent decisions for this node.
        </div>
      )}
    </div>
  );
}
