import { useEffect, useRef, useState } from 'react';
import AptAttribution from '../components/ops/AptAttribution';
import NodeDecisionPanel from '../components/ops/NodeDecisionPanel';
import IntrusionStoryboard from '../components/ops/IntrusionStoryboard';
import BattleTimeline from '../components/ops/BattleTimeline';
import { HyperAgentPanel } from '../components/ops/HyperAgentPanel';
import { IntegrationEventFeed } from '../components/ops/IntegrationEventFeed';
import { SocTerminal } from '../components/ops/SocTerminal';
import { DEFAULT_DIAGRAM_NODES } from '../components/WebDiagram3D';
import { MagicBentoGrid, BentoCard } from '../components/ui/MagicBento';
import { useSimulationStore } from '../store/simulationStore';

export function LivePage() {
  const {
    alerts,
    simulationId,
    apiBaseUrl,
    autoStep,
    battleResults,
    briefing,
    blueCumulative,
    bluePolicyProbs,
    episodeHistorySummary,
    generateStep,
    ingestUrlFeed,
    isConnected,
    integrationEvents,
    killChain,
    aptAttribution,
    latestBlueAction,
    latestRedAction,
    logs,
    maxSteps,
    network,
    redCumulative,
    redQValues,
    replayStep,
    resetSimulation,
    scoreboard,
    setApiBaseUrl,
    startSimulation,
    step,
    stepHistory,
    toggleAutoStep,
    uploadSIEMFeed,
    viewMode,
    setViewMode,
    selectedNodeId,
    setSelectedNodeId,
  } = useSimulationStore();

  const [urlInput, setUrlInput] = useState(apiBaseUrl);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadFileName, setUploadFileName] = useState<string | null>(null);
  const [remoteFeedUrl, setRemoteFeedUrl] = useState('');
  const [remoteFeedVendor, setRemoteFeedVendor] = useState('generic');
  const [isConnecting, setIsConnecting] = useState(false);

  const totals = Math.max(1, Math.abs(redCumulative) + Math.abs(blueCumulative));
  const redPct = Math.max(12, (Math.abs(redCumulative) / totals) * 100);
  const bluePct = Math.max(12, (Math.abs(blueCumulative) / totals) * 100);

  const redFeed = logs.filter((e) => e.team === 'red').slice(0, 8);
  const blueFeed = logs.filter((e) => e.team === 'blue').slice(0, 8);

  const connect = async () => { 
    if (isConnecting) return;
    setIsConnecting(true);
    try {
      setApiBaseUrl(urlInput); 
      await startSimulation(); 
    } finally {
      setIsConnecting(false);
    }
  };
  const handleExportReport = () => { 
    if (!simulationId) return;
    let content = `# Athernex Live Simulation Threat Report\n\n`;
    content += `**Simulation ID:** ${simulationId}\n`;
    content += `**Date:** ${new Date().toISOString()}\n\n`;
    if (network?.nodes?.length) {
      content += `## Current Network State\n`;
      content += network.nodes.map(n => `- **${n.id}** (${n.label}): ${n.status.toUpperCase()}`).join('\n') + '\n\n';
    }
    if (scoreboard) {
      content += `## Scoreboard\n- Red Nodes Controlled: ${scoreboard.red_nodes_controlled}\n- Blue Nodes Secured: ${scoreboard.blue_nodes_secured}\n- Contested Nodes: ${scoreboard.contested_nodes}\n\n`;
    }
    if (logs?.length) {
      content += `## Incident Logs\n` + logs.map(l => `[Step ${l.step}] ${l.team.toUpperCase()}: ${l.message}`).join('\n') + '\n';
    }
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `athernex-threat-${simulationId}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };
  const handleNarrativeReport = () => { window.open('/threat-report', '_blank'); };
  const handleSIEMUpload = async () => {
    const file = fileInputRef.current?.files?.[0];
    if (!file) return;
    setUploadFileName(file.name);
    if (uploadSIEMFeed) await uploadSIEMFeed(file);
  };
  const handleRemoteFeed = async () => {
    if (!remoteFeedUrl.trim()) return;
    await ingestUrlFeed(remoteFeedUrl.trim(), remoteFeedVendor);
  };

  /* ── Network auto-detect ── */
  const [networkInfo, setNetworkInfo] = useState<string | null>(null);
  const [networkDetails, setNetworkDetails] = useState<{
    ip: string; subnet: string; isp: string; org: string; city: string;
    region: string; country: string; timezone: string; lat: number; lon: number;
    connectionType: string; asn: string;
  } | null>(null);

  useEffect(() => {
    const detect = async () => {
      try {
        const res = await fetch('https://ipapi.co/json/', { signal: AbortSignal.timeout(5000) });
        if (res.ok) {
          const g = await res.json();
          const ip = g.ip || '0.0.0.0';
          const sn = ip.split('.').slice(0, 3).join('.');
          setNetworkInfo(`${sn}.0/24`);
          setNetworkDetails({
            ip, subnet: `${sn}.0/24`, isp: g.org || 'Unknown ISP', org: g.org_name || g.org || 'Unknown',
            city: g.city || 'Unknown', region: g.region || 'Unknown', country: g.country_name || 'Unknown',
            timezone: g.timezone || 'Unknown', lat: g.latitude || 0, lon: g.longitude || 0,
            connectionType: g.asn ? `AS${g.asn}` : 'N/A', asn: g.asn ? `AS${g.asn} (${g.org || ''})` : 'N/A',
          });
          return;
        }
      } catch { /* fallthrough */ }
      try {
        const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
        pc.createDataChannel('');
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        const candidate = await new Promise<RTCIceCandidate | null>((resolve) => {
          const timeout = setTimeout(() => { pc.close(); resolve(null); }, 3000);
          pc.onicecandidate = (e) => { if (e.candidate) { clearTimeout(timeout); pc.close(); resolve(e.candidate); } };
        });
        if (candidate) {
          const match = candidate.candidate.match(/(\d+\.\d+\.\d+\.\d+)/);
          if (match) {
            const ip = match[1]; const sn = ip.split('.').slice(0, 3).join('.');
            setNetworkInfo(`${sn}.0/24`);
            setNetworkDetails({ ip, subnet: `${sn}.0/24`, isp: 'Local', org: 'Private', city: 'Local', region: 'LAN', country: 'Private', timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, lat: 0, lon: 0, connectionType: 'LAN', asn: 'N/A' });
          }
        }
      } catch { /* no-op */ }
    };
    void detect();
  }, []);

  useEffect(() => {
    if (!networkInfo && network && network.nodes.length > 0) {
      setNetworkInfo('10.0.1.0/24 (simulated)');
      setNetworkDetails({ ip: '10.0.1.1', subnet: '10.0.1.0/24', isp: 'Simulated', org: 'Inari Sim', city: 'Virtual', region: 'Simulation', country: 'Cyber Range', timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, lat: 0, lon: 0, connectionType: 'Sim', asn: 'AS-SIM' });
    }
  }, [network, networkInfo]);

  const liveApt = aptAttribution ?? [];

  /* ════════════════════════════════════════════════════════════════════ */
  return (
    <div style={{ position: 'relative', pointerEvents: 'none' }}>

      {/* ═══ PAGE 1: Hero 3D viewport ═══ */}
      <div style={{
        position: 'relative', zIndex: 1, minHeight: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
        padding: '0 24px 24px', pointerEvents: 'none',
      }}>
        <div style={{ position: 'absolute', top: 16, left: 24, pointerEvents: 'auto' }}>
          <div style={{ fontFamily: '"Orbitron", monospace', fontSize: 11, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#00e5ff', textShadow: '0 0 12px rgba(0,229,255,0.5)' }}>
            Network Topology
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            {(['2d', '3d'] as const).map((m) => (
              <button key={m} onClick={() => setViewMode(m)} style={{
                padding: '4px 12px', borderRadius: 4,
                border: `1px solid ${viewMode === m ? '#00e5ff' : 'rgba(255,255,255,0.15)'}`,
                background: viewMode === m ? 'rgba(0,229,255,0.12)' : 'transparent',
                color: viewMode === m ? '#00e5ff' : 'rgba(255,255,255,0.5)',
                fontFamily: '"Orbitron", monospace', fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', cursor: 'pointer', transition: 'all 180ms ease',
              }}>{m.toUpperCase()}</button>
            ))}
          </div>
          <div style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: 10, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.12em', marginTop: 6 }}>
            {viewMode === '3d' ? 'Drag to orbit · Scroll to zoom · Right-click to pan' : 'Auto-rotating · Switch to 3D to interact'}
          </div>
        </div>

        <div style={{
          position: 'absolute', top: 16, right: 24, padding: '4px 14px', borderRadius: 20, fontSize: 10,
          fontFamily: '"Orbitron", monospace', letterSpacing: '0.14em', textTransform: 'uppercase',
          background: isConnected ? 'rgba(0,255,136,0.12)' : 'rgba(255,204,0,0.12)',
          color: isConnected ? '#00ff88' : '#ffcc00',
          border: `1px solid ${isConnected ? 'rgba(0,255,136,0.3)' : 'rgba(255,204,0,0.3)'}`, pointerEvents: 'none',
        }}>
          {isConnected ? `● LIVE · STEP ${step}/${maxSteps}` : '○ OFFLINE'}
        </div>

        {isConnected && stepHistory.length > 0 && (
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '0 24px 8px', pointerEvents: 'auto' }}>
            <div style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)', borderRadius: 8, padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: 10, color: 'rgba(255,255,255,0.5)', whiteSpace: 'nowrap' }}>STEP {step}</span>
              <input type="range" min={0} max={Math.max(0, stepHistory.length - 1)} value={stepHistory.length - 1}
                onChange={(e) => replayStep(Number(e.target.value))}
                style={{ flex: 1, height: 4, appearance: 'none', background: `linear-gradient(to right, #00e5ff ${((stepHistory.length - 1) / Math.max(1, stepHistory.length - 1)) * 100}%, rgba(255,255,255,0.1) ${((stepHistory.length - 1) / Math.max(1, stepHistory.length - 1)) * 100}%)`, borderRadius: 2, cursor: 'pointer', outline: 'none' }}
              />
              <span style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: 10, color: '#00e5ff', whiteSpace: 'nowrap' }}>{stepHistory.length} events</span>
            </div>
          </div>
        )}

        <div style={{ position: 'absolute', bottom: 40, left: '50%', transform: 'translateX(-50%)', textAlign: 'center', pointerEvents: 'none' }}>
          <div style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: 10, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 6 }}>Scroll down for controls</div>
          <div style={{ width: 20, height: 30, border: '1px solid rgba(255,255,255,0.2)', borderRadius: 10, margin: '0 auto', position: 'relative' }}>
            <div style={{ width: 3, height: 6, background: 'rgba(0,229,255,0.5)', borderRadius: 2, position: 'absolute', left: '50%', top: 6, transform: 'translateX(-50%)', animation: 'scrollBounce 1.5s infinite' }} />
          </div>
        </div>
      </div>

      {/* ═══ PAGE 2: Magic Bento War Room ═══ */}
      <div style={{
        position: 'relative', zIndex: 1, padding: 24, paddingTop: 60,
        background: 'linear-gradient(180deg, rgba(3,5,15,0) 0%, rgba(3,5,15,0.85) 80px, rgba(12,14,18,0.95) 100%)',
        pointerEvents: 'auto',
      }}>
        <MagicBentoGrid className="max-w-[1400px] mx-auto w-full">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            
            {/* ── LEFT COLUMN (Main Stage) ── */}
            <div className="lg:col-span-2 flex flex-col gap-3">
              {/* Controls */}
              <BentoCard label="Simulation Endpoint">
                <div className="flex flex-col gap-2">
                  <input className="ops-input flex-1" onChange={(e) => setUrlInput(e.target.value)} placeholder="http://127.0.0.1:8001" value={urlInput} style={{ background: 'rgba(3,5,15,0.5)', borderColor: 'rgba(0,229,255,0.15)' }} />
                  <div className="flex gap-2 flex-wrap">
                    <button className="ops-button ops-button-primary flex-1" onClick={() => void connect()} disabled={isConnecting}>
                      {isConnecting ? 'Connecting...' : (isConnected ? 'Reconnect' : 'Connect')}
                    </button>
                    <button className="ops-button" disabled={!isConnected} onClick={toggleAutoStep} style={autoStep ? { background: 'rgba(0,229,255,0.2)', borderColor: '#00e5ff', color: '#00e5ff' } : {}}>{autoStep ? '⏸ Pause' : '▶ Auto'}</button>
                    <button className="ops-button" disabled={!isConnected || autoStep} onClick={() => generateStep()}>Step</button>
                    <button className="ops-button" disabled={!isConnected} onClick={resetSimulation}>Reset</button>
                    <button className="ops-button" disabled={!isConnected} onClick={handleExportReport}>Export</button>
                    <button className="ops-button" disabled={!isConnected} onClick={handleNarrativeReport}>📝 AI Report</button>
                  </div>
                </div>
              </BentoCard>

              {/* SIEM & URL Bridge (Side by Side) */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <BentoCard label="SIEM Integration">
                  {networkInfo && (
                    <div className="mb-2" style={{ background: 'rgba(0,255,136,0.06)', border: '1px solid rgba(0,255,136,0.15)', borderRadius: 6, padding: '8px 10px' }}>
                      <div className="text-xs" style={{ color: '#00ff88', fontFamily: '"Share Tech Mono", monospace' }}>● {networkInfo}</div>
                      {networkDetails && (
                        <div className="mt-1" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 8px' }}>
                          {([['IP', networkDetails.ip.replace(/\d+\.\d+$/, 'xxx.xxx')], ['Subnet', networkDetails.subnet], ['ISP', networkDetails.isp], ['ASN', networkDetails.asn], ['Location', `${networkDetails.city}, ${networkDetails.region}`], ['Country', networkDetails.country]] as const).map(([k, v]) => (
                            <div key={k} className="text-[10px]" style={{ fontFamily: '"IBM Plex Mono", monospace' }}>
                              <span style={{ color: 'rgba(255,255,255,0.35)' }}>{k}:</span> <span style={{ color: 'rgba(255,255,255,0.65)' }}>{v}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  <div className="flex items-center gap-2 mt-2">
                    <input accept=".json,.csv,.jsonl,.pcap,.pcapng" className="ops-input !min-h-[36px] flex-1" ref={fileInputRef} type="file" onChange={(e) => { const f = e.target.files?.[0]; if (f) setUploadFileName(f.name); }} style={{ background: 'rgba(3,5,15,0.5)', borderColor: 'rgba(0,229,255,0.15)', fontSize: '11px' }} />
                    <button className="ops-button ops-button-primary" disabled={!uploadFileName} onClick={() => void handleSIEMUpload()} style={{ fontSize: '10px', whiteSpace: 'nowrap' }}>Upload &amp; Run</button>
                  </div>
                </BentoCard>

                <BentoCard label="Remote URL Bridge">
                  <div className="flex flex-col gap-2">
                    <input className="ops-input" onChange={(e) => setRemoteFeedUrl(e.target.value)} placeholder="https://feed.example.com/high-severity.json" value={remoteFeedUrl} style={{ background: 'rgba(3,5,15,0.5)', borderColor: 'rgba(0,229,255,0.15)' }} />
                    <div className="flex gap-2">
                      <select className="ops-input" onChange={(e) => setRemoteFeedVendor(e.target.value)} value={remoteFeedVendor} style={{ background: 'rgba(3,5,15,0.5)', borderColor: 'rgba(0,229,255,0.15)', minWidth: 120 }}>
                        {['generic', 'splunk', 'sentinel', 'crowdstrike'].map((v) => <option key={v} value={v}>{v}</option>)}
                      </select>
                      <button className="ops-button ops-button-primary flex-1" onClick={() => void handleRemoteFeed()}>Fetch &amp; Bridge</button>
                    </div>
                  </div>
                </BentoCard>
              </div>



              {/* Action Logs (Side by Side) */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <BentoCard label="Red Agent Log">
                  <ActionLog action={latestRedAction} entries={redFeed} tone="red" />
                </BentoCard>
                <BentoCard label="Blue Agent Log">
                  <ActionLog action={latestBlueAction} entries={blueFeed} tone="blue" />
                </BentoCard>
              </div>

              {/* Timelines & Analysis */}
              <BentoCard label="Battle Timeline">
                <BattleTimeline maxSteps={maxSteps} results={battleResults} step={step} />
              </BentoCard>
              
              <BentoCard label="Episode Reward Chart">
                <RewardChart history={episodeHistorySummary} />
              </BentoCard>

              <BentoCard label="HyperAgent Meta-Engine" style={{ minHeight: 400 }}>
                <HyperAgentPanel />
              </BentoCard>
            </div>

            {/* ── RIGHT COLUMN (Sidebar) ── */}
            <div className="flex flex-col gap-3">
              <BentoCard label="Agent Battle Viewer">
                <div className="battle-tug mt-3">
                  <div className="battle-score red-score" style={{ width: `${redPct}%` }}><span>RED</span><strong>{redCumulative.toFixed(1)}</strong></div>
                  <div className="battle-score blue-score" style={{ width: `${bluePct}%` }}><strong>{blueCumulative.toFixed(1)}</strong><span>BLUE</span></div>
                </div>
                {scoreboard && (
                  <div className="mt-3 text-[10px] text-white/50" style={{ fontFamily: '"IBM Plex Mono", monospace' }}>
                    {scoreboard.red_nodes_controlled}R controlled · {scoreboard.blue_nodes_secured}B secured · {scoreboard.contested_nodes} contested
                  </div>
                )}
              </BentoCard>



              <BentoCard label="APT Attribution">
                {liveApt.length > 0 ? <AptAttribution matches={liveApt} /> : (
                  <div style={{ padding: '24px 16px', textAlign: 'center' }}>
                    <div style={{ fontFamily: '"Orbitron", monospace', fontSize: 28, color: 'rgba(0,229,255,0.2)', marginBottom: 8 }}>🧬</div>
                    <div style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>Threat DNA will appear with activity.</div>
                  </div>
                )}
              </BentoCard>

              <BentoCard label="Intrusion Storyboard">
                <IntrusionStoryboard briefing={briefing} />
              </BentoCard>

              <BentoCard label="Integration Events">
                <IntegrationEventFeed events={integrationEvents} />
              </BentoCard>
            </div>

          </div>

          {/* ── BOTTOM FULL WIDTH ── */}
          <BentoCard label="SOC Terminal" style={{ minHeight: 500, marginTop: 12 }}>
            <SocTerminal />
          </BentoCard>
        </MagicBentoGrid>
      </div>

      {/* ═══ Node Decision Overlay ═══ */}
      {selectedNodeId !== null && (() => {
        const node = network?.nodes.find((n) => n.id === selectedNodeId);
        const battle = battleResults.find((r) => r.node_id === selectedNodeId);
        if (!node) return null;
        return (
          <NodeDecisionPanel
            nodeId={node.id}
            nodeLabel={node.label}
            nodeStatus={node.status}
            nodeDescription={DEFAULT_DIAGRAM_NODES.find((n) => n.id === node.id)?.description}
            redQValues={redQValues[String(selectedNodeId)]}
            bluePolicyProbs={bluePolicyProbs[String(selectedNodeId)]}
            alerts={alerts}
            battleResult={battle}
            killChain={killChain}
            onClose={() => setSelectedNodeId(null)}
          />
        );
      })()}
    </div>
  );
}

/* ─── Sub-components ─── */

function ActionLog({
  action, entries, tone,
}: {
  action: ReturnType<typeof useSimulationStore.getState>['latestRedAction'];
  entries: ReturnType<typeof useSimulationStore.getState>['logs'];
  tone: 'red' | 'blue';
}) {
  return (
    <>
      {action ? (
        <div className="flex items-center justify-between gap-3 mb-2">
          <h3 className="text-sm font-semibold text-white">{action.action_name.replace(/_/g, ' ')}</h3>
          <span className={`status-pill ${tone === 'blue' ? 'status-pill-live' : ''}`}>{action.success ? 'SUCCESS' : 'FAILED'}</span>
        </div>
      ) : <h3 className="text-sm text-white/50 mb-2">Awaiting action</h3>}
      <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1">
        {entries.length ? entries.map((e, i) => (
          <div className={`feed-item ${tone === 'red' ? 'feed-item-critical' : 'feed-item-success'}`} key={`${e.id}-${i}`}>
            <div className="flex items-center justify-between gap-3">
              <div className="ops-label text-[0.52rem]">{e.type.replace(/_/g, ' ')}</div>
              <div className="ops-data text-[0.62rem]">STEP {e.step}</div>
            </div>
            <p className="mt-1 text-sm text-white/85">{e.message}</p>
          </div>
        )) : <div className="empty-panel !min-h-[120px]">No actions logged yet.</div>}
      </div>
    </>
  );
}

function RewardChart({ history }: { history: ReturnType<typeof useSimulationStore.getState>['episodeHistorySummary'] }) {
  const width = 900; const height = 260;
  if (!history.length) return <div className="empty-panel !min-h-[220px]">Episode history charts load as the battle progresses.</div>;
  const values = history.flatMap((p) => [p.red_rew, p.blue_rew]);
  const minV = Math.min(...values, 0); const maxV = Math.max(...values, 1);
  const range = Math.max(1, maxV - minV);
  const path = (key: 'red_rew' | 'blue_rew') =>
    history.map((p, i) => {
      const x = (i / Math.max(1, history.length - 1)) * (width - 60) + 30;
      const y = height - 30 - ((p[key] - minV) / range) * (height - 60);
      return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
    }).join(' ');
  return (
    <svg className="h-[220px] w-full" preserveAspectRatio="none" viewBox={`0 0 ${width} ${height}`}>
      <line stroke="rgba(255,255,255,0.08)" x1="30" x2={width - 30} y1={height - 30} y2={height - 30} />
      <line stroke="rgba(255,255,255,0.08)" x1="30" x2="30" y1="30" y2={height - 30} />
      <path d={path('red_rew')} fill="none" stroke="#ff335f" strokeWidth="3" />
      <path d={path('blue_rew')} fill="none" stroke="#14d1ff" strokeWidth="3" />
    </svg>
  );
}
