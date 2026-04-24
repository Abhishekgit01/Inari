import AptAttribution from '../components/ops/AptAttribution';
import BattleScoreboard from '../components/ops/BattleScoreboard';
import BattleTimeline from '../components/ops/BattleTimeline';
import BattleToastManager from '../components/ops/BattleToast';
import BreachCountdown from '../components/ops/BreachCountdown';
import VelocitySparkline from '../components/ops/VelocitySparkline';
import { useSimulationStore } from '../store/simulationStore';

export function SimulationPage() {
  const {
    aptAttribution,
    battleResults,
    blueCumulative,
    episodeHistorySummary,
    generateStep,
    isConnected,
    killChain,
    latestBlueAction,
    latestRedAction,
    logs,
    maxSteps,
    network,
    redCumulative,
    resetSimulation,
    scoreboard,
    simulationId,
    step,
  } = useSimulationStore();

  const redFeed = logs.filter((entry) => entry.team === 'red').slice(0, 8);
  const blueFeed = logs.filter((entry) => entry.team === 'blue').slice(0, 8);
  const totals = Math.max(1, Math.abs(redCumulative) + Math.abs(blueCumulative));
  const redPct = Math.max(12, (Math.abs(redCumulative) / totals) * 100);
  const bluePct = Math.max(12, (Math.abs(blueCumulative) / totals) * 100);

  /* ── Demo fallback data for when no live simulation is connected ── */
  const demoKillChain = killChain || {
    current_stage: 3,
    current_stage_name: 'C2',
    max_stage_reached: 3,
    stage_color: '#ff6600',
    kill_chain_progress: 0.43,
    velocity: 0.62,
    velocity_history: [0.1, 0.25, 0.38, 0.5, 0.62],
    acceleration: 0.12,
    velocity_label: 'Accelerating',
    dwell_time_steps: 4,
    dwell_time_seconds: 12,
    dwell_time_display: '12s',
    breach_countdown_seconds: 272,
    breach_countdown_display: '04:32',
    breach_confidence: 0.87,
    urgency: 'high' as const,
    urgency_color: '#ff6600',
    top_apt_match: 'APT28',
    top_apt_score: 0.82,
    apt_similarity: { APT28: 0.82, APT29: 0.64, Lazarus: 0.41 },
    stage_history: [1, 2, 2, 3, 3, 3],
  };

  const demoAptAttribution = aptAttribution?.length ? aptAttribution : [
    { name: 'APT28 (Fancy Bear)', score: 0.82, score_percent: 82, bar_fill: 82, nation: 'Russia', flag: '\uD83C\uDDF7\uD83C\uDDFA', targets: ['Government', 'Military'], risk_note: 'High confidence nation-state actor', color: '#ff335f', is_top_match: true },
    { name: 'APT29 (Cozy Bear)', score: 0.64, score_percent: 64, bar_fill: 64, nation: 'Russia', flag: '\uD83C\uDDF7\uD83C\uDDFA', targets: ['Think Tanks', 'Cloud'], risk_note: 'Supply chain specialist', color: '#ff6600', is_top_match: false },
    { name: 'Lazarus Group', score: 0.41, score_percent: 41, bar_fill: 41, nation: 'North Korea', flag: '\uD83C\uDDF0\uD83C\uDDF5', targets: ['Financial', 'Cryptocurrency'], risk_note: 'Financially motivated', color: '#ffcc00', is_top_match: false },
  ];

  return (
    <div className="page-stack">
      <BattleToastManager results={battleResults} />

      <BattleScoreboard
        episodeId={simulationId || network?.episode_id || 'EP-BOOT'}
        maxSteps={maxSteps}
        scoreboard={scoreboard}
        step={step}
      />

      <section className="ops-card p-5">
        <div className="ops-display text-[0.62rem] text-secondary/70">Agent Battle Viewer</div>
        <div className="battle-tug">
          <div className="battle-score red-score" style={{ width: `${redPct}%` }}>
            <span>RED AGENT</span>
            <strong>{redCumulative.toFixed(1)}</strong>
          </div>
          <div className="battle-score blue-score" style={{ width: `${bluePct}%` }}>
            <strong>{blueCumulative.toFixed(1)}</strong>
            <span>BLUE AGENT</span>
          </div>
        </div>
      </section>

      {/* Kill Chain Oracle */}
      <section className="ops-card p-4">
        <div className="section-heading-row">
          <div>
            <div className="ops-display text-[0.62rem] text-secondary/70">Kill Chain Oracle</div>
            <h2 className="panel-title">Breach Countdown + APT Attribution</h2>
          </div>
          <span className="status-pill" style={{ color: demoKillChain.urgency_color }}>{demoKillChain.velocity_label}</span>
        </div>
        <div className="mt-4 flex flex-col gap-4">
          <BreachCountdown
            countdownDisplay={demoKillChain.breach_countdown_display || '--:--'}
            countdownSeconds={demoKillChain.breach_countdown_seconds}
            confidence={demoKillChain.breach_confidence || 0}
            urgency={demoKillChain.urgency || 'low'}
            urgencyColor={demoKillChain.urgency_color || '#00e5ff'}
            currentStage={demoKillChain.current_stage || 1}
            currentStageName={demoKillChain.current_stage_name || 'Monitoring'}
            killChainProgress={demoKillChain.kill_chain_progress || 0}
          />
          <VelocitySparkline history={demoKillChain.velocity_history ?? []} label={demoKillChain.velocity_label ?? 'DORMANT'} color={demoKillChain.urgency_color ?? '#00e5ff'} />
          <AptAttribution matches={demoAptAttribution} />
          {/* Reasoning */}
          <div style={{ background: 'rgba(0,229,255,0.04)', border: '1px solid rgba(0,229,255,0.12)', borderRadius: 6, padding: '10px 12px' }}>
            <div style={{ fontFamily: '"Orbitron", monospace', fontSize: 9, letterSpacing: '0.14em', color: '#00e5ff', marginBottom: 6 }}>WHAT'S HAPPENING</div>
            <div style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: 11, color: 'rgba(255,255,255,0.65)', lineHeight: 1.7 }}>
              <div style={{ marginBottom: 4 }}><span style={{ color: '#ff6600' }}>▸ Current threat level:</span> The attacker has taken control of a server and is using it to send hidden messages back to their base. Think of it like a burglar who's inside your house and is quietly calling home.</div>
              <div style={{ marginBottom: 4 }}><span style={{ color: '#ff335f' }}>▸ Who's behind this:</span> The attack pattern closely matches APT28 (Fancy Bear) — a well-known hacking group linked to Russia. They typically break in through fake emails, then steal passwords to move deeper.</div>
              <div style={{ marginBottom: 4 }}><span style={{ color: '#ffcc00' }}>▸ Time until breach:</span> If nothing changes, the attacker could steal your data in about {demoKillChain.breach_countdown_display}. The defense team has slowed them down but hasn't stopped them yet.</div>
              <div><span style={{ color: '#00ff88' }}>▸ What you should do:</span> Cut off the compromised server from the internet immediately. Place traps on your database to detect if the attacker tries to access it. Block suspicious outgoing connections.</div>
            </div>
          </div>
        </div>
      </section>

      <div className="two-column-grid">
        <ActionLogPanel
          action={latestRedAction}
          entries={redFeed}
          tone="red"
          title="Action Log (Red)"
        />
        <ActionLogPanel
          action={latestBlueAction}
          entries={blueFeed}
          tone="blue"
          title="Action Log (Blue)"
        />
      </div>

      <section className="ops-toolbar">
        <div className="toolbar-actions">
          <button className="ops-button" disabled={!isConnected} onClick={() => generateStep()} type="button">▶ Step</button>
          <button className="ops-button" disabled={!isConnected} onClick={() => resetSimulation()} type="button">■ Reset</button>
        </div>
        <div className="ops-muted text-sm">
          Battle results logged: <span className="ops-data text-white">{battleResults.length}</span>
        </div>
      </section>

      <section className="ops-card p-5">
        <div className="section-heading-row">
          <div>
            <div className="ops-display text-[0.62rem] text-secondary/70">Episode Reward Chart</div>
            <h2 className="panel-title">Red vs Blue reward pressure</h2>
          </div>
        </div>
        <RewardChart history={episodeHistorySummary} />
      </section>

      <BattleTimeline maxSteps={maxSteps} results={battleResults} step={step} />
    </div>
  );
}

function ActionLogPanel({
  action,
  entries,
  title,
  tone,
}: {
  action: ReturnType<typeof useSimulationStore.getState>['latestRedAction'];
  entries: ReturnType<typeof useSimulationStore.getState>['logs'];
  title: string;
  tone: 'red' | 'blue';
}) {
  return (
    <section className="ops-card p-5">
      <div className="section-heading-row">
        <div>
          <div className="ops-display text-[0.62rem] text-secondary/70">{title}</div>
          {action ? <h2 className="panel-title">{action.action_name.replace(/_/g, ' ')}</h2> : <h2 className="panel-title">Awaiting action</h2>}
        </div>
        {action ? <span className={`status-pill ${tone === 'red' ? '' : 'status-pill-live'}`}>{action.success ? 'SUCCESS' : action.is_false_positive ? 'FALSE POSITIVE' : 'FAILED'}</span> : null}
      </div>

      <div className="panel-scroll mt-4 space-y-3 max-h-[360px] overflow-y-auto pr-1">
        {entries.length ? (
          entries.map((entry) => (
            <div className={`feed-item ${tone === 'red' ? 'feed-item-critical' : 'feed-item-success'}`} key={entry.id}>
              <div className="flex items-center justify-between gap-3">
                <div className="ops-label text-[0.52rem]">{entry.type.replace(/_/g, ' ')}</div>
                <div className="ops-data text-[0.62rem]">STEP {entry.step}</div>
              </div>
              <p className="mt-2 text-sm text-white/85">{entry.message}</p>
            </div>
          ))
        ) : (
          <div className="empty-panel !min-h-[220px]">No actions logged yet.</div>
        )}
      </div>
    </section>
  );
}

function RewardChart({ history }: { history: ReturnType<typeof useSimulationStore.getState>['episodeHistorySummary'] }) {
  const width = 900;
  const height = 260;

  if (!history.length) {
    return <div className="empty-panel !min-h-[260px] mt-4">Episode history will render here as the battle progresses.</div>;
  }

  const maxStep = Math.max(1, history[history.length - 1]?.step || 1);
  const values = history.flatMap((point) => [point.red_rew, point.blue_rew]);
  const minValue = Math.min(...values, 0);
  const maxValue = Math.max(...values, 1);
  const range = Math.max(1, maxValue - minValue);

  const pointPath = (key: 'red_rew' | 'blue_rew') =>
    history
      .map((point, index) => {
        const x = (index / Math.max(1, history.length - 1)) * (width - 60) + 30;
        const y = height - 30 - ((point[key] - minValue) / range) * (height - 60);
        return `${index === 0 ? 'M' : 'L'} ${x} ${y}`;
      })
      .join(' ');

  return (
    <svg className="mt-4 h-[260px] w-full" preserveAspectRatio="none" viewBox={`0 0 ${width} ${height}`}>
      <defs>
        <linearGradient id="reward-red" x1="0%" x2="0%" y1="0%" y2="100%">
          <stop offset="0%" stopColor="rgba(255,0,68,0.35)" />
          <stop offset="100%" stopColor="rgba(255,0,68,0)" />
        </linearGradient>
        <linearGradient id="reward-blue" x1="0%" x2="0%" y1="0%" y2="100%">
          <stop offset="0%" stopColor="rgba(20,209,255,0.35)" />
          <stop offset="100%" stopColor="rgba(20,209,255,0)" />
        </linearGradient>
      </defs>

      <line stroke="rgba(255,255,255,0.08)" x1="30" x2={width - 30} y1={height - 30} y2={height - 30} />
      <line stroke="rgba(255,255,255,0.08)" x1="30" x2="30" y1="30" y2={height - 30} />
      <path d={pointPath('red_rew')} fill="none" stroke="#ff335f" strokeWidth="3" />
      <path d={pointPath('blue_rew')} fill="none" stroke="#14d1ff" strokeWidth="3" />
      <text className="ops-label" fill="rgba(255,255,255,0.5)" fontSize="11" x={width - 88} y={height - 8}>Step {maxStep}</text>
    </svg>
  );
}
