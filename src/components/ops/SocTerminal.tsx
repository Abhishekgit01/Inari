import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useSimulationStore, type TelemetryLog } from '../../store/simulationStore';

/* ── Color helpers ───────────────────────────────────────────────────── */

const kv = (key: string, val: any, type?: string | null, overrideClass?: string): string => {
  const typeClass: Record<string, string> = {
    ip: 'v-ip', port: 'v-port', proto: 'v-proto', bytes: 'v-bytes',
    proc: 'v-proc', user: 'v-user', path: 'v-path', reg: 'v-reg',
    url: 'v-url', ua: 'v-ua', flag: 'v-flag', num: 'v-num',
    country: 'v-country',
  };
  const vc = overrideClass || (type ? typeClass[type] || 'v-str' : 'v-str');
  return `<span class="k">${key}=</span><span class="${vc}">${val}</span>`;
};

const sep = () => `<span class="sep"> │ </span>`;

const badge = (action: string): string => {
  const map: Record<string, [string, string]> = {
    exploit:        ['v-critical', 'EXPLOIT_ATTEMPT'],
    lateral_move:   ['v-high',     'LATERAL_MOVEMENT'],
    exfiltrate:     ['v-critical', 'DATA_EXFILTRATION'],
    beacon:         ['v-medium',   'C2_BEACON'],
    scan_network:   ['v-medium',   'RECON_SCAN'],
    escalate:       ['v-high',     'PRIV_ESCALATION'],
    brute_force:    ['v-critical', 'BRUTE_FORCE'],
    credential_access: ['v-high',  'CRED_DUMP'],
    persistence:    ['v-high',     'PERSISTENCE'],
    defense_evasion:['v-medium',   'DEFENSE_EVASION'],
  };
  const [cls, label] = map[action] || ['v-benign', action.toUpperCase()];
  return `<span class="${cls} v-threat">${label}</span>`;
};

const fmtBytes = (b: number): string => {
  if (b > 1e9) return (b / 1e9).toFixed(1) + 'GB';
  if (b > 1e6) return (b / 1e6).toFixed(1) + 'MB';
  if (b > 1e3) return (b / 1e3).toFixed(0) + 'KB';
  return b + 'B';
};

const truncate = (s: string, n: number) => s.length > n ? s.slice(0, n) + '...' : s;

const toolbarBtn = (activeColor?: string) => ({
  fontFamily: 'inherit', fontSize: 10, padding: '3px 10px', background: 'transparent',
  border: `1px solid ${activeColor || '#1e2a3a'}`, borderRadius: 4,
  color: activeColor || '#4a5568', cursor: 'pointer',
} as const);

/* ── SOC Terminal Entry type ─────────────────────────────────────────── */

interface SocEntry {
  id: string;
  lineNum: number;
  timestamp: string;
  layer: 'NET' | 'EP' | 'APP' | 'CORR' | 'SYS' | 'ALERT';
  raw: string;
  severity?: 'critical' | 'high' | 'medium' | 'low';
  isAlert?: boolean;
  isCorrelation?: boolean;
  isFalsePositive?: boolean;
  corrId?: string;
}

/* ── Realistic SOC enrichment data ───────────────────────────────────── */

const SYSCALLS = ['sys_ptrace', 'sys_mprotect', 'sys_execve', 'sys_socket', 'sys_connect', 'sys_write', 'sys_openat'];
const REG_HIVES = ['HKLM\\SYSTEM\\CurrentControlSet\\Services', 'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer'];

const THREAT_SCENARIOS = [
  { type: 'exploit',       src: '185.220.101.45', dst_port: 22,   proto: 'SSH',   flags: 'SYN',     bytes: 384,    dur: 12,   host: 'DMZ-01',  proc: 'sshd',            parent: 'systemd',      user: 'root',        file: '/var/log/auth.log',                          attempts: 127,  mitre: 'T1110.001', technique: 'Password Guessing',  syscall: 'sys_execve', ttl: 52, seq: '0x1A2B3C' },
  { type: 'exploit',       src: '91.121.87.10',   dst_port: 3389, proto: 'RDP',   flags: 'SYN,ACK', bytes: 1240,   dur: 45,   host: 'APP-01',  proc: 'svchost.exe',     parent: 'services.exe', user: 'NT AUTHORITY\\SYSTEM', file: 'C:\\Windows\\System32\\config\\SECURITY', attempts: 89,   mitre: 'T1110.003', technique: 'Password Spraying',  syscall: 'sys_ptrace', ttl: 48, seq: '0x99FF21' },
  { type: 'lateral_move',  src: '10.0.1.15',      dst_port: 445,  proto: 'SMB',   flags: 'PSH,ACK', bytes: 8192,   dur: 230,  host: 'APP-02',  proc: 'wmiprvse.exe',    parent: 'svchost.exe',  user: 'DOMAIN\\admin', file: 'C:\\Windows\\Temp\\payload.dll',              attempts: 1,    mitre: 'T1021.002', technique: 'SMB/Windows Admin Shares', syscall: 'sys_socket', ttl: 64, seq: '0x44AA11' },
  { type: 'exfiltrate',    src: '10.0.2.30',      dst_port: 443,  proto: 'HTTPS', flags: 'PSH,ACK', bytes: 25165824, dur: 1200, host: 'DB-01', proc: 'sqlservr.exe',    parent: 'services.exe', user: 'sa',            file: '/var/lib/mysql/customers.ibd',              attempts: 1,    mitre: 'T1041',     technique: 'Exfiltration Over C2 Channel', syscall: 'sys_write', ttl: 128, seq: '0xEE88CC' },
  { type: 'beacon',        src: '10.0.1.15',      dst_port: 8443, proto: 'HTTPS', flags: 'PSH,ACK', bytes: 247,    dur: 142,  host: 'APP-04',  proc: 'rundll32.exe',    parent: 'explorer.exe', user: 'DOMAIN\\user1', file: 'C:\\Users\\user1\\AppData\\cobalt.dll',     attempts: 1,    mitre: 'T1071.001', technique: 'Web Protocols',      syscall: 'sys_connect', ttl: 64, seq: '0x776655' },
  { type: 'escalate',      src: '10.0.1.15',      dst_port: 135,  proto: 'DCOM',  flags: 'PSH,ACK', bytes: 4096,   dur: 85,   host: 'APP-01',  proc: 'mimikatz.exe',    parent: 'cmd.exe',      user: 'NT AUTHORITY\\SYSTEM', file: 'C:\\Windows\\System32\\lsass.exe',     attempts: 1,    mitre: 'T1003.001', technique: 'LSASS Memory',      syscall: 'sys_ptrace', ttl: 64, seq: '0xBBCC33' },
  { type: 'scan_network',  src: '10.0.0.5',       dst_port: 0,    proto: 'ICMP',  flags: 'ECHO',    bytes: 64,     dur: 3,    host: 'WEB-01',  proc: 'nmap',            parent: 'bash',         user: 'www-data',      file: '/tmp/.nmap_results',                        attempts: 254,  mitre: 'T1046',     technique: 'Network Service Discovery', syscall: 'sys_socket', ttl: 55, seq: '0x991100' },
  { type: 'persistence',   src: '10.0.1.15',      dst_port: 5985, proto: 'WinRM', flags: 'PSH,ACK', bytes: 2048,   dur: 40,   host: 'APP-02',  proc: 'powershell.exe',  parent: 'wsmprovhost.exe', user: 'DOMAIN\\admin', file: 'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run', attempts: 1, mitre: 'T1547.001', technique: 'Registry Run Keys', syscall: 'sys_write', ttl: 64, seq: '0x112233' },
];

const TECHNICAL_ERRORS = [
  { type: 'SEGFAULT', proc: 'nginx', addr: '0x00007f8a12bc', detail: 'invalid memory reference in worker process' },
  { type: 'KERNEL_PANIC', sub: 'OOM-killer', proc: 'java', detail: 'Out of memory: Kill process 1429 (java) score 950' },
  { type: 'FATAL', proc: 'sshd', detail: 'Connection reset by peer during kex_exchange_identification' },
  { type: 'IO_ERROR', dev: 'sda1', detail: 'Buffer I/O error on dev sda1, logical block 5412891' },
];

const APP_SCENARIOS = [
  { method: 'POST', endpoint: '/auth/login', status: 401, ua: 'python-requests/2.28.0', geo: 'RU', detail: 'failed_auth', stack: 'at SecurityProvider.authenticate (auth.js:142)\nat Router.handle (index.js:51)' },
  { method: 'POST', endpoint: '/api/v2/users/export', status: 200, ua: 'curl/7.88.1', geo: 'CN', detail: 'bulk_export', stack: 'at DataExporter.streamToBuffer (exporter.ts:88)\nat Controller.export (user.controller.ts:12)' },
  { method: 'PUT',  endpoint: '/admin/config/firewall', status: 403, ua: 'Mozilla/5.0 (X11; Linux)', geo: 'DE', detail: 'config_change_attempt', stack: 'at RBACGuard.validate (rbac.ts:34)\nat PermissionMiddleware.check (middleware.ts:10)' },
  { method: 'GET',  endpoint: '/.env', status: 404, ua: 'Nikto/2.5.0', geo: 'RU', detail: 'config_probe', stack: 'at FileSystem.exists (.env:0)\nat StaticHandler.serve (static.js:115)' },
];

const SOC_RECOMMENDATIONS: Record<string, string> = {
  exploit:       'ACTION: Isolate source IP at perimeter firewall. Check auth logs for lateral cred reuse. Rotate targeted account passwords immediately.',
  lateral_move:  'ACTION: Segment affected VLAN. Kill WMI/SMB sessions from src. Audit AD for new scheduled tasks or services created in last 24h.',
  exfiltrate:    'ACTION: Block dst IP at DNS/proxy level. Forensic image affected host. Quantify data loss from DB query logs. Notify CISO for breach protocol.',
  beacon:        'ACTION: Sinkhole C2 domain at DNS. Memory dump rundll32 PID for IOC extraction. Check other hosts for same DLL hash (SHA256 sweep).',
  escalate:      'ACTION: Kill mimikatz process immediately. Force krbtgt password rotation. Audit all Kerberos tickets issued in last 6h for golden ticket.',
  scan_network:  'ACTION: Rate-limit source at IDS. Cross-reference scan targets with exposed services. Harden any services discovered on non-standard ports.',
  persistence:   'ACTION: Remove registry run key. Audit startup folders, scheduled tasks, and WMI subscriptions. Scan for additional persistence mechanisms.',
  brute_force:   'ACTION: Enforce account lockout after 5 attempts. Enable MFA for targeted accounts. Add source IP to threat intelligence blocklist.',
  credential_access: 'ACTION: Rotate all domain admin credentials. Enable Credential Guard on DCs. Audit LSASS access logs for other compromised hosts.',
  defense_evasion: 'ACTION: Re-enable tampered security controls. Audit event log gaps. Check for timestomped files in System32 and SysWOW64.',
};

const RULE_SIDS = ['2024897', '2027865', '2031412', '2019876', '2028934', '2025001', '2030678', '2022345'];
const PCAP_DETAILS = ['tcp.stream eq 47', 'frame.len > 1500', 'dns.qry.name contains "c2"', 'http.request.method == POST', 'tls.handshake.extensions_server_name'];

const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
const randPort = () => 1024 + Math.floor(Math.random() * 64000);
const randPid = () => 1000 + Math.floor(Math.random() * 30000);

/* ── Main Component ──────────────────────────────────────────────────── */

export function SocTerminal() {
  const {
    logs, alerts, step, isConnected,
  } = useSimulationStore();

  const logAreaRef = useRef<HTMLDivElement>(null);
  const [entries, setEntries] = useState<SocEntry[]>([]);
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  const lineRef = useRef(1);
  const lastStepRef = useRef(0);
  const scenarioIdx = useRef(0);
  const [filter, setFilter] = useState<'all' | 'NET' | 'EP' | 'APP' | 'alerts'>('all');

  // Count alerts by severity
  const counts = useMemo(() => {
    let critical = 0, high = 0, medium = 0, low = 0;
    for (const e of entries) {
      if (e.isAlert || e.isCorrelation) {
        if (e.severity === 'critical') critical++;
        else if (e.severity === 'high') high++;
        else if (e.severity === 'medium') medium++;
        else low++;
      }
    }
    return { critical, high, medium, low, total: entries.length };
  }, [entries]);

  // Auto-scroll
  useEffect(() => {
    if (!paused && logAreaRef.current) {
      logAreaRef.current.scrollTop = logAreaRef.current.scrollHeight;
    }
  }, [entries, paused]);

  /* ── Build realistic multi-layer log entries ───────────────────── */

  const buildNetworkLog = useCallback((log: TelemetryLog, lineNum: number): SocEntry => {
    const scenario = THREAT_SCENARIOS[scenarioIdx.current % THREAT_SCENARIOS.length];
    const dstIp = scenario.src.startsWith('10.') ? `45.33.32.${Math.floor(Math.random() * 254)}` : `10.0.${Math.floor(Math.random() * 4) + 1}.${Math.floor(Math.random() * 254)}`;
    const sid = pick(RULE_SIDS);
    const pcapHint = pick(PCAP_DETAILS);
    const win = 64240;

    const html = [
      kv('src', `${scenario.src}:${randPort()}`, 'ip'),
      sep(),
      kv('dst', `${dstIp}:${scenario.dst_port}`, 'ip'),
      sep(),
      kv('proto', scenario.proto, 'proto'),
      sep(),
      kv('len', scenario.bytes, 'num'),
      sep(),
      kv('ttl', scenario.ttl, 'num'),
      sep(),
      kv('win', win, 'num'),
      sep(),
      kv('seq', scenario.seq, 'reg'),
      sep(),
      kv('flags', scenario.flags, 'flag'),
      scenario.attempts > 1 ? sep() + kv('attempts', scenario.attempts, 'num') : '',
      sep(),
      kv('sid', sid, 'num'),
      sep(),
      kv('filter', `"${pcapHint}"`, 'path'),
      log.type !== 'normal_traffic' ? sep() + badge(scenario.type) : '',
    ].join(' ');

    return {
      id: `net-${log.id}-${lineNum}`,
      lineNum, layer: 'NET', raw: html,
      timestamp: new Date().toISOString().substring(11, 23),
      corrId: log.id,
    };
  }, []);

  const buildEndpointLog = useCallback((log: TelemetryLog, lineNum: number): SocEntry => {
    const scenario = THREAT_SCENARIOS[scenarioIdx.current % THREAT_SCENARIOS.length];
    const pid = randPid();
    const ppid = randPid();
    const reg = pick(REG_HIVES);

    const html = [
      kv('host', scenario.host, 'ip'),
      sep(),
      kv('proc', scenario.proc, 'proc'),
      sep(),
      kv('pid', pid, 'num'),
      sep(),
      kv('ppid', ppid, 'num'),
      sep(),
      kv('syscall', scenario.syscall, 'flag'),
      sep(),
      kv('user', scenario.user, 'user'),
      sep(),
      kv('path', scenario.file, 'path'),
      sep(),
      kv('reg', truncate(reg, 30), 'reg'),
      sep(),
      kv('mitre', scenario.mitre, 'url'),
      sep(),
      kv('hash', `sha256:${Array.from({length:8},()=>'0123456789abcdef'[Math.floor(Math.random()*16)]).join('')}...`, 'reg'),
    ].join(' ');

    return {
      id: `ep-${log.id}-${lineNum}`,
      lineNum, layer: 'EP', raw: html,
      timestamp: new Date().toISOString().substring(11, 23),
      corrId: log.id,
    };
  }, []);

  const buildAppLog = useCallback((log: TelemetryLog, lineNum: number): SocEntry => {
    const app = APP_SCENARIOS[scenarioIdx.current % APP_SCENARIOS.length];
    const statusClass = app.status >= 400 ? 'v-critical' : app.status >= 300 ? 'v-medium' : 'v-low';
    const reqId = `req-${Math.random().toString(36).substring(2, 10)}`;

    const html = [
      kv('src', THREAT_SCENARIOS[scenarioIdx.current % THREAT_SCENARIOS.length].src, 'ip'),
      sep(),
      `<span class="v-flag">${app.method}</span>`,
      `<span class="v-url"> ${app.endpoint}</span>`,
      sep(),
      kv('status', app.status, null, statusClass),
      sep(),
      kv('trace_id', reqId, 'num'),
      sep(),
      kv('geo', app.geo, 'country'),
      sep(),
      kv('ua', truncate(app.ua, 25), 'ua'),
      app.status >= 400 ? sep() + `<span class="v-critical" style="font-size:10px">${truncate(app.stack, 40)}</span>` : '',
    ].join(' ');

    return {
      id: `app-${log.id}-${lineNum}`,
      lineNum, layer: 'APP', raw: html,
      timestamp: new Date().toISOString().substring(11, 23),
      corrId: log.id,
    };
  }, []);

  const buildTechnicalError = useCallback((lineNum: number): SocEntry => {
    const err = pick(TECHNICAL_ERRORS);
    const html = [
      `<span class="v-critical" style="font-weight:700">[${err.type}] </span>`,
      kv('proc', err.proc, 'proc'),
      sep(),
      `<span class="v-str">${err.detail}</span>`,
      (err as any).addr ? sep() + kv('addr', (err as any).addr, 'reg') : '',
      (err as any).dev ? sep() + kv('dev', (err as any).dev, 'flag') : '',
    ].join(' ');
    return {
      id: `sys-err-${lineNum}`,
      lineNum, layer: 'SYS', raw: html,
      timestamp: new Date().toISOString().substring(11, 23),
    };
  }, []);

  const buildSocAction = useCallback((lineNum: number): SocEntry => {
    const scenario = THREAT_SCENARIOS[scenarioIdx.current % THREAT_SCENARIOS.length];
    const recommendation = SOC_RECOMMENDATIONS[scenario.type] || 'ACTION: Investigate and triage.';
    const html = [
      `<span class="v-medium" style="font-weight:600">⚡ ${recommendation}</span>`,
    ].join('');
    return {
      id: `sys-action-${lineNum}`,
      lineNum, layer: 'SYS', raw: html,
      timestamp: new Date().toISOString().substring(11, 23),
    };
  }, []);

  const buildCorrEntry = useCallback((alertData: typeof alerts[0], lineNum: number): SocEntry => {
    const layersList = Object.entries(alertData.layer_breakdown)
      .filter(([, v]) => v)
      .map(([k]) => k);
    const scenario = THREAT_SCENARIOS[scenarioIdx.current % THREAT_SCENARIOS.length];

    const html = [
      kv('corr_id', `ATK-${alertData.id.substring(0, 8).toUpperCase()}`, 'ip'),
      sep(),
      kv('layers', `[${layersList.join(',')}]`, 'flag'),
      sep(),
      kv('action', `${alertData.threat_type}_detection`, 'proc'),
      sep(),
      alertData.is_likely_false_positive
        ? `<span class="v-medium v-threat">FALSE_POSITIVE</span>`
        : `<span class="v-critical v-threat">THREAT</span>`,
      sep(),
      kv('confidence', `${Math.round(alertData.confidence * 100)}%`, 'num'),
      sep(),
      kv('mitre', `${scenario.mitre}`, 'url'),
    ].join(' ');

    return {
      id: `corr-${alertData.id}-${lineNum}`,
      lineNum, layer: 'CORR', raw: html,
      timestamp: new Date().toISOString().substring(11, 23),
      isCorrelation: true,
      severity: alertData.severity as SocEntry['severity'],
      corrId: alertData.id,
    };
  }, []);

  const buildAlertBlock = useCallback((alertData: typeof alerts[0], lineNum: number): SocEntry => {
    const sevLabel = (alertData.severity || 'medium').toUpperCase();
    const scenario = THREAT_SCENARIOS[scenarioIdx.current % THREAT_SCENARIOS.length];
    const recommendation = SOC_RECOMMENDATIONS[scenario.type] || 'Investigate immediately.';
    const affectedHosts = alertData.affected_host_labels?.join(', ') || scenario.host;

    const html = [
      `<div style="margin:4px 0;line-height:1.7">`,
      `<span style="font-weight:700;letter-spacing:0.05em;font-size:12px">[${sevLabel}] ${alertData.headline}</span>`,
      `<br/><span class="k">FORENSICS:</span> <span class="v-url">${scenario.mitre} (${scenario.technique})</span>`,
      `<br/><span class="k">AFFECTED:</span> <span class="v-ip">${affectedHosts}</span>`,
      `<span class="sep"> │ </span><span class="k">SYSCALL:</span> <span class="v-flag">${scenario.syscall}</span>`,
      `<br/><span class="k">INDICATORS:</span> <span class="v-proc">${scenario.proc}</span> <span class="sep">→</span> <span class="v-path">${scenario.file}</span>`,
      `<br/><span class="k">CORR_ID:</span> <span class="v-ip">ATK-${alertData.id.substring(0, 8).toUpperCase()}</span>`,
      `<br/><span style="color:#ffcc00;font-weight:600">⚡ ${recommendation}</span>`,
      `</div>`,
    ].join('');

    return {
      id: `alert-${alertData.id}-${lineNum}`,
      lineNum, layer: 'ALERT', raw: html,
      timestamp: new Date().toISOString().substring(11, 23),
      isAlert: true,
      severity: alertData.severity as SocEntry['severity'],
      corrId: alertData.id,
    };
  }, []);

  const buildFPBlock = useCallback((alertData: typeof alerts[0], lineNum: number): SocEntry => {
    const scenario = THREAT_SCENARIOS[(scenarioIdx.current + 3) % THREAT_SCENARIOS.length];
    const html = [
      `<div style="margin:4px 0;line-height:1.7">`,
      `<span style="font-weight:700;color:#ffcc00;font-size:12px">[✓ FALSE POSITIVE RESOLVED]</span>`,
      `<br/><span class="k">INITIAL SIGNAL:</span> <span style="color:rgba(255,255,255,0.65)">${alertData.headline}</span>`,
      `<br/><span class="k">RESOLVED BY EP:</span> <span class="v-flag">parent=${scenario.parent}</span> <span class="v-user">user=${scenario.user}</span>`,
      `<br/><span class="k">REASON:</span> <span class="v-str">scheduled_task+service_account+authorized_binary</span>`,
      `<br/><span class="k">CORR:</span> <span class="v-ip">FP-${alertData.id.substring(0, 8).toUpperCase()}</span>`,
      `</div>`,
    ].join('');

    return {
      id: `fp-${alertData.id}-${lineNum}`,
      lineNum, layer: 'CORR', raw: html,
      timestamp: new Date().toISOString().substring(11, 23),
      isFalsePositive: true,
      corrId: alertData.id,
    };
  }, []);

  // Ingest new logs when step changes
  useEffect(() => {
    if (pausedRef.current || step <= lastStepRef.current) return;
    lastStepRef.current = step;

    const newEntries: SocEntry[] = [];
    const recentLogs = logs.slice(0, 6);

    for (const log of recentLogs) {
      if (log.team === 'red') {
        newEntries.push(buildNetworkLog(log, lineRef.current++));
        newEntries.push(buildEndpointLog(log, lineRef.current++));
        if (Math.random() > 0.7) newEntries.push(buildTechnicalError(lineRef.current++));
        scenarioIdx.current++;
      } else if (log.team === 'blue') {
        newEntries.push(buildAppLog(log, lineRef.current++));
        scenarioIdx.current++;
      } else {
        newEntries.push(buildNetworkLog(log, lineRef.current++));
        newEntries.push(buildEndpointLog(log, lineRef.current++));
        newEntries.push(buildAppLog(log, lineRef.current++));
        newEntries.push(buildSocAction(lineRef.current++));
        scenarioIdx.current++;
      }
    }

    const recentAlerts = alerts.slice(0, 4);
    for (const alert of recentAlerts) {
      if (alert.is_likely_false_positive) {
        newEntries.push(buildFPBlock(alert, lineRef.current++));
      } else {
        newEntries.push(buildCorrEntry(alert, lineRef.current++));
        newEntries.push(buildAlertBlock(alert, lineRef.current++));
      }
      scenarioIdx.current++;
    }

    if (newEntries.length > 0) {
      setEntries(prev => [...prev.slice(-500), ...newEntries]);
    }
  }, [step, logs, alerts, buildNetworkLog, buildEndpointLog, buildAppLog, buildSocAction, buildTechnicalError, buildCorrEntry, buildAlertBlock, buildFPBlock]);

  /* ── Filter ─────────────────────────────────────────────────────── */

  const visibleEntries = filter === 'all' ? entries
    : filter === 'alerts' ? entries.filter(e => e.isAlert || e.isCorrelation || e.isFalsePositive)
    : entries.filter(e => e.layer === filter);

  /* ── Render ─────────────────────────────────────────────────────── */

  return (
    <div style={{
      fontFamily: "'JetBrains Mono', monospace", fontSize: 12,
      background: '#0a0d14', border: '1px solid #1e2a3a',
      borderRadius: 8, overflow: 'hidden', display: 'flex',
      flexDirection: 'column', height: 560,
    }}>

      {/* Title bar */}
      <div style={{
        background: '#0d1117', borderBottom: '1px solid #1e2a3a',
        padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <div style={{ display: 'flex', gap: 6 }}>
          {['#ff5f57', '#febc2e', '#28c840'].map(c => (
            <div key={c} style={{ width: 11, height: 11, borderRadius: '50%', background: c }} />
          ))}
        </div>
        <span style={{
          color: '#4a5568', fontSize: 11, flex: 1, textAlign: 'center',
          letterSpacing: '0.05em', fontFamily: "'JetBrains Mono', monospace",
        }}>
          CYBERGUARDIAN AI — SOC TERMINAL
        </span>
        <span style={{
          fontSize: 10, padding: '2px 8px', borderRadius: 12,
          background: isConnected ? '#0d2d1a' : '#2d0d0d',
          color: isConnected ? '#00ff88' : '#ff4466',
          border: `1px solid ${isConnected ? '#1a4a2a' : '#4a1a1a'}`,
        }}>
          {isConnected ? '● LIVE' : '○ OFFLINE'}
        </span>
      </div>

      {/* Layer filter tabs */}
      <div style={{ display: 'flex', background: '#0d1117', borderBottom: '1px solid #1e2a3a' }}>
        {(['all', 'NET', 'EP', 'APP', 'alerts'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            style={{
              padding: '5px 14px', fontSize: 11, cursor: 'pointer',
              background: 'transparent', border: 'none',
              borderBottom: `2px solid ${filter === f ? '#00e5ff' : 'transparent'}`,
              color: filter === f ? '#00e5ff'
                : f === 'NET' ? '#00aacc'
                : f === 'EP' ? '#cc66ff'
                : f === 'APP' ? '#00cc66'
                : f === 'alerts' ? '#ff4466'
                : '#4a5568',
              fontFamily: "'JetBrains Mono', monospace",
            }}>
            {f}
          </button>
        ))}
      </div>

      {/* Toolbar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '5px 10px',
        background: '#111520', borderBottom: '1px solid #1e2a3a',
      }}>
        <button
          onClick={() => { setPaused(p => !p); pausedRef.current = !pausedRef.current; }}
          style={toolbarBtn(paused ? '#ffcc00' : undefined)}>
          {paused ? '▶ resume' : '⏸ pause'}
        </button>
        <button onClick={() => { setEntries([]); lineRef.current = 1; }} style={toolbarBtn()}>
          ✕ clear
        </button>
        <div style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
          {([
            ['critical', 'CRIT', '#2d0d1a', '#ff3366', '#4a1a2a'],
            ['high', 'HIGH', '#2d1a0d', '#ff6b35', '#4a2a1a'],
            ['medium', 'MED', '#2d2700', '#ffcc00', '#4a4200'],
            ['low', 'LOW', '#0d2d1a', '#00ff88', '#1a4a2a'],
          ] as const).map(([key, label, bg, color, border]) => (
            <span key={key} style={{
              fontSize: 10, padding: '2px 7px', borderRadius: 3, fontWeight: 500,
              background: bg, color, border: `1px solid ${border}`,
              fontFamily: "'JetBrains Mono', monospace",
            }}>
              {counts[key as keyof typeof counts]} {label}
            </span>
          ))}
        </div>
      </div>

      {/* Log area */}
      <div ref={logAreaRef} style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
        {visibleEntries.map(entry => (
          <LogLineRenderer key={entry.id} entry={entry} />
        ))}
        {entries.length === 0 && (
          <div style={{ color: '#2d3748', padding: '20px 16px', fontSize: 11, lineHeight: 2 }}>
            <div>Waiting for simulation stream...</div>
            <div style={{ color: '#1e3a4a', fontSize: 10 }}>
              Supports: PCAP/PCAPNG · Suricata EVE · Zeek · Syslog · STIX 2.1
            </div>
          </div>
        )}
      </div>

      {/* Stats bar */}
      <div style={{
        display: 'flex', gap: 12, padding: '5px 14px', background: '#0d1117',
        borderTop: '1px solid #1e2a3a', fontSize: 10, color: '#4a5568',
        fontFamily: "'JetBrains Mono', monospace",
      }}>
        <StatItem label="TOTAL" value={counts.total} color="#8090a0" />
        <StatItem label="THREATS" value={counts.critical + counts.high} color="#ff3366" />
        <StatItem label="FP" value={entries.filter(e => e.isFalsePositive).length} color="#4a6a5a" />
        <div style={{ marginLeft: 'auto', color: '#2d3748' }}>
          STEP {step} │ pcap:{entries.filter(e => e.layer === 'NET').length}
        </div>
      </div>
    </div>
  );
}

/* ── Sub-components ──────────────────────────────────────────────────── */

const layerColors: Record<string, { bg: string; color: string; border: string }> = {
  NET:   { bg: '#001a2a', color: '#00aacc', border: '#003a4a' },
  EP:    { bg: '#1a001a', color: '#cc66ff', border: '#3a003a' },
  APP:   { bg: '#001a0d', color: '#00cc66', border: '#003a1a' },
  CORR:  { bg: '#2d2700', color: '#ffcc00', border: '#4a4200' },
  ALERT: { bg: '#2d0d0d', color: '#ff4466', border: '#4a1a1a' },
  SYS:   { bg: '#1a0d00', color: '#ff8833', border: '#3a1a00' },
};

function LogLineRenderer({ entry }: { entry: SocEntry }) {
  const lc = layerColors[entry.layer] || layerColors.SYS;

  if (entry.isAlert || entry.isCorrelation || entry.isFalsePositive) {
    const borderColor = entry.isFalsePositive ? '#ffcc00'
      : entry.isCorrelation ? '#00e5ff'
      : entry.severity === 'critical' ? '#ff3366'
      : entry.severity === 'high' ? '#ff6b35'
      : entry.severity === 'medium' ? '#ffcc00' : '#00ff88';
    const bg = entry.isFalsePositive ? '#0d0d00'
      : entry.isCorrelation ? '#000d14'
      : entry.severity === 'critical' ? '#0d0008'
      : entry.severity === 'high' ? '#0d0800'
      : '#0d0d00';

    return (
      <div style={{
        borderLeft: `3px solid ${borderColor}`, margin: '2px 0 2px 44px',
        padding: '4px 10px', background: bg, fontSize: 11,
        fontFamily: "'JetBrains Mono', monospace",
      }} dangerouslySetInnerHTML={{ __html: entry.raw }} />
    );
  }

  return (
    <div
      style={{
        display: 'flex', alignItems: 'flex-start', padding: '1px 0',
        fontSize: 11.2, lineHeight: 1.6, cursor: 'default',
        fontFamily: "'JetBrains Mono', monospace",
        transition: 'background 100ms',
      }}
      onMouseEnter={e => (e.currentTarget.style.background = '#111a24')}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
    >
      <span style={{ color: '#1e3a4a', padding: '0 8px', minWidth: 44, textAlign: 'right', fontSize: 10, paddingTop: 2 }}>
        {entry.lineNum}
      </span>
      <span style={{ color: '#2a4a5a', paddingRight: 6, whiteSpace: 'nowrap', fontSize: 10.5 }}>
        {entry.timestamp}
      </span>
      <span style={{
        padding: '0 5px', borderRadius: 2, fontSize: 9.5, fontWeight: 700,
        marginRight: 6, letterSpacing: '0.04em', whiteSpace: 'nowrap',
        alignSelf: 'flex-start', marginTop: 3,
        background: lc.bg, color: lc.color, border: `1px solid ${lc.border}`,
      }}>
        {entry.layer}
      </span>
      <div style={{ flex: 1, paddingRight: 12, wordBreak: 'break-all' }}
        dangerouslySetInnerHTML={{ __html: entry.raw }} />
    </div>
  );
}

function StatItem({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ display: 'flex', gap: 5, fontFamily: "'JetBrains Mono', monospace" }}>
      <span>{label}:</span>
      <span style={{ fontWeight: 700, color }}>{value}</span>
    </div>
  );
}
