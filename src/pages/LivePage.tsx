import { useEffect, useRef, useState } from 'react';
import AptAttribution from '../components/ops/AptAttribution';
import BreachCountdown from '../components/ops/BreachCountdown';
import NodeDecisionPanel from '../components/ops/NodeDecisionPanel';
import IntrusionStoryboard from '../components/ops/IntrusionStoryboard';
import ThreatRadar from '../components/ops/ThreatRadar';
import { SocTerminal } from '../components/ops/SocTerminal';
import { DEFAULT_DIAGRAM_NODES } from '../components/WebDiagram3D';
import { useSimulationStore } from '../store/simulationStore';

export function LivePage() {
  const {
    alerts,
    apiBaseUrl,
    autoStep,
    battleResults,
    briefing,
    blueCumulative,
    bluePolicyProbs,
    generateStep,
    isConnected,
    killChain,
    aptAttribution,
    maxSteps,
    network,
    redCumulative,
    redQValues,
    replayStep,
    resetSimulation,
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

  const totals = Math.max(1, Math.abs(redCumulative) + Math.abs(blueCumulative));
  const redPct = Math.max(12, (Math.abs(redCumulative) / totals) * 100);
  const bluePct = Math.max(12, (Math.abs(blueCumulative) / totals) * 100);

  const connect = async () => {
    setApiBaseUrl(urlInput);
    await startSimulation();
  };

  const handleSIEMUpload = async () => {
    const file = fileInputRef.current?.files?.[0];
    if (!file) return;
    setUploadFileName(file.name);
    if (uploadSIEMFeed) await uploadSIEMFeed(file);
  };

  /* ── Auto-detect network with rich SIEM details ── */
  const [networkInfo, setNetworkInfo] = useState<string | null>(null);
  const [networkDetails, setNetworkDetails] = useState<{
    ip: string; subnet: string; isp: string; org: string; city: string;
    region: string; country: string; timezone: string; lat: number; lon: number;
    connectionType: string; asn: string;
  } | null>(null);

  useEffect(() => {
    const detectNetwork = async () => {
      try {
        // 1. Get public IP + geolocation from free API
        const geoRes = await fetch('https://ipapi.co/json/', { signal: AbortSignal.timeout(5000) });
        if (geoRes.ok) {
          const geo = await geoRes.json();
          const ip = geo.ip || '0.0.0.0';
          const subnet = ip.split('.').slice(0, 3).join('.');
          setNetworkInfo(`${subnet}.0/24`);
          setNetworkDetails({
            ip,
            subnet: `${subnet}.0/24`,
            isp: geo.org || 'Unknown ISP',
            org: geo.org_name || geo.org || 'Unknown',
            city: geo.city || 'Unknown',
            region: geo.region || 'Unknown',
            country: geo.country_name || 'Unknown',
            timezone: geo.timezone || 'Unknown',
            lat: geo.latitude || 0,
            lon: geo.longitude || 0,
            connectionType: geo.asn ? `AS${geo.asn}` : 'N/A',
            asn: geo.asn ? `AS${geo.asn} (${geo.org || ''})` : 'N/A',
          });
          return;
        }
      } catch {
        // ipapi failed, try WebRTC fallback
      }

      try {
        const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
        pc.createDataChannel('');
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        const candidate = await new Promise<RTCIceCandidate | null>((resolve) => {
          const timeout = setTimeout(() => { pc.close(); resolve(null); }, 3000);
          pc.onicecandidate = (e) => {
            if (e.candidate) {
              clearTimeout(timeout);
              pc.close();
              resolve(e.candidate);
            }
          };
        });

        if (candidate) {
          const match = candidate.candidate.match(/(\d+\.\d+\.\d+\.\d+)/);
          if (match) {
            const ip = match[1];
            const subnet = ip.split('.').slice(0, 3).join('.');
            setNetworkInfo(`${subnet}.0/24`);
            setNetworkDetails({
              ip, subnet: `${subnet}.0/24`, isp: 'Local Network', org: 'Private',
              city: 'Local', region: 'LAN', country: 'Private', timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
              lat: 0, lon: 0, connectionType: 'LAN', asn: 'N/A',
            });
          }
        }
      } catch {
        // WebRTC detection not available — will use simulation data
      }
    };
    void detectNetwork();
  }, []);

  // Fallback: use simulation network data when nothing else worked
  useEffect(() => {
    if (!networkInfo && network && network.nodes.length > 0) {
      setNetworkInfo('10.0.1.0/24 (simulated)');
      setNetworkDetails({
        ip: '10.0.1.1', subnet: '10.0.1.0/24', isp: 'Simulated Network', org: 'Inari Sim',
        city: 'Virtual', region: 'Simulation', country: 'Cyber Range', timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        lat: 0, lon: 0, connectionType: 'Simulated', asn: 'AS-SIM',
      });
    }
  }, [network, networkInfo]);

  /* ── Oracle uses REAL simulation data only ── */
  const liveAptAttribution = aptAttribution ?? [];

  /* ════════════════════════════════════════════════════════════ */

  return (
    <div style={{ position: 'relative', pointerEvents: 'none' }}>

      {/* ═══ PAGE 1: Hero viewport — pure 3D, clicks pass through to nodes ═══ */}
      <div style={{
        position: 'relative', zIndex: 1,
        minHeight: '100vh',
        display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
        padding: '0 24px 24px',
        pointerEvents: 'none',
      }}>
        {/* Top-left badge + view toggle */}
        <div style={{ position: 'absolute', top: 16, left: 24, pointerEvents: 'auto' }}>
          <div style={{ fontFamily: '"Orbitron", monospace', fontSize: 11, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#00e5ff', textShadow: '0 0 12px rgba(0,229,255,0.5)' }}>
            Network Topology
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button
              onClick={() => setViewMode('2d')}
              style={{
                padding: '4px 12px',
                borderRadius: 4,
                border: `1px solid ${viewMode === '2d' ? '#00e5ff' : 'rgba(255,255,255,0.15)'}`,
                background: viewMode === '2d' ? 'rgba(0,229,255,0.12)' : 'transparent',
                color: viewMode === '2d' ? '#00e5ff' : 'rgba(255,255,255,0.5)',
                fontFamily: '"Orbitron", monospace',
                fontSize: 10,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                cursor: 'pointer',
                transition: 'all 180ms ease',
              }}
            >2D</button>
            <button
              onClick={() => setViewMode('3d')}
              style={{
                padding: '4px 12px',
                borderRadius: 4,
                border: `1px solid ${viewMode === '3d' ? '#00e5ff' : 'rgba(255,255,255,0.15)'}`,
                background: viewMode === '3d' ? 'rgba(0,229,255,0.12)' : 'transparent',
                color: viewMode === '3d' ? '#00e5ff' : 'rgba(255,255,255,0.5)',
                fontFamily: '"Orbitron", monospace',
                fontSize: 10,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                cursor: 'pointer',
                transition: 'all 180ms ease',
              }}
            >3D</button>
          </div>
          <div style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: 10, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.12em', marginTop: 6 }}>
            {viewMode === '3d' ? 'Drag to orbit · Scroll to zoom · Right-click to pan' : 'Auto-rotating · Switch to 3D to interact'}
          </div>
        </div>

        {/* Top-right status pill */}
        <div style={{
          position: 'absolute', top: 16, right: 24,
          padding: '4px 14px', borderRadius: 20, fontSize: 10,
          fontFamily: '"Orbitron", monospace', letterSpacing: '0.14em', textTransform: 'uppercase',
          background: isConnected ? 'rgba(0,255,136,0.12)' : 'rgba(255,204,0,0.12)',
          color: isConnected ? '#00ff88' : '#ffcc00',
          border: `1px solid ${isConnected ? 'rgba(0,255,136,0.3)' : 'rgba(255,204,0,0.3)'}`,
          pointerEvents: 'none',
        }}>
          {isConnected ? `● LIVE · STEP ${step}/${maxSteps}` : '○ OFFLINE'}
        </div>

        {/* Timeline Scrubber — video-player style */}
        {isConnected && stepHistory.length > 0 && (
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0,
            padding: '0 24px 8px',
            pointerEvents: 'auto',
          }}>
            <div style={{
              background: 'rgba(0,0,0,0.6)',
              backdropFilter: 'blur(8px)',
              borderRadius: 8,
              padding: '8px 16px',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
            }}>
              <span style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: 10, color: 'rgba(255,255,255,0.5)', whiteSpace: 'nowrap' }}>
                STEP {step}
              </span>
              <input
                type="range"
                min={0}
                max={Math.max(0, stepHistory.length - 1)}
                value={stepHistory.length - 1}
                onChange={(e) => replayStep(Number(e.target.value))}
                style={{
                  flex: 1,
                  height: 4,
                  appearance: 'none',
                  background: `linear-gradient(to right, #00e5ff ${((stepHistory.length - 1) / Math.max(1, stepHistory.length - 1)) * 100}%, rgba(255,255,255,0.1) ${((stepHistory.length - 1) / Math.max(1, stepHistory.length - 1)) * 100}%)`,
                  borderRadius: 2,
                  cursor: 'pointer',
                  outline: 'none',
                }}
              />
              <span style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: 10, color: '#00e5ff', whiteSpace: 'nowrap' }}>
                {stepHistory.length} events
              </span>
            </div>
          </div>
        )}

        {/* Scroll indicator at bottom center */}
        <div style={{ position: 'absolute', bottom: 40, left: '50%', transform: 'translateX(-50%)', textAlign: 'center', pointerEvents: 'none' }}>
          <div style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: 10, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 6 }}>Scroll down for controls</div>
          <div style={{ width: 20, height: 30, border: '1px solid rgba(255,255,255,0.2)', borderRadius: 10, margin: '0 auto', position: 'relative' }}>
            <div style={{ width: 3, height: 6, background: 'rgba(0,229,255,0.5)', borderRadius: 2, position: 'absolute', left: '50%', top: 6, transform: 'translateX(-50%)', animation: 'scrollBounce 1.5s infinite' }} />
          </div>
        </div>
      </div>

      {/* ═══ PAGE 2: Control panels below the fold ═══ */}
      <div style={{
        position: 'relative', zIndex: 1,
        padding: '48px 24px 24px',
        background: 'linear-gradient(180deg, rgba(3,5,15,0) 0%, rgba(3,5,15,0.85) 80px, rgba(3,5,15,0.95) 100%)',
        pointerEvents: 'auto',
      }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, maxWidth: 1100, margin: '0 auto' }}>

          {/* Simulation Endpoint */}
          <GlassCard>
            <div className="ops-label text-[0.52rem]" style={{ color: '#00e5ff' }}>Simulation Endpoint</div>
            <div className="mt-2 flex flex-col gap-2">
              <input className="ops-input flex-1" onChange={(e) => setUrlInput(e.target.value)} placeholder="http://127.0.0.1:8001" type="text" value={urlInput} style={{ background: 'rgba(3,5,15,0.5)', borderColor: 'rgba(0,229,255,0.15)' }} />
              <div className="flex gap-2 flex-wrap">
                <button className="ops-button ops-button-primary flex-1" onClick={() => void connect()} type="button">{isConnected ? 'Reconnect' : 'Connect'}</button>
                <button className="ops-button" disabled={!isConnected} onClick={() => toggleAutoStep()} type="button" style={autoStep ? { background: 'rgba(0,229,255,0.2)', borderColor: '#00e5ff', color: '#00e5ff' } : {}}>{autoStep ? '⏸ Pause' : '▶ Auto'}</button>
                <button className="ops-button" disabled={!isConnected || autoStep} onClick={() => generateStep()} type="button">Step</button>
                <button className="ops-button" disabled={!isConnected} onClick={() => resetSimulation()} type="button">Reset</button>
              </div>
            </div>
          </GlassCard>

          {/* Agent Battle Viewer */}
          <GlassCard>
            <div className="ops-display text-[0.62rem]" style={{ color: '#00e5ff' }}>Agent Battle Viewer</div>
            <div className="battle-tug mt-3">
              <div className="battle-score red-score" style={{ width: `${redPct}%` }}><span>RED</span><strong>{redCumulative.toFixed(1)}</strong></div>
              <div className="battle-score blue-score" style={{ width: `${bluePct}%` }}><strong>{blueCumulative.toFixed(1)}</strong><span>BLUE</span></div>
            </div>
          </GlassCard>

          {/* SIEM Integration with auto-detect */}
          <GlassCard>
            <div className="ops-display text-[0.62rem]" style={{ color: '#00e5ff' }}>SIEM Integration</div>
            {networkInfo && (
              <div className="mt-2" style={{ background: 'rgba(0,255,136,0.06)', border: '1px solid rgba(0,255,136,0.15)', borderRadius: 6, padding: '8px 10px', overflow: 'hidden' }}>
                <div className="text-xs" style={{ color: '#00ff88', fontFamily: '"Share Tech Mono", monospace', wordBreak: 'break-all' }}>
                  ● Network detected: {networkInfo}
                </div>
                {networkDetails && (
                  <div className="mt-1" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 8px' }}>
                    {[
                      ['IP', networkDetails.ip.replace(/\d+\.\d+$/, 'xxx.xxx')],
                      ['Subnet', networkDetails.subnet],
                      ['ISP', networkDetails.isp],
                      ['ASN', networkDetails.asn],
                      ['Location', `${networkDetails.city}, ${networkDetails.region}`],
                      ['Country', networkDetails.country],
                      ['Timezone', networkDetails.timezone],
                      ['Connection', networkDetails.connectionType],
                    ].map(([k, v]) => (
                      <div key={k} className="text-[10px]" style={{ fontFamily: '"IBM Plex Mono", monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        <span style={{ color: 'rgba(255,255,255,0.35)' }}>{k}:</span>{' '}
                        <span style={{ color: 'rgba(255,255,255,0.65)' }}>{v}</span>
                      </div>
                    ))}
                  </div>
                )}
                {network && (
                  <div className="mt-1 text-xs" style={{ color: 'rgba(255,255,255,0.5)', fontFamily: '"IBM Plex Mono", monospace' }}>
                    {network.nodes.length} hosts · {network.edges.length} links · {network.nodes.filter(n => n.status !== 'clean').length} compromised
                  </div>
                )}
              </div>
            )}
            <div className="mt-2 text-xs leading-5" style={{ color: 'rgba(255,255,255,0.6)' }}>Upload a SIEM feed or auto-detect your network.</div>
            <div className="mt-2 flex items-center gap-2">
              <input accept=".json,.csv,.jsonl,.pcap,.pcapng" className="ops-input !min-h-[36px] flex-1" onChange={(e) => { const f = e.target.files?.[0]; if (f) setUploadFileName(f.name); }} ref={fileInputRef} type="file" style={{ background: 'rgba(3,5,15,0.5)', borderColor: 'rgba(0,229,255,0.15)', fontSize: '11px' }} />
              <button className="ops-button ops-button-primary" disabled={!uploadFileName} onClick={() => void handleSIEMUpload()} type="button" style={{ fontSize: '10px', whiteSpace: 'nowrap' }}>Upload &amp; Run</button>
            </div>
            {uploadFileName && <span className="text-xs mt-1" style={{ color: '#00e5ff' }}>Loaded: {uploadFileName}</span>}
          </GlassCard>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16, maxWidth: 1100, margin: '16px auto 0' }}>
          <GlassCard>
            <ThreatRadar briefing={briefing} />
          </GlassCard>
          <GlassCard>
            <IntrusionStoryboard briefing={briefing} />
          </GlassCard>
        </div>

        {/* Kill Chain Oracle + APT Attribution + Reasoning */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 16, maxWidth: 1100, margin: '16px auto 0' }}>
          <GlassCard>
            <div className="ops-display text-[0.62rem]" style={{ color: '#00e5ff' }}>Kill Chain Oracle</div>
            {killChain ? (
              <>
                <BreachCountdown
                  countdownDisplay={killChain.breach_countdown_display || '--:--'}
                  countdownSeconds={killChain.breach_countdown_seconds}
                  confidence={killChain.breach_confidence || 0}
                  urgency={killChain.urgency || 'low'}
                  urgencyColor={killChain.urgency_color || '#ffcc00'}
                  currentStage={killChain.current_stage || 0}
                  currentStageName={killChain.current_stage_name || 'Recon'}
                  killChainProgress={killChain.kill_chain_progress || 0}
                />
                {/* Dynamic Reasoning */}
                <div style={{ background: 'rgba(0,229,255,0.04)', border: '1px solid rgba(0,229,255,0.12)', borderRadius: 6, padding: '10px 12px', marginTop: 12 }}>
                  <div style={{ fontFamily: '"Orbitron", monospace', fontSize: 9, letterSpacing: '0.14em', color: '#00e5ff', marginBottom: 6 }}>WHAT'S HAPPENING</div>
                  <div style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: 11, color: 'rgba(255,255,255,0.65)', lineHeight: 1.7 }}>
                    <div style={{ marginBottom: 4 }}><span style={{ color: '#ff6600' }}>▸ Current threat level:</span> {
                      (killChain.current_stage_name || '').toLowerCase() === 'reconnaissance' ? "The attacker is scanning the network for vulnerabilities. Think of it like a burglar checking to see if your windows are locked." :
                      (killChain.current_stage_name || '').toLowerCase() === 'exploitation' ? "The attacker has breached a vulnerability and gained initial access. They are inside the premise." :
                      (killChain.current_stage_name || '').toLowerCase().includes('lateral') ? "The attacker is moving between systems, looking for valuable data or privileges. They are walking the halls." :
                      (killChain.current_stage_name || '').toLowerCase().includes('action') ? "The attacker is attempting to steal data or cause damage. Immediate action required." :
                      "The attacker has taken control of a server and is using it to send hidden messages back to their base. Think of it like a burglar who's inside your house and is quietly calling home."
                    }</div>
                    <div style={{ marginBottom: 4 }}><span style={{ color: '#ff335f' }}>▸ Who's behind this:</span> {
                      liveAptAttribution[0] ? `The attack pattern closely matches ${liveAptAttribution[0].name} — a hacking group linked to ${liveAptAttribution[0].nation}. ${liveAptAttribution[0].risk_note}` : "Analyzing behavior for known threat actors..."
                    }</div>
                    <div style={{ marginBottom: 4 }}><span style={{ color: '#ffcc00' }}>▸ Time until breach:</span> If nothing changes, the attacker could steal your data in about {killChain.breach_countdown_display}. The defense team has slowed them down but hasn't stopped them yet.</div>
                    <div><span style={{ color: '#00ff88' }}>▸ What you should do:</span> {
                      (killChain.current_stage_name || '').toLowerCase() === 'reconnaissance' ? "Monitor logs closely and ensure all external-facing systems are fully patched." :
                      (killChain.current_stage_name || '').toLowerCase() === 'exploitation' ? "Isolate the origin IP and immediately patch the exploited vulnerability." :
                      (killChain.current_stage_name || '').toLowerCase().includes('lateral') ? "Lock down internal subnets, force credential rotations, and check active sessions." :
                      (killChain.current_stage_name || '').toLowerCase().includes('action') ? "Sever outside connections from database layers and halt unauthorized outbound huge transfers." :
                      "Cut off the compromised server from the internet immediately. Place traps on your database to detect if the attacker tries to access it."
                    }</div>
                  </div>
                </div>
              </>
            ) : (
              <div style={{ padding: '32px 16px', textAlign: 'center' }}>
                <div style={{ fontFamily: '"Orbitron", monospace', fontSize: 32, color: 'rgba(0,229,255,0.2)', marginBottom: 12 }}>⏳</div>
                <div style={{ fontFamily: '"Orbitron", monospace', fontSize: 11, letterSpacing: '0.14em', color: 'rgba(0,229,255,0.5)', marginBottom: 8, textTransform: 'uppercase' }}>Awaiting Simulation</div>
                <div style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: 11, color: 'rgba(255,255,255,0.35)', lineHeight: 1.6 }}>
                  Start a simulation to see real-time kill chain progression, breach countdown, and APT attribution data.
                </div>
              </div>
            )}
          </GlassCard>
          <GlassCard>
            <div className="ops-display text-[0.62rem]" style={{ color: '#00e5ff' }}>APT Attribution</div>
            {liveAptAttribution.length > 0 ? (
              <AptAttribution matches={liveAptAttribution} />
            ) : (
              <div style={{ padding: '32px 16px', textAlign: 'center' }}>
                <div style={{ fontFamily: '"Orbitron", monospace', fontSize: 32, color: 'rgba(0,229,255,0.2)', marginBottom: 12 }}>🧬</div>
                <div style={{ fontFamily: '"Orbitron", monospace', fontSize: 11, letterSpacing: '0.14em', color: 'rgba(0,229,255,0.5)', marginBottom: 8, textTransform: 'uppercase' }}>No Threat DNA</div>
                <div style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: 11, color: 'rgba(255,255,255,0.35)', lineHeight: 1.6 }}>
                  APT attribution will appear here once the simulation generates threat activity data.
                </div>
              </div>
            )}
          </GlassCard>
        </div>

        {/* ═══ SOC Terminal — Claude Code-style live log stream ═══ */}
        <div style={{ maxWidth: 1100, margin: '16px auto 0' }}>
          <GlassCard>
            <SocTerminal />
          </GlassCard>
        </div>
      </div>

      {/* ═══ Node Decision Panel (overlay) ═══ */}
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

/* ─── Helper Components ─── */

function GlassCard({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      background: 'rgba(13, 22, 40, 0.65)',
      backdropFilter: 'blur(12px)',
      border: '1px solid rgba(0, 229, 255, 0.15)',
      borderRadius: 12,
      padding: '16px 20px',
    }}>
      {children}
    </div>
  );
}
