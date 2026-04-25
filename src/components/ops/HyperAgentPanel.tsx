import { useEffect, useState, useCallback } from 'react';
import { useSimulationStore } from '../../store/simulationStore';

/* ── Types ─────────────────────────────────────────────────────────── */

interface StrategyData {
  agent_type: string;
  strategy_params: Record<string, number>;
  current_score: number;
  baseline_score: number;
  modifications_this_episode: number;
  meta_engine?: {
    evaluation_focus: string;
    change_magnitude: number;
    improvement_frequency: number;
    strategy_history_count: number;
    improvement_log_count: number;
  };
}

interface EvolutionEntry {
  generation: number;
  best_score: number;
  avg_score: number;
  timestamp: string;
}

interface AuditRecord {
  timestamp: string;
  agent_type: string;
  action: string;
  result: string;
  details: string;
}

interface MetaInsight {
  evaluation_focus: string;
  change_magnitude: number;
  improvement_frequency: number;
  strategy_history_count: number;
  improvement_log_count: number;
}

interface ImprovementRecord {
  timestamp: string;
  agent_type: string;
  parameter: string;
  old_value: number;
  new_value: number;
  reason: string;
}

/* ── Component ─────────────────────────────────────────────────────── */

export function HyperAgentPanel() {
  const { apiBaseUrl, isConnected } = useSimulationStore();

  const [status, setStatus] = useState<{ enabled: boolean; red: StrategyData | null; blue: StrategyData | null } | null>(null);
  const [evolution, setEvolution] = useState<{ red: { history: EvolutionEntry[] }; blue: { history: EvolutionEntry[] } } | null>(null);
  const [insights, setInsights] = useState<{ red: MetaInsight; blue: MetaInsight } | null>(null);
  const [audit, setAudit] = useState<AuditRecord[]>([]);
  const [improvements, setImprovements] = useState<ImprovementRecord[]>([]);
  const [toggleLoading, setToggleLoading] = useState(false);

  const poll = useCallback(async () => {
    if (!isConnected) return;
    try {
      const [statusRes, evoRes, insightRes, auditRes, impRes] = await Promise.all([
        fetch(`${apiBaseUrl}/api/hyper/status`),
        fetch(`${apiBaseUrl}/api/hyper/evolution`),
        fetch(`${apiBaseUrl}/api/hyper/meta-insights`),
        fetch(`${apiBaseUrl}/api/hyper/audit`),
        fetch(`${apiBaseUrl}/api/hyper/improvements`),
      ]);
      if (statusRes.ok) setStatus(await statusRes.json());
      if (evoRes.ok) setEvolution(await evoRes.json());
      if (insightRes.ok) setInsights(await insightRes.json());
      if (auditRes.ok) {
        const d = await auditRes.json();
        setAudit(d.audit_trail || []);
      }
      if (impRes.ok) {
        const d = await impRes.json();
        setImprovements(d.improvements || []);
      }
    } catch {
      // polling errors are non-fatal
    }
  }, [apiBaseUrl, isConnected]);

  useEffect(() => {
    poll();
    const id = setInterval(poll, 4000);
    return () => clearInterval(id);
  }, [poll]);

  const toggleHyper = async () => {
    if (!status) return;
    setToggleLoading(true);
    try {
      await fetch(`${apiBaseUrl}/api/hyper/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !status.enabled }),
      });
      await poll();
    } catch { /* ignore */ }
    setToggleLoading(false);
  };

  /* ── Evolution sparkline ──────────────────────────────────────────── */

  const renderSparkline = (history: EvolutionEntry[], color: string) => {
    if (!history?.length) return <div style={{ color: 'rgba(255,255,255,0.25)', fontSize: 10 }}>No evolution data yet</div>;
    const w = 280, h = 64;
    const scores = history.map(e => e.best_score);
    const min = Math.min(...scores, 0);
    const max = Math.max(...scores, 1);
    const range = Math.max(max - min, 0.001);
    const pts = scores.map((s, i) => {
      const x = (i / Math.max(1, scores.length - 1)) * (w - 8) + 4;
      const y = h - 4 - ((s - min) / range) * (h - 8);
      return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
    }).join(' ');
    return (
      <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height: h }}>
        <path d={pts} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" />
        {scores.length > 1 && (
          <circle cx={(w - 8) + 4} cy={h - 4 - ((scores[scores.length - 1] - min) / range) * (h - 8)} r="3" fill={color} />
        )}
      </svg>
    );
  };

  /* ── Strategy param bar ───────────────────────────────────────────── */

  const renderStrategyBars = (strategy: StrategyData | null, accent: string) => {
    if (!strategy?.strategy_params) return <div style={{ color: 'rgba(255,255,255,0.25)', fontSize: 10 }}>Awaiting strategy data…</div>;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {Object.entries(strategy.strategy_params).slice(0, 6).map(([key, val]) => (
          <div key={key}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, marginBottom: 2 }}>
              <span style={{ color: 'rgba(255,255,255,0.5)', fontFamily: '"IBM Plex Mono", monospace', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{key.replace(/_/g, ' ')}</span>
              <span style={{ color: accent, fontFamily: '"Share Tech Mono", monospace' }}>{typeof val === 'number' ? val.toFixed(2) : String(val)}</span>
            </div>
            <div style={{ height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
              <div style={{
                height: '100%', borderRadius: 2,
                width: `${Math.min(100, Math.max(2, (typeof val === 'number' ? val : 0) * 100))}%`,
                background: `linear-gradient(90deg, ${accent}44, ${accent})`,
                transition: 'width 400ms ease',
              }} />
            </div>
          </div>
        ))}
        <div style={{ display: 'flex', gap: 12, marginTop: 4, fontSize: 10, fontFamily: '"Share Tech Mono", monospace' }}>
          <span style={{ color: 'rgba(255,255,255,0.4)' }}>Score: <span style={{ color: accent }}>{strategy.current_score?.toFixed(2) ?? '—'}</span></span>
          <span style={{ color: 'rgba(255,255,255,0.4)' }}>Baseline: <span style={{ color: 'rgba(255,255,255,0.6)' }}>{strategy.baseline_score?.toFixed(2) ?? '—'}</span></span>
          <span style={{ color: 'rgba(255,255,255,0.4)' }}>Mods: <span style={{ color: '#ffcc00' }}>{strategy.modifications_this_episode ?? 0}</span></span>
        </div>
      </div>
    );
  };

  if (!isConnected) {
    return (
      <div style={{ padding: '32px 16px', textAlign: 'center' }}>
        <div style={{ fontFamily: '"Orbitron", monospace', fontSize: 28, color: 'rgba(143,0,255,0.2)', marginBottom: 12 }}>🧠</div>
        <div style={{ fontFamily: '"Orbitron", monospace', fontSize: 11, letterSpacing: '0.14em', color: 'rgba(143,0,255,0.5)', textTransform: 'uppercase' }}>HyperAgent Offline</div>
      </div>
    );
  }

  return (
    <div>

      {/* ── Header ─────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <div style={{ fontFamily: '"Orbitron", monospace', fontSize: 11, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#a855f7' }}>HyperAgent Meta-Engine</div>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', fontFamily: '"IBM Plex Mono", monospace', marginTop: 4 }}>
            Self-improving strategy layer · {status?.enabled ? 'ACTIVE' : 'DISABLED'}
          </div>
        </div>
        <button
          onClick={toggleHyper}
          disabled={toggleLoading}
          style={{
            padding: '6px 16px', borderRadius: 8, fontSize: 10,
            fontFamily: '"IBM Plex Mono", monospace', letterSpacing: '0.1em', textTransform: 'uppercase',
            cursor: 'pointer', transition: 'all 200ms ease',
            background: status?.enabled ? 'rgba(168,85,247,0.15)' : 'rgba(255,255,255,0.05)',
            border: `1px solid ${status?.enabled ? 'rgba(168,85,247,0.4)' : 'rgba(255,255,255,0.1)'}`,
            color: status?.enabled ? '#a855f7' : 'rgba(255,255,255,0.4)',
          }}
        >
          {status?.enabled ? '● Enabled' : '○ Disabled'}
        </button>
      </div>

      {/* ── Strategy Panels (Red / Blue) ───────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
        <div style={{ background: 'rgba(255,51,95,0.04)', border: '1px solid rgba(255,51,95,0.12)', borderRadius: 12, padding: 12 }}>
          <div style={{ fontFamily: '"Orbitron", monospace', fontSize: 9, letterSpacing: '0.14em', color: '#ff335f', marginBottom: 8 }}>RED STRATEGY</div>
          {renderStrategyBars(status?.red ?? null, '#ff335f')}
        </div>
        <div style={{ background: 'rgba(20,209,255,0.04)', border: '1px solid rgba(20,209,255,0.12)', borderRadius: 12, padding: 12 }}>
          <div style={{ fontFamily: '"Orbitron", monospace', fontSize: 9, letterSpacing: '0.14em', color: '#14d1ff', marginBottom: 8 }}>BLUE STRATEGY</div>
          {renderStrategyBars(status?.blue ?? null, '#14d1ff')}
        </div>
      </div>

      {/* ── Evolution Score Trend ───────────────────────────────── */}
      <div style={{ background: 'rgba(168,85,247,0.04)', border: '1px solid rgba(168,85,247,0.12)', borderRadius: 12, padding: 12, marginBottom: 16 }}>
        <div style={{ fontFamily: '"Orbitron", monospace', fontSize: 9, letterSpacing: '0.14em', color: '#a855f7', marginBottom: 8 }}>EVOLUTION SCORE TREND</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <div style={{ fontSize: 9, color: '#ff335f', marginBottom: 4, fontFamily: '"IBM Plex Mono", monospace' }}>Red Evolution</div>
            {renderSparkline(evolution?.red?.history || [], '#ff335f')}
          </div>
          <div>
            <div style={{ fontSize: 9, color: '#14d1ff', marginBottom: 4, fontFamily: '"IBM Plex Mono", monospace' }}>Blue Evolution</div>
            {renderSparkline(evolution?.blue?.history || [], '#14d1ff')}
          </div>
        </div>
      </div>

      {/* ── Meta-Insight Feed ──────────────────────────────────── */}
      <div style={{ background: 'rgba(168,85,247,0.04)', border: '1px solid rgba(168,85,247,0.12)', borderRadius: 12, padding: 12, marginBottom: 16 }}>
        <div style={{ fontFamily: '"Orbitron", monospace', fontSize: 9, letterSpacing: '0.14em', color: '#a855f7', marginBottom: 8 }}>META-INSIGHTS (SELF-REFLECTION)</div>
        {insights ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {(['red', 'blue'] as const).map(agent => {
              const d = insights[agent];
              if (!d) return null;
              const accent = agent === 'red' ? '#ff335f' : '#14d1ff';
              return (
                <div key={agent} style={{ fontSize: 10, fontFamily: '"IBM Plex Mono", monospace', lineHeight: 1.8, color: 'rgba(255,255,255,0.6)' }}>
                  <div style={{ color: accent, fontWeight: 600, marginBottom: 4, textTransform: 'uppercase' }}>{agent}</div>
                  <div>Focus: <span style={{ color: 'rgba(255,255,255,0.85)' }}>{d.evaluation_focus}</span></div>
                  <div>Δ Magnitude: <span style={{ color: accent }}>{typeof d.change_magnitude === 'number' ? d.change_magnitude.toFixed(3) : '—'}</span></div>
                  <div>Frequency: <span style={{ color: accent }}>{d.improvement_frequency}</span></div>
                  <div>History: <span style={{ color: 'rgba(255,255,255,0.85)' }}>{d.strategy_history_count} strategies</span></div>
                  <div>Improvements: <span style={{ color: '#ffcc00' }}>{d.improvement_log_count}</span></div>
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ color: 'rgba(255,255,255,0.25)', fontSize: 10 }}>Awaiting meta-reflection data…</div>
        )}
      </div>

      {/* ── Improvement Timeline ───────────────────────────────── */}
      {improvements.length > 0 && (
        <div style={{ background: 'rgba(255,204,0,0.04)', border: '1px solid rgba(255,204,0,0.12)', borderRadius: 12, padding: 12, marginBottom: 16 }}>
          <div style={{ fontFamily: '"Orbitron", monospace', fontSize: 9, letterSpacing: '0.14em', color: '#ffcc00', marginBottom: 8 }}>IMPROVEMENT TIMELINE</div>
          <div style={{ maxHeight: 160, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {improvements.slice(0, 10).map((imp, i) => (
              <div key={i} style={{ fontSize: 10, fontFamily: '"IBM Plex Mono", monospace', display: 'flex', gap: 8, alignItems: 'flex-start', color: 'rgba(255,255,255,0.6)' }}>
                <span style={{ color: imp.agent_type === 'red' ? '#ff335f' : '#14d1ff', fontWeight: 600, minWidth: 30 }}>{imp.agent_type?.toUpperCase()}</span>
                <span style={{ color: '#ffcc00' }}>{imp.parameter}</span>
                <span style={{ color: 'rgba(255,255,255,0.3)' }}>{imp.old_value?.toFixed?.(2)} → {imp.new_value?.toFixed?.(2)}</span>
                <span style={{ color: 'rgba(255,255,255,0.4)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{imp.reason}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Audit Trail ────────────────────────────────────────── */}
      <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: 12 }}>
        <div style={{ fontFamily: '"Orbitron", monospace', fontSize: 9, letterSpacing: '0.14em', color: 'rgba(255,255,255,0.5)', marginBottom: 8 }}>AUDIT TRAIL</div>
        {audit.length > 0 ? (
          <div style={{ maxHeight: 140, overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10, fontFamily: '"IBM Plex Mono", monospace' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  {['Agent', 'Action', 'Result', 'Details'].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '4px 6px', color: 'rgba(255,255,255,0.35)', fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {audit.slice(0, 15).map((r, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                    <td style={{ padding: '3px 6px', color: r.agent_type === 'red' ? '#ff335f' : '#14d1ff' }}>{r.agent_type?.toUpperCase()}</td>
                    <td style={{ padding: '3px 6px', color: 'rgba(255,255,255,0.6)' }}>{r.action}</td>
                    <td style={{ padding: '3px 6px', color: r.result === 'approved' ? '#00ff88' : r.result === 'rejected' ? '#ff335f' : '#ffcc00' }}>{r.result}</td>
                    <td style={{ padding: '3px 6px', color: 'rgba(255,255,255,0.4)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.details}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ color: 'rgba(255,255,255,0.25)', fontSize: 10 }}>No audit records yet.</div>
        )}
      </div>
    </div>
  );
}

export default HyperAgentPanel;
