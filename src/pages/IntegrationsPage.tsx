import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle, ArrowRight, CheckCircle, Clock, Database, FileDown,
  Key, Link2, Loader2, Monitor, Network, Plug, Radio, Shield,
  Trash2, UserCheck, XCircle,
} from 'lucide-react';
import { useSimulationStore } from '../store/simulationStore';

/* ── tiny helpers ──────────────────────────────────────────────────────── */
const api = (path: string, opts?: RequestInit) => {
  const base = useSimulationStore.getState().apiBaseUrl;
  return fetch(`${base}${path}`, { ...opts, headers: { 'Content-Type': 'application/json', ...opts?.headers } });
};

function GlassCard({ children, title, icon: Icon }: { children: React.ReactNode; title: string; icon: React.ElementType }) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-[rgba(3,13,26,0.55)] p-5 backdrop-blur-md" style={{ boxShadow: '0 0 24px rgba(0,229,255,0.04)' }}>
      <div className="flex items-center gap-2 mb-4">
        <Icon size={16} className="text-cyan-400" />
        <h3 className="text-sm font-semibold text-white/90" style={{ fontFamily: '"Orbitron", monospace' }}>{title}</h3>
      </div>
      {children}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { color: string; icon: React.ElementType }> = {
    connected: { color: 'text-emerald-400', icon: CheckCircle },
    active: { color: 'text-emerald-400', icon: CheckCircle },
    disabled: { color: 'text-zinc-500', icon: XCircle },
    pending_approval: { color: 'text-amber-400', icon: Clock },
    executed: { color: 'text-emerald-400', icon: CheckCircle },
    rejected: { color: 'text-red-400', icon: XCircle },
    seeded: { color: 'text-cyan-400', icon: Radio },
    buffered: { color: 'text-amber-400', icon: Clock },
    ingested: { color: 'text-emerald-400', icon: CheckCircle },
  };
  const entry = map[status] || { color: 'text-zinc-400', icon: AlertTriangle };
  const I = entry.icon;
  return <span className={`inline-flex items-center gap-1 text-[10px] ${entry.color}`}><I size={11} />{status.replace('_', ' ')}</span>;
}

/* ── main page ─────────────────────────────────────────────────────────── */
export function IntegrationsPage() {
  const apiBaseUrl = useSimulationStore((s) => s.apiBaseUrl);
  const [status, setStatus] = useState<Record<string, any>>({});
  const [connectors, setConnectors] = useState<any[]>([]);
  const [soarPending, setSoarPending] = useState<any[]>([]);
  const [soarLog, setSoarLog] = useState<any[]>([]);
  const [apiKey, setApiKey] = useState('');
  const [loading, setLoading] = useState(false);

  // connector form
  const [connVendor, setConnVendor] = useState('splunk');
  const [connUrl, setConnUrl] = useState('');
  const [connKey, setConnKey] = useState('');

  // SOAR form
  const [soarAction, setSoarAction] = useState('block_ip');
  const [soarTarget, setSoarTarget] = useState('');
  const [soarReason, setSoarReason] = useState('');
  const [soarAutoExec, setSoarAutoExec] = useState(false);

  // webhook test
  const [webhookVendor, setWebhookVendor] = useState('splunk');
  const [webhookPayload, setWebhookPayload] = useState('[{"host":"WEB-01","type":"brute_force","severity":"critical","source":"10.0.10.5","target":"10.0.0.11"}]');

  // streaming
  const [streamBroker, setStreamBroker] = useState('kafka');
  const [streamUrl, setStreamUrl] = useState('');
  const [streamTopic, setStreamTopic] = useState('athernex-security-events');

  // telemetry
  const [telemetryPayload, setTelemetryPayload] = useState('[{"hostname":"WS-05","event_type":"process","severity":"medium","process_name":"cmd.exe","pid":4321,"username":"admin"}]');

  // SSO
  const [ssoProvider, setSsoProvider] = useState('okta');
  const [ssoDomain, setSsoDomain] = useState('');
  const [ssoClientId, setSsoClientId] = useState('');

  // network builder
  const [netName, setNetName] = useState('My Network');
  const [netHosts, setNetHosts] = useState('[{"id":0,"label":"FW-01","zone":"dmz"},{"id":1,"label":"WEB-01","zone":"app"},{"id":2,"label":"DB-01","zone":"db"}]');

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const headers: Record<string, string> = apiKey ? { 'X-API-Key': apiKey } : {};
      const [statusRes, connRes, soarPRes, soarLRes] = await Promise.all([
        api('/api/integrations/status').then((r) => r.json()).catch(() => ({})),
        api('/api/connectors/siem', { headers }).then((r) => r.json()).catch(() => ({ connectors: [] })),
        api('/api/soar/pending', { headers }).then((r) => r.json()).catch(() => ({ pending: [] })),
        api('/api/soar/log', { headers }).then((r) => r.json()).catch(() => ({ actions: [] })),
      ]);
      setStatus(statusRes);
      setConnectors(connRes.connectors || []);
      setSoarPending(soarPRes.pending || []);
      setSoarLog(soarLRes.actions || []);
    } finally {
      setLoading(false);
    }
  }, [apiKey, apiBaseUrl]);

  useEffect(() => { void refresh(); }, [refresh]);

  /* ── actions ─────────────────────────────────────────────────────── */
  const registerConnector = async () => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (apiKey) headers['X-API-Key'] = apiKey;
    await api('/api/connectors/siem', { method: 'POST', headers, body: JSON.stringify({ vendor: connVendor, api_url: connUrl, api_key: connKey, severity_filter: ['high', 'critical'] }) });
    setConnUrl(''); setConnKey('');
    void refresh();
  };

  const removeConnector = async (id: string) => {
    const headers: Record<string, string> = {};
    if (apiKey) headers['X-API-Key'] = apiKey;
    await api(`/api/connectors/siem/${id}`, { method: 'DELETE', headers });
    void refresh();
  };

  const testWebhook = async () => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json', 'X-SIEM-Vendor': webhookVendor };
    if (apiKey) headers['X-API-Key'] = apiKey;
    const res = await api('/api/webhooks/siem', { method: 'POST', headers, body: webhookPayload });
    const data = await res.json();
    alert(`Webhook result: ${data.status} — ${data.message || data.detail || 'OK'}`);
    void refresh();
  };

  const createSoarAction = async () => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (apiKey) headers['X-API-Key'] = apiKey;
    await api('/api/soar/action', { method: 'POST', headers, body: JSON.stringify({ action_type: soarAction, target: soarTarget, reason: soarReason, auto_execute: soarAutoExec, channels: ['slack', 'teams'] }) });
    setSoarTarget(''); setSoarReason('');
    void refresh();
  };

  const approveSoar = async (id: string) => {
    const headers: Record<string, string> = {};
    if (apiKey) headers['X-API-Key'] = apiKey;
    await api(`/api/soar/approve/${id}`, { method: 'POST', headers });
    void refresh();
  };

  const rejectSoar = async (id: string) => {
    const headers: Record<string, string> = {};
    if (apiKey) headers['X-API-Key'] = apiKey;
    await api(`/api/soar/reject/${id}`, { method: 'POST', headers });
    void refresh();
  };

  const generateKey = async () => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (apiKey) headers['X-API-Key'] = apiKey;
    const res = await api('/api/keys/generate', { method: 'POST', headers, body: JSON.stringify({ label: 'new-key', roles: ['connector'] }) });
    const data = await res.json();
    alert(`New API Key: ${data.key}\nSave this — it won't be shown again.`);
    void refresh();
  };

  const configureStream = async () => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (apiKey) headers['X-API-Key'] = apiKey;
    const res = await api('/api/streaming/configure', { method: 'POST', headers, body: JSON.stringify({ broker_type: streamBroker, broker_url: streamUrl, topic: streamTopic }) });
    const data = await res.json();
    alert(`Stream configured: ${data.consumer_id || data.detail || 'OK'}`);
    setStreamUrl('');
    void refresh();
  };

  const pushTelemetry = async () => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (apiKey) headers['X-API-Key'] = apiKey;
    const res = await api('/api/agents/telemetry', { method: 'POST', headers, body: telemetryPayload });
    const data = await res.json();
    alert(`Telemetry: ${data.status} — ${data.message || data.detail || 'OK'}`);
    void refresh();
  };

  const configureSSO = async () => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (apiKey) headers['X-API-Key'] = apiKey;
    const res = await api('/api/sso/configure', { method: 'POST', headers, body: JSON.stringify({ provider: ssoProvider, domain: ssoDomain, client_id: ssoClientId }) });
    const data = await res.json();
    alert(`SSO configured: ${data.provider_id || data.detail || 'OK'}`);
    setSsoDomain(''); setSsoClientId('');
    void refresh();
  };

  const defineNetwork = async () => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (apiKey) headers['X-API-Key'] = apiKey;
    let hosts;
    try { hosts = JSON.parse(netHosts); } catch { alert('Invalid hosts JSON'); return; }
    const res = await api('/api/network/define', { method: 'POST', headers, body: JSON.stringify({ name: netName, hosts, auto_connect_zones: true }) });
    const data = await res.json();
    alert(`Network created: ${data.network_id || data.detail || 'OK'} (${data.num_hosts || '?'} hosts)`);
    void refresh();
  };

  /* ── render ──────────────────────────────────────────────────────── */
  const inputCls = 'w-full rounded-md border border-white/10 bg-[rgba(3,5,15,0.6)] px-3 py-2 text-xs text-white/90 placeholder:text-white/30 focus:border-cyan-500/40 focus:outline-none';
  const btnCls = 'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[10px] font-semibold transition-colors';
  const btnPrimary = `${btnCls} bg-cyan-500/20 text-cyan-300 hover:bg-cyan-500/30 border border-cyan-500/20`;
  const btnDanger = `${btnCls} bg-red-500/15 text-red-300 hover:bg-red-500/25 border border-red-500/20`;
  const btnSuccess = `${btnCls} bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25 border border-emerald-500/20`;

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Plug size={22} className="text-cyan-400" />
          <div>
            <h1 className="text-lg font-bold text-white" style={{ fontFamily: '"Orbitron", monospace' }}>Enterprise Integrations</h1>
            <p className="text-[11px] text-white/50">Connect your SIEM, streaming, SOAR & SSO infrastructure</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <input className={inputCls} style={{ width: 220 }} placeholder="API Key (X-API-Key)" value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
          <button className={btnPrimary} onClick={refresh}>{loading ? <Loader2 size={12} className="animate-spin" /> : 'Refresh'}</button>
        </div>
      </div>

      {/* Status Dashboard */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'SIEM Connectors', value: `${status.siem_connectors?.active || 0} / ${status.siem_connectors?.total || 0}`, icon: Database },
          { label: 'Stream Consumers', value: `${status.stream_consumers?.active || 0} / ${status.stream_consumers?.total || 0}`, icon: Radio },
          { label: 'SOAR Pending', value: status.soar?.pending_approvals ?? '—', icon: Shield },
          { label: 'API Keys', value: status.api_keys?.total ?? '—', icon: Key },
        ].map((card) => (
          <div key={card.label} className="rounded-lg border border-white/[0.05] bg-[rgba(3,13,26,0.4)] p-3">
            <div className="flex items-center gap-1.5 text-[10px] text-white/40"><card.icon size={11} />{card.label}</div>
            <div className="mt-1 text-lg font-bold text-cyan-300" style={{ fontFamily: '"IBM Plex Mono", monospace' }}>{card.value}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* 1. SIEM Connectors */}
        <GlassCard title="SIEM / XDR Connectors" icon={Database}>
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <select className={inputCls} value={connVendor} onChange={(e) => setConnVendor(e.target.value)}>
                {['splunk', 'sentinel', 'crowdstrike', 'qradar', 'elastic'].map((v) => <option key={v} value={v}>{v.charAt(0).toUpperCase() + v.slice(1)}</option>)}
              </select>
              <input className={inputCls} placeholder="API URL" value={connUrl} onChange={(e) => setConnUrl(e.target.value)} />
              <input className={inputCls} placeholder="API Key/Token" value={connKey} onChange={(e) => setConnKey(e.target.value)} />
            </div>
            <button className={btnPrimary} onClick={registerConnector}><Link2 size={11} />Register Connector</button>

            {connectors.length > 0 && (
              <div className="mt-2 space-y-2">
                {connectors.map((c: any) => (
                  <div key={c.connector_id} className="flex items-center justify-between rounded-md border border-white/[0.05] bg-[rgba(3,5,15,0.4)] px-3 py-2">
                    <div>
                      <span className="text-[11px] font-semibold text-white/80">{c.vendor.toUpperCase()}</span>
                      <span className="ml-2 text-[10px] text-white/40">{c.api_url || 'No URL'}</span>
                      <span className="ml-2"><StatusBadge status={c.status} /></span>
                    </div>
                    <button className={btnDanger} onClick={() => removeConnector(c.connector_id)}><Trash2 size={10} />Remove</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </GlassCard>

        {/* 2. Webhook Ingest */}
        <GlassCard title="Webhook Ingest (Real-Time)" icon={Radio}>
          <div className="space-y-3">
            <div className="flex gap-2">
              <select className={inputCls} style={{ width: 140 }} value={webhookVendor} onChange={(e) => setWebhookVendor(e.target.value)}>
                {['splunk', 'sentinel', 'crowdstrike', 'generic'].map((v) => <option key={v} value={v}>{v.charAt(0).toUpperCase() + v.slice(1)}</option>)}
              </select>
              <span className="text-[10px] text-white/40 self-center">X-SIEM-Vendor header</span>
            </div>
            <textarea className={inputCls} rows={4} value={webhookPayload} onChange={(e) => setWebhookPayload(e.target.value)} placeholder="JSON payload" />
            <button className={btnPrimary} onClick={testWebhook}><ArrowRight size={11} />Push & Ingest</button>
            <div className="text-[10px] text-white/40">
              Buffer: {status.webhook?.buffer_size ?? 0} / {status.webhook?.threshold ?? 5} events
            </div>
          </div>
        </GlassCard>

        {/* 3. SOAR Actions */}
        <GlassCard title="SOAR Automated Response" icon={Shield}>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <select className={inputCls} value={soarAction} onChange={(e) => setSoarAction(e.target.value)}>
                {['block_ip', 'isolate_host', 'block_port', 'create_ticket', 'send_notification'].map((a) => <option key={a} value={a}>{a.replace('_', ' ')}</option>)}
              </select>
              <input className={inputCls} placeholder="Target (IP / host / port)" value={soarTarget} onChange={(e) => setSoarTarget(e.target.value)} />
            </div>
            <input className={inputCls} placeholder="Reason" value={soarReason} onChange={(e) => setSoarReason(e.target.value)} />
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1.5 text-[10px] text-white/60">
                <input type="checkbox" checked={soarAutoExec} onChange={(e) => setSoarAutoExec(e.target.checked)} className="accent-cyan-500" />
                Auto-execute (skip approval)
              </label>
              <button className={btnPrimary} onClick={createSoarAction}><Shield size={11} />Create Action</button>
            </div>

            {/* Pending approvals */}
            {soarPending.length > 0 && (
              <div className="mt-2 space-y-2">
                <div className="text-[10px] text-amber-400 font-semibold">Pending Approvals:</div>
                {soarPending.map((a: any) => (
                  <div key={a.action_id} className="flex items-center justify-between rounded-md border border-amber-500/20 bg-amber-500/5 px-3 py-2">
                    <div>
                      <span className="text-[11px] text-white/80">{a.action_type.replace('_', ' ')}</span>
                      <span className="mx-1 text-[10px] text-white/40">→</span>
                      <span className="text-[11px] text-cyan-300">{a.target}</span>
                    </div>
                    <div className="flex gap-1">
                      <button className={btnSuccess} onClick={() => approveSoar(a.action_id)}><CheckCircle size={10} />Approve</button>
                      <button className={btnDanger} onClick={() => rejectSoar(a.action_id)}><XCircle size={10} />Reject</button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Recent SOAR log */}
            {soarLog.length > 0 && (
              <div className="mt-2 max-h-32 overflow-y-auto space-y-1">
                <div className="text-[10px] text-white/40">Recent actions:</div>
                {soarLog.slice(-5).reverse().map((a: any, i: number) => (
                  <div key={i} className="flex items-center gap-2 text-[10px]">
                    <StatusBadge status={a.status} />
                    <span className="text-white/60">{a.action_type?.replace('_', ' ')}</span>
                    <span className="text-cyan-300">{a.target}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </GlassCard>

        {/* 4. Network Topology Builder */}
        <GlassCard title="Network Topology Builder" icon={Network}>
          <div className="space-y-3">
            <input className={inputCls} placeholder="Network name" value={netName} onChange={(e) => setNetName(e.target.value)} />
            <textarea className={inputCls} rows={3} value={netHosts} onChange={(e) => setNetHosts(e.target.value)} placeholder='[{"id":0,"label":"FW-01","zone":"dmz"}]' />
            <div className="flex items-center gap-3">
              <button className={btnPrimary} onClick={defineNetwork}><Network size={11} />Define Network</button>
              <a href={`${apiBaseUrl}/api/network/templates`} className={btnPrimary} target="_blank" rel="noopener">View Templates</a>
            </div>
            <div className="text-[10px] text-white/40">Zones: dmz → app → db. Auto-connects hosts by zone.</div>
          </div>
        </GlassCard>

        {/* 5. Streaming Pipeline */}
        <GlassCard title="Real-Time Streaming (Kafka/RabbitMQ)" icon={Radio}>
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <select className={inputCls} value={streamBroker} onChange={(e) => setStreamBroker(e.target.value)}>
                {['kafka', 'rabbitmq', 'kinesis'].map((b) => <option key={b} value={b}>{b.charAt(0).toUpperCase() + b.slice(1)}</option>)}
              </select>
              <input className={inputCls} placeholder="Broker URL" value={streamUrl} onChange={(e) => setStreamUrl(e.target.value)} />
              <input className={inputCls} placeholder="Topic" value={streamTopic} onChange={(e) => setStreamTopic(e.target.value)} />
            </div>
            <button className={btnPrimary} onClick={configureStream}><Radio size={11} />Configure Consumer</button>
            <div className="text-[10px] text-white/40">
              Buffer: {status.stream_consumers?.buffer_size ?? 0} events | Consumers: {status.stream_consumers?.total ?? 0}
            </div>
          </div>
        </GlassCard>

        {/* 6. Endpoint Telemetry */}
        <GlassCard title="Endpoint Agent Telemetry" icon={Monitor}>
          <div className="space-y-3">
            <textarea className={inputCls} rows={3} value={telemetryPayload} onChange={(e) => setTelemetryPayload(e.target.value)} placeholder="Agent telemetry JSON" />
            <button className={btnPrimary} onClick={pushTelemetry}><Monitor size={11} />Push Telemetry</button>
            <div className="text-[10px] text-white/40">Compatible with Wazuh, osquery, Fluentd forwarders</div>
          </div>
        </GlassCard>

        {/* 7. SSO / Identity */}
        <GlassCard title="SSO / Identity Integration" icon={UserCheck}>
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <select className={inputCls} value={ssoProvider} onChange={(e) => setSsoProvider(e.target.value)}>
                {['okta', 'azure_ad', 'saml', 'google'].map((p) => <option key={p} value={p}>{p.replace('_', ' ').toUpperCase()}</option>)}
              </select>
              <input className={inputCls} placeholder="Domain" value={ssoDomain} onChange={(e) => setSsoDomain(e.target.value)} />
              <input className={inputCls} placeholder="Client ID" value={ssoClientId} onChange={(e) => setSsoClientId(e.target.value)} />
            </div>
            <button className={btnPrimary} onClick={configureSSO}><UserCheck size={11} />Configure SSO</button>
            <div className="text-[10px] text-white/40">Providers configured: {status.sso?.providers_configured ?? 0}</div>
          </div>
        </GlassCard>

        {/* 8. API Keys & Export */}
        <GlassCard title="API Keys & Data Export" icon={Key}>
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <button className={btnPrimary} onClick={generateKey}><Key size={11} />Generate New Key</button>
              <span className="text-[10px] text-white/40">Keys: {status.api_keys?.total ?? '—'}</span>
            </div>

            <div className="border-t border-white/[0.06] pt-3 mt-3">
              <div className="text-[10px] text-white/40 mb-2">Export Simulation Data</div>
              <div className="flex flex-wrap gap-2">
                <a href={`${apiBaseUrl}/api/export/alerts/latest`} className={btnPrimary} target="_blank" rel="noopener"><FileDown size={11} />Alerts CSV</a>
                <a href={`${apiBaseUrl}/api/export/playbooks/latest`} className={btnPrimary} target="_blank" rel="noopener"><FileDown size={11} />Playbooks CSV</a>
                <a href={`${apiBaseUrl}/api/export/summary/latest`} className={btnPrimary} target="_blank" rel="noopener"><FileDown size={11} />Summary JSON</a>
              </div>
            </div>

            <div className="border-t border-white/[0.06] pt-3 mt-3">
              <div className="text-[10px] text-white/40 mb-2">Integration Endpoints</div>
              <div className="space-y-1 text-[10px] font-mono text-white/50">
                <div>POST /api/webhooks/siem <span className="text-white/30">— vendor-aware webhook</span></div>
                <div>POST /api/streaming/push <span className="text-white/30">— streaming buffer</span></div>
                <div>POST /api/agents/telemetry <span className="text-white/30">— endpoint agents</span></div>
                <div>POST /api/sso/authenticate <span className="text-white/30">— SSO login</span></div>
                <div>POST /api/network/define <span className="text-white/30">— custom topology</span></div>
              </div>
            </div>
          </div>
        </GlassCard>
      </div>
    </div>
  );
}
