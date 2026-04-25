import AptAttribution from '../components/ops/AptAttribution';
import BattleScoreboard from '../components/ops/BattleScoreboard';
import BattleTimeline from '../components/ops/BattleTimeline';
import BattleToastManager from '../components/ops/BattleToast';
import BreachCountdown from '../components/ops/BreachCountdown';
import { HyperAgentPanel } from '../components/ops/HyperAgentPanel';
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
          {killChain ? <span className="status-pill" style={{ color: killChain.urgency_color }}>{killChain.velocity_label}</span> : null}
        </div>
        <div className="mt-4 flex flex-col gap-4">
          {killChain ? (
            <>
              <BreachCountdown
                countdownDisplay={killChain.breach_countdown_display || '--:--'}
                countdownSeconds={killChain.breach_countdown_seconds}
                confidence={killChain.breach_confidence || 0}
                urgency={killChain.urgency || 'low'}
                urgencyColor={killChain.urgency_color || '#00e5ff'}
                currentStage={killChain.current_stage || 1}
                currentStageName={killChain.current_stage_name || 'Monitoring'}
                killChainProgress={killChain.kill_chain_progress || 0}
              />
              <VelocitySparkline history={killChain.velocity_history ?? []} label={killChain.velocity_label ?? 'DORMANT'} color={killChain.urgency_color ?? '#00e5ff'} />
              {aptAttribution?.length ? <AptAttribution matches={aptAttribution} /> : null}
              <div style={{ background: 'rgba(0,229,255,0.04)', border: '1px solid rgba(0,229,255,0.12)', borderRadius: 6, padding: '10px 12px' }}>
                <div style={{ fontFamily: '"Orbitron", monospace', fontSize: 9, letterSpacing: '0.14em', color: '#00e5ff', marginBottom: 6 }}>WHAT'S HAPPENING</div>
                <div style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: 11, color: 'rgba(255,255,255,0.65)', lineHeight: 1.7 }}>
                  <div style={{ marginBottom: 4 }}>
                    <span style={{ color: '#ff6600' }}>▸ Current threat level:</span> The live kill chain currently sits at{' '}
                    {killChain.current_stage_name}. The urgency is {killChain.urgency}, and breach confidence is{' '}
                    {Math.round((killChain.breach_confidence || 0) * 100)}%.
                  </div>
                  <div style={{ marginBottom: 4 }}>
                    <span style={{ color: '#ff335f' }}>▸ Attribution signal:</span>{' '}
                    {aptAttribution?.[0]
                      ? `The strongest live behavioral match is ${aptAttribution[0].name}. ${aptAttribution[0].risk_note}`
                      : 'No attribution pattern is strong enough yet to call out a likely actor.'}
                  </div>
                  <div style={{ marginBottom: 4 }}>
                    <span style={{ color: '#ffcc00' }}>▸ Time until breach:</span>{' '}
                    {killChain.breach_countdown_display
                      ? `If the current pace holds, the modeled breach window is ${killChain.breach_countdown_display}.`
                      : 'The current evidence is not yet enough to estimate a stable breach window.'}
                  </div>
                  <div>
                    <span style={{ color: '#00ff88' }}>▸ Operator focus:</span> Review the newest live alerts, isolate the hottest host paths,
                    and use the War Room plus URL Security surfaces to validate the most likely next pivot before taking containment action.
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="empty-panel !min-h-[220px]">
              Live kill-chain and attribution data will appear here once the simulation or bridged external events have produced enough evidence.
            </div>
          )}
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

      {/* HyperAgent Meta-Engine */}
      <section className="ops-card p-5">
        <HyperAgentPanel />
      </section>
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
