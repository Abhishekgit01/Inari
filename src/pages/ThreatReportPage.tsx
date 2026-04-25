import { useEffect, useState } from 'react';
import { Download, FileText, Printer, ShieldAlert, Sparkles, AlertTriangle, CheckCircle, Activity } from 'lucide-react';
import { SiteNavbar } from '../components/SiteNavbar';
import { FrostGlass } from '../components/FrostGlass';
import { apiClient } from '../api/client';
import {
  ATTACK_REPORT_DATE,
  ATTACK_REPORT_INTRO,
  ATTACK_REPORT_SECTIONS,
  ATTACK_REPORT_SUBTITLE,
  ATTACK_REPORT_TITLE,
  buildAttackReportMarkdown,
} from '../content/attackReport';
import { useSimulationStore } from '../store/simulationStore';

interface NarrativeData {
  summary: string;
  kill_chain: string;
  recommendations: string[];
  threat_actor: string;
  is_ai_generated: boolean;
}

export function ThreatReportPage() {
  const { simulationId: storeId } = useSimulationStore();
  const [activeSimId, setActiveSimId] = useState<string | null>(null);
  const [narrative, setNarrative] = useState<NarrativeData | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const querySimId = params.get('simId');
    const id = querySimId || storeId;
    setActiveSimId(id);

    if (id) {
      setLoading(true);
      apiClient.get(`/api/simulation/${id}/narrative`)
        .then(res => setNarrative(res.data))
        .catch(err => console.error('Failed to fetch narrative:', err))
        .finally(() => setLoading(false));
    }
  }, [storeId]);

  const downloadReport = () => {
    const { network, logs, scoreboard } = useSimulationStore.getState();
    
    let content = '';
    if (!activeSimId) {
      content = buildAttackReportMarkdown();
    } else {
      content += `# Inari Live Simulation Threat Report\n\n`;
      content += `**Simulation ID:** ${activeSimId}\n`;
      content += `**Date:** ${new Date().toISOString()}\n\n`;
      
      content += `## Current Network State\n\n`;
      if (network && network.nodes && network.nodes.length > 0) {
        content += network.nodes.map(n => `- **${n.id}** (${n.label}): ${n.status.toUpperCase()}`).join('\n') + '\n\n';
      } else {
        content += `No network nodes active.\n\n`;
      }

      content += `## Final Scoreboard\n\n`;
      if (scoreboard) {
        content += `- Red Nodes Controlled: ${scoreboard.red_nodes_controlled}\n`;
        content += `- Blue Nodes Secured: ${scoreboard.blue_nodes_secured}\n`;
        content += `- Contested Nodes: ${scoreboard.contested_nodes}\n\n`;
      }

      content += `## Detailed Incident Logs\n\n`;
      if (logs && logs.length > 0) {
        content += logs.map(l => `[Step ${l.step}] ${l.team.toUpperCase()}: ${l.message}`).join('\n') + '\n';
      } else {
        content += `No incident logs recorded.\n`;
      }
    }

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = activeSimId ? `inari-threat-report-${activeSimId}.txt` : 'athernex-enterprise-attack-surface-field-report.txt';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ minHeight: '100vh', background: '#080c14', color: '#e1e2e7', position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at 20% 15%, rgba(20,209,255,0.12), transparent 35%), radial-gradient(circle at 80% 20%, rgba(255,102,0,0.10), transparent 32%), linear-gradient(180deg, rgba(4,8,16,0.96), rgba(4,8,16,1))', pointerEvents: 'none' }} />
      <SiteNavbar />

      <main style={{ position: 'relative', zIndex: 10, paddingTop: '160px', paddingBottom: '80px', maxWidth: 1100, margin: '0 auto', paddingInline: '24px' }}>
        <section style={{ marginBottom: '32px' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 18, padding: '8px 14px', borderRadius: 999, background: 'rgba(20,209,255,0.08)', border: '1px solid rgba(20,209,255,0.18)' }}>
            <ShieldAlert size={14} color="#14d1ff" />
            <span style={{ fontSize: 11, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#8fe7ff', fontFamily: '"IBM Plex Mono", monospace' }}>
              Downloadable Field Report
            </span>
          </div>
          <h1 style={{ fontSize: '48px', lineHeight: 1.08, fontWeight: 600, color: '#fff', margin: 0, maxWidth: 880, fontFamily: '"Inter", sans-serif' }}>
            {ATTACK_REPORT_TITLE}
          </h1>
          <p style={{ marginTop: 20, maxWidth: 760, color: '#a8b4c7', fontSize: 19, lineHeight: 1.7 }}>
            {ATTACK_REPORT_SUBTITLE}
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, marginTop: 18, color: '#7f8ba3', fontSize: 13 }}>
            <span>{ATTACK_REPORT_DATE}</span>
            <span>10 sections</span>
            <span>Readable as a blog, exportable as a working report</span>
          </div>
        </section>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2.2fr) minmax(280px, 1fr)', gap: 24, alignItems: 'start' }}>
          <FrostGlass padding="32px" style={{ minHeight: '100%' }}>
            {loading ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 0', gap: 16 }}>
                <Activity className="animate-spin" size={32} color="#14d1ff" />
                <div style={{ color: '#8fe7ff', fontSize: 13, fontFamily: '"IBM Plex Mono", monospace' }}>GENERATING AI FORENSIC NARRATIVE...</div>
              </div>
            ) : narrative ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                    <Sparkles size={18} color="#00ff88" />
                    <h3 style={{ margin: 0, fontSize: 18, color: '#00ff88', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Executive Summary</h3>
                  </div>
                  <p style={{ margin: 0, color: '#d5dbe7', fontSize: 17, lineHeight: 1.9 }}>{narrative.summary}</p>
                </div>

                <div style={{ padding: 24, borderRadius: 16, background: 'rgba(255,102,0,0.04)', border: '1px solid rgba(255,102,0,0.12)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                    <AlertTriangle size={18} color="#ff6600" />
                    <h3 style={{ margin: 0, fontSize: 18, color: '#ff6600', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Kill Chain Analysis</h3>
                  </div>
                  <p style={{ margin: 0, color: '#d9dfeb', fontSize: 16, lineHeight: 1.8 }}>{narrative.kill_chain}</p>
                  <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 12, color: '#7f8ba3' }}>Identified Threat Actor:</span>
                    <span style={{ fontSize: 12, color: '#ffcc00', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{narrative.threat_actor}</span>
                  </div>
                </div>

                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                    <CheckCircle size={18} color="#14d1ff" />
                    <h3 style={{ margin: 0, fontSize: 18, color: '#14d1ff', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Recommended Remediation</h3>
                  </div>
                  <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {narrative.recommendations.map((rec, idx) => (
                      <li key={idx} style={{ display: 'flex', gap: 12, color: '#b7c2d4', fontSize: 15, lineHeight: 1.6 }}>
                        <span style={{ color: '#14d1ff' }}>0{idx + 1}.</span>
                        {rec}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ) : (
              ATTACK_REPORT_INTRO.map((paragraph) => (
                <p key={paragraph} style={{ margin: '0 0 18px', color: '#d5dbe7', fontSize: 17, lineHeight: 1.9 }}>
                  {paragraph}
                </p>
              ))
            )}
          </FrostGlass>

          <FrostGlass padding="24px" style={{ position: 'sticky', top: 120 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <FileText size={16} color="#14d1ff" />
              <div style={{ fontSize: 13, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#8fe7ff', fontFamily: '"IBM Plex Mono", monospace' }}>
                Quick Actions
              </div>
            </div>
            <button
              onClick={downloadReport}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 10,
                borderRadius: 14,
                padding: '14px 16px',
                border: '1px solid rgba(20,209,255,0.25)',
                background: 'rgba(20,209,255,0.12)',
                color: '#bdf1ff',
                fontWeight: 600,
                cursor: 'pointer',
                marginBottom: 12,
              }}
            >
              <Download size={16} />
              {activeSimId ? 'Download Live Simulation Report' : 'Download Generic Info Report'}
            </button>
            <button
              onClick={() => window.print()}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 10,
                borderRadius: 14,
                padding: '14px 16px',
                border: '1px solid rgba(255,255,255,0.12)',
                background: 'rgba(255,255,255,0.04)',
                color: '#e5ebf5',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <Printer size={16} />
              Print / Save as PDF
            </button>
            <div style={{ marginTop: 18, paddingTop: 18, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
              <div style={{ fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#7f8ba3', marginBottom: 10, fontFamily: '"IBM Plex Mono", monospace' }}>
                Covered Surfaces
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {ATTACK_REPORT_SECTIONS.map((section, index) => (
                  <a
                    key={section.id}
                    href={`#${section.id}`}
                    style={{
                      textDecoration: 'none',
                      color: '#cfd7e6',
                      fontSize: 14,
                      lineHeight: 1.5,
                    }}
                  >
                    {index + 1}. {section.title}
                  </a>
                ))}
              </div>
            </div>
          </FrostGlass>
        </div>

        <section style={{ marginTop: 32, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
          {ATTACK_REPORT_SECTIONS.map((section) => (
            <FrostGlass key={section.id} padding="20px" style={{ background: 'linear-gradient(135deg, rgba(255,255,255,0.08), rgba(255,255,255,0.03))' }}>
              <div style={{ fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#8fe7ff', marginBottom: 10, fontFamily: '"IBM Plex Mono", monospace' }}>
                {section.where}
              </div>
              <h2 style={{ margin: 0, fontSize: 20, color: '#fff', lineHeight: 1.35 }}>{section.title}</h2>
              <p style={{ margin: '12px 0 0', color: '#a9b6c8', fontSize: 14, lineHeight: 1.7 }}>
                {section.summary}
              </p>
            </FrostGlass>
          ))}
        </section>

        <section style={{ marginTop: 32, display: 'flex', flexDirection: 'column', gap: 22 }}>
          {ATTACK_REPORT_SECTIONS.map((section) => (
            <FrostGlass key={section.id} id={section.id} padding="30px">
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
                <h2 style={{ margin: 0, fontSize: 28, color: '#fff', lineHeight: 1.2 }}>{section.title}</h2>
                <span style={{ fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#8fe7ff', fontFamily: '"IBM Plex Mono", monospace' }}>
                  {section.where}
                </span>
              </div>
              <p style={{ margin: '0 0 18px', color: '#d9dfeb', fontSize: 17, lineHeight: 1.85 }}>
                {section.summary}
              </p>
              {section.narrative.map((paragraph) => (
                <p key={paragraph} style={{ margin: '0 0 16px', color: '#b7c2d4', fontSize: 15, lineHeight: 1.9 }}>
                  {paragraph}
                </p>
              ))}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 18, marginTop: 20 }}>
                <div style={{ borderRadius: 18, border: '1px solid rgba(255,102,0,0.16)', background: 'rgba(255,102,0,0.06)', padding: 18 }}>
                  <div style={{ fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#ffb37d', marginBottom: 10, fontFamily: '"IBM Plex Mono", monospace' }}>
                    Common Attack Paths
                  </div>
                  {section.attacks.map((item) => (
                    <p key={item} style={{ margin: '0 0 10px', color: '#f0d9ca', fontSize: 14, lineHeight: 1.75 }}>
                      {item}
                    </p>
                  ))}
                </div>
                <div style={{ borderRadius: 18, border: '1px solid rgba(20,209,255,0.16)', background: 'rgba(20,209,255,0.06)', padding: 18 }}>
                  <div style={{ fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#8fe7ff', marginBottom: 10, fontFamily: '"IBM Plex Mono", monospace' }}>
                    Prevention That Works
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {section.prevention.map((item) => (
                      <p key={item} style={{ margin: 0, color: '#d7f4ff', fontSize: 14, lineHeight: 1.75 }}>
                        {item}
                      </p>
                    ))}
                  </div>
                </div>
              </div>
            </FrostGlass>
          ))}
        </section>
      </main>
    </div>
  );
}
