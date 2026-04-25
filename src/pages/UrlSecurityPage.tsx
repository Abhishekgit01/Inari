import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Download, Loader2, ShieldCheck, ShieldX } from 'lucide-react';
import { apiClient } from '../api/client';
import MagicBento, { type MagicBentoStaticCard } from '../components/ui/MagicBento';
import {
  getEnterpriseApiKey,
  type UrlSecurityAttackFamily,
  type UrlSecurityFinding,
  type UrlSecurityReport,
} from '../lib/urlSecurity';

const severityColor = (severity: string) => {
  switch (severity) {
    case 'critical':
      return '#ff335f';
    case 'high':
      return '#ff7b47';
    case 'medium':
      return '#ffcc66';
    default:
      return '#9de7ff';
  }
};

const scoreTone = (score: number) => {
  if (score >= 80) return { label: 'Hardened surface', color: '#22c55e' };
  if (score >= 55) return { label: 'Needs review', color: '#f59e0b' };
  return { label: 'High-risk surface', color: '#ef4444' };
};

const buildReportMarkdown = (report: UrlSecurityReport) => {
  const findings = report.findings
    .map((finding) => `- [${finding.severity.toUpperCase()}] ${finding.title}: ${finding.detail} Evidence: ${finding.evidence}`)
    .join('\n');
  const attackFamilies = report.attack_families
    .map(
      (family) =>
        `- ${family.family} (${family.severity.toUpperCase()}): ${family.why_it_matters} Attacker pattern: ${family.common_attacker_behavior}`,
    )
    .join('\n');
  const countermeasures = report.countermeasures.map((item) => `- ${item}`).join('\n');

  return `# URL Security Report

URL: ${report.url}
Final URL: ${report.final_url}
Analyzed At: ${report.analyzed_at}
Security Score: ${report.security_score}/100
Status Code: ${report.status_code}
Content Type: ${report.content_type}

## Summary
${report.risk_summary}

## Findings
${findings || '- No major passive findings detected.'}

## Attack Families To Review
${attackFamilies || '- No major attack families inferred from passive inspection.'}

## Countermeasures
${countermeasures || '- No countermeasures generated.'}
`;
};

export function UrlSecurityPage() {
  const [reports, setReports] = useState<UrlSecurityReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [url, setUrl] = useState('');
  const [remoteApiKey, setRemoteApiKey] = useState('');
  const [remoteApiHeader, setRemoteApiHeader] = useState('Authorization');
  const [remoteHeaders, setRemoteHeaders] = useState('');

  const loadReports = async () => {
    setLoading(true);
    try {
      const response = await apiClient.get('/api/url-security/reports', {
        headers: { 'X-API-Key': getEnterpriseApiKey() },
      });
      setReports(response.data.reports || []);
    } catch (error) {
      console.error(error);
      toast.error('Unable to load URL security reports');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadReports();
  }, []);

  const analyzeUrl = async () => {
    setAnalyzing(true);
    try {
      let headers: Record<string, string> = {};
      if (remoteHeaders.trim()) {
        headers = JSON.parse(remoteHeaders);
      }
      const response = await apiClient.post(
        '/api/url-security/analyze',
        {
          url,
          headers,
          api_key: remoteApiKey,
          api_key_header: remoteApiHeader,
        },
        {
          headers: { 'X-API-Key': getEnterpriseApiKey() },
        },
      );
      setReports((current) => [response.data as UrlSecurityReport, ...current.filter((item) => item.report_id !== response.data.report_id)].slice(0, 24));
      toast.success('Passive URL security report created');
    } catch (error) {
      console.error(error);
      toast.error('Unable to analyze the URL');
    } finally {
      setAnalyzing(false);
    }
  };

  const latestReport = reports[0] || null;
  const tone = latestReport ? scoreTone(latestReport.security_score) : null;
  const bentoCards: MagicBentoStaticCard[] = latestReport
    ? [
        {
          label: 'Score',
          title: `${latestReport.security_score}/100`,
          description: latestReport.risk_summary,
          color: 'rgba(6, 16, 28, 0.92)',
        },
        {
          label: 'Transport',
          title: latestReport.url.startsWith('https://') ? 'HTTPS in use' : 'Plain HTTP',
          description: latestReport.url.startsWith('https://')
            ? 'Transport looks encrypted from a passive view.'
            : 'Traffic can be intercepted or altered in transit.',
        },
        {
          label: 'Headers',
          title: latestReport.missing_headers.length ? `${latestReport.missing_headers.length} missing` : 'Baseline headers present',
          description: latestReport.missing_headers.length
            ? latestReport.missing_headers.join(', ')
            : 'No major browser-hardening gaps were visible in the sampled response.',
        },
        {
          label: 'Input Surface',
          title: latestReport.query_parameters.length ? `${latestReport.query_parameters.length} query params` : 'Low query exposure',
          description: latestReport.query_parameters.length
            ? `Parameters observed: ${latestReport.query_parameters.join(', ')}`
            : 'No obvious query-string attack surface was visible in the analyzed URL.',
        },
        {
          label: 'Forms',
          title: `${latestReport.forms_detected.length} forms detected`,
          description: latestReport.forms_detected.length
            ? `Password fields: ${latestReport.forms_detected.reduce((sum, form) => sum + form.password_fields, 0)}`
            : 'No HTML form surface was detected in the fetched response.',
        },
        {
          label: 'Counter',
          title: `${latestReport.countermeasures.length} fixes queued`,
          description: latestReport.countermeasures.slice(0, 2).join(' '),
        },
      ]
    : [];

  const downloadLatest = () => {
    if (!latestReport) return;
    const blob = new Blob([buildReportMarkdown(latestReport)], { type: 'text/plain;charset=utf-8' });
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = href;
    anchor.download = `${latestReport.report_id.toLowerCase()}-url-security-report.txt`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(href);
  };

  return (
    <div className="mx-auto max-w-7xl space-y-5 p-4">
      <section className="ops-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="ops-display text-[0.62rem] text-secondary/70">URL Security</div>
            <h1 className="panel-title mt-2">Passive Exposure Review For Customer URLs</h1>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-white/65">
              This screen passively reviews the real URLs you ingest or analyze: transport, headers, forms, query
              parameters, likely web attack families, and the defensive fixes that should happen next. It does not fire
              exploits or generate offensive payloads.
            </p>
          </div>
          {latestReport && tone ? (
            <div
              className="rounded-2xl border px-4 py-3"
              style={{ borderColor: `${tone.color}55`, background: `${tone.color}12`, color: tone.color }}
            >
              <div className="text-[0.72rem] uppercase tracking-[0.18em]">Latest score</div>
              <div className="mt-2 text-3xl font-semibold">{latestReport.security_score}</div>
              <div className="mt-1 text-sm">{tone.label}</div>
            </div>
          ) : null}
        </div>

        <div className="mt-5 grid gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
          <input
            className="ops-input"
            placeholder="https://customer.example.com/app/login"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
          />
          <input
            className="ops-input"
            placeholder="Remote API key/token"
            value={remoteApiKey}
            onChange={(event) => setRemoteApiKey(event.target.value)}
          />
          <input
            className="ops-input"
            placeholder="Remote auth header"
            value={remoteApiHeader}
            onChange={(event) => setRemoteApiHeader(event.target.value)}
          />
        </div>

        <textarea
          className="ops-input mt-3 !min-h-[110px]"
          placeholder='Optional headers JSON, e.g. {"X-Tenant":"acme-prod"}'
          value={remoteHeaders}
          onChange={(event) => setRemoteHeaders(event.target.value)}
        />

        <div className="mt-4 flex flex-wrap gap-2">
          <button className="ops-button ops-button-primary" onClick={() => void analyzeUrl()} type="button" disabled={analyzing}>
            {analyzing ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
            Analyze URL
          </button>
          <button className="ops-button" onClick={downloadLatest} type="button" disabled={!latestReport}>
            <Download size={14} />
            Download Latest Report
          </button>
          <button className="ops-button" onClick={() => void loadReports()} type="button" disabled={loading}>
            Refresh Reports
          </button>
        </div>
      </section>

      {latestReport ? (
        <MagicBento cards={bentoCards} enableSpotlight />
      ) : (
        <section className="ops-card p-5">
          <div className="empty-panel !min-h-[220px]">
            Analyze a URL here or use the live URL ingest flow. The latest passive report will appear in this product
            surface automatically.
          </div>
        </section>
      )}

      {latestReport ? (
        <>
          <section className="ops-card p-5">
            <div className="section-heading-row">
              <div>
                <div className="ops-display text-[0.62rem] text-secondary/70">Executive Summary</div>
                <h2 className="panel-title">{latestReport.final_url}</h2>
              </div>
              <span className="status-pill" style={{ color: tone?.color || '#a5f3fc' }}>
                HTTP {latestReport.status_code}
              </span>
            </div>
            <p className="mt-4 text-sm leading-7 text-white/75">{latestReport.risk_summary}</p>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <SummaryStat label="Analyzed At" value={new Date(latestReport.analyzed_at).toLocaleString()} />
              <SummaryStat label="Content Type" value={latestReport.content_type} />
              <SummaryStat label="Query Params" value={latestReport.query_parameters.length.toString()} />
            </div>
          </section>

          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
            <section className="ops-card p-5">
              <div className="section-heading-row">
                <div>
                  <div className="ops-display text-[0.62rem] text-secondary/70">Findings</div>
                  <h2 className="panel-title">What stands out from passive inspection</h2>
                </div>
              </div>
              <div className="mt-4 space-y-3">
                {latestReport.findings.length ? (
                  latestReport.findings.map((finding) => <FindingCard key={`${finding.title}-${finding.evidence}`} finding={finding} />)
                ) : (
                  <div className="empty-panel !min-h-[160px]">No major passive findings were detected for this URL.</div>
                )}
              </div>
            </section>

            <section className="ops-card p-5">
              <div className="section-heading-row">
                <div>
                  <div className="ops-display text-[0.62rem] text-secondary/70">Countermeasures</div>
                  <h2 className="panel-title">What should happen next</h2>
                </div>
              </div>
              <div className="mt-4 space-y-3">
                {latestReport.countermeasures.map((item) => (
                  <div key={item} className="feed-item feed-item-success">
                    <p className="text-sm leading-7 text-white/85">{item}</p>
                  </div>
                ))}
              </div>
            </section>
          </div>

          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
            <section className="ops-card p-5">
              <div className="section-heading-row">
                <div>
                  <div className="ops-display text-[0.62rem] text-secondary/70">Attack Families</div>
                  <h2 className="panel-title">The web attack patterns defenders should review</h2>
                </div>
              </div>
              <div className="mt-4 space-y-3">
                {latestReport.attack_families.length ? (
                  latestReport.attack_families.map((family) => <AttackFamilyCard key={family.family} family={family} />)
                ) : (
                  <div className="empty-panel !min-h-[160px]">
                    No clear web attack families were inferred from the passive response alone.
                  </div>
                )}
              </div>
            </section>

            <section className="ops-card p-5">
              <div className="section-heading-row">
                <div>
                  <div className="ops-display text-[0.62rem] text-secondary/70">Observed Surface</div>
                  <h2 className="panel-title">Headers, forms, and visible inputs</h2>
                </div>
              </div>
              <div className="mt-4 space-y-4 text-sm text-white/75">
                <div>
                  <div className="ops-label text-[0.54rem]">Missing headers</div>
                  <p className="mt-2 leading-7">
                    {latestReport.missing_headers.length ? latestReport.missing_headers.join(', ') : 'No major baseline headers were missing.'}
                  </p>
                </div>
                <div>
                  <div className="ops-label text-[0.54rem]">Forms</div>
                  <p className="mt-2 leading-7">
                    {latestReport.forms_detected.length
                      ? latestReport.forms_detected
                          .map((form) => `${form.method} ${form.action || '(same-page action)'} inputs: ${form.input_names.join(', ') || 'none listed'}`)
                          .join(' | ')
                      : 'No HTML forms were detected in the sampled response.'}
                  </p>
                </div>
                <div>
                  <div className="ops-label text-[0.54rem]">Server disclosure</div>
                  <p className="mt-2 leading-7">
                    {latestReport.response_headers.server || latestReport.response_headers.x_powered_by
                      ? [latestReport.response_headers.server, latestReport.response_headers.x_powered_by].filter(Boolean).join(' · ')
                      : 'No obvious server or framework disclosure headers were exposed.'}
                  </p>
                </div>
              </div>
            </section>
          </div>
        </>
      ) : null}

      <section className="ops-card p-5">
        <div className="section-heading-row">
          <div>
            <div className="ops-display text-[0.62rem] text-secondary/70">Recent Reports</div>
            <h2 className="panel-title">What URLs have been reviewed recently</h2>
          </div>
        </div>
        <div className="mt-4 space-y-3">
          {reports.length ? (
            reports.map((report) => {
              const currentTone = scoreTone(report.security_score);
              return (
                <button
                  key={report.report_id}
                  className="feed-item w-full text-left transition-transform hover:-translate-y-0.5"
                  type="button"
                  onClick={() => setReports((current) => [report, ...current.filter((item) => item.report_id !== report.report_id)])}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="ops-label text-[0.52rem]">{report.report_id}</div>
                      <p className="mt-2 text-sm text-white/90">{report.url}</p>
                    </div>
                    <div className="text-right">
                      <div style={{ color: currentTone.color }} className="text-sm font-semibold">
                        {report.security_score}/100
                      </div>
                      <div className="text-xs text-white/45">{currentTone.label}</div>
                    </div>
                  </div>
                </button>
              );
            })
          ) : (
            <div className="empty-panel !min-h-[150px]">No URL security reports have been created yet.</div>
          )}
        </div>
      </section>
    </div>
  );
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <div className="ops-label text-[0.5rem]">{label}</div>
      <div className="mt-2 text-sm text-white/85">{value}</div>
    </div>
  );
}

function FindingCard({ finding }: { finding: UrlSecurityFinding }) {
  return (
    <div className="feed-item" style={{ borderColor: `${severityColor(finding.severity)}55` }}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm font-semibold text-white">{finding.title}</div>
        <span className="status-pill" style={{ color: severityColor(finding.severity) }}>
          {finding.severity.toUpperCase()}
        </span>
      </div>
      <p className="mt-3 text-sm leading-7 text-white/75">{finding.detail}</p>
      <p className="mt-2 text-xs leading-6 text-white/45">Evidence: {finding.evidence}</p>
    </div>
  );
}

function AttackFamilyCard({ family }: { family: UrlSecurityAttackFamily }) {
  return (
    <div className="feed-item">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm font-semibold text-white">{family.family}</div>
        <span className="status-pill" style={{ color: severityColor(family.severity) }}>
          {family.severity.toUpperCase()}
        </span>
      </div>
      <p className="mt-3 text-sm leading-7 text-white/75">{family.why_it_matters}</p>
      <div className="mt-3 flex items-start gap-2 text-sm leading-7 text-white/65">
        <ShieldX size={16} className="mt-1 shrink-0" style={{ color: severityColor(family.severity) }} />
        <span>{family.common_attacker_behavior}</span>
      </div>
    </div>
  );
}
