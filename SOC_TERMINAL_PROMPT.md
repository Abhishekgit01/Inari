# SOC TERMINAL — IMPLEMENTATION PROMPT
## CyberGuardian AI | Claude Code-style live log terminal
## Component: SocTerminal.tsx + useLogStream.ts

---

## WHAT TO BUILD

A Claude Code-style terminal panel that sits alongside the D3 network graph on
the /live page. It streams real security logs from your backend WebSocket in
real time, color-coded by layer and severity, exactly as a backend engineer or
SOC analyst would expect to see them.

Every line is a real log entry from one of your three signal layers.
Alerts, correlations, and false positive resolutions appear as indented
block-quote-style callouts inside the same stream.

---

## VISUAL DESIGN RULES

```
Font:        JetBrains Mono (monospace — non-negotiable)
Background:  #0a0d14 (deep navy-black)
Surface:     #111520 (slightly lighter for hover states)
Border:      #1e2a3a

Color assignments (STRICT — backend engineers will notice if wrong):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
LAYER TAGS (left-side badges):
  [NET]  background:#001a2a  text:#00aacc  border:#003a4a  → network logs
  [EP]   background:#1a001a  text:#cc66ff  border:#3a003a  → endpoint logs
  [APP]  background:#001a0d  text:#00cc66  border:#003a1a  → application logs
  [CORR] background:#2d2700  text:#ffcc00  border:#4a4200  → correlator output
  [ALERT]background:#2d0d0d  text:#ff4466  border:#4a1a1a  → alert blocks
  [SYS]  background:#1a0d00  text:#ff8833  border:#3a1a00  → system messages

KEY=VALUE COLOR CODING (inside each log line):
  IP addresses:        #5bc8e8   → src_ip, dst_ip
  Port numbers:        #7b9bbb   → src_port, dst_port
  Protocol:            #9b7bbb   → TCP, UDP, HTTP
  Bytes/size:          #e8b45b   → bytes, payload_bytes
  Process names:       #bb7be8   → proc=, parent=
  Usernames:           #7be8b4   → user=
  File paths:          #e8e85b   → file=, path=
  Registry keys:       #e8875b   → reg=
  URLs/endpoints:      #5be8a8   → endpoint=, url=
  User agents:         #a08060   → ua=
  TCP flags:           #8080d0   → flags=
  Numbers/counts:      #d0a060   → attempts=, duration=, pid=
  Countries/geo:       #d06060   → geo=, country=
  Key names:           #4a6a8a   → the "key=" part
  Separators:          #1e3a4a   → │

SEVERITY COLORS (for alert blocks and verdict labels):
  CRITICAL: #ff3366   → border-left:3px, background:#0d0008
  HIGH:     #ff6b35   → border-left:3px, background:#0d0800
  MEDIUM:   #ffcc00   → border-left:3px, background:#0d0d00
  LOW:      #00ff88   → border-left:3px, background:#000d08
  BENIGN:   #4a6a5a   → for normal_traffic notes
  FALSE_POS:#ffcc00   → verdict color, not a threat color

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## LOG LINE FORMAT — EXACT STRUCTURE

Every line follows this pattern:
```
{lineNum}  {HH:MM:SS.mmm}  [{LAYER}]  key=value │ key=value │ key=value
```

### Network Layer Example
```
 47  14:23:07.441  [NET]  src=10.0.0.1:54821 │ dst=185.220.101.45:443 │
                          proto=TCP │ bytes=247 │ dur_ms=142 │ flags=PSH,ACK │
                          attempts=127 │ BRUTE_FORCE_CANDIDATE
```

### Endpoint Layer Example
```
 48  14:23:07.443  [EP]   host=DMZ-01 │ proc=mimikatz.exe │ ppid=4821 │
                          parent=cmd.exe │ user=NT AUTHORITY\SYSTEM │
                          file=C:\Windows\System32\lsass.exe │
                          reg=HKLM\SYSTEM\CurrentControlSet\Services\
```

### Application Layer Example
```
 49  14:23:07.445  [APP]  src=10.0.0.1 │ POST /auth/login │ status=401 │
                          payload_bytes=384 │ ua=python-requests/2.28.0 │
                          geo=RU (VPN) │ corr_id=ATK-A3F8B21C
```

### Correlator Output Example
```
 50  14:23:07.447  [CORR] corr_id=ATK-A3F8B21C │ layers=[network,endpoint,application] │
                          action=brute_force_detection │ THREAT │ confidence=94%
```

### Alert Block (indented, after correlator confirms)
```
     ┌─ [CRITICAL] BRUTE FORCE DETECTED ──────────────────────────────────────┐
     │  SSH dictionary attack from 185.220.101.45 — 127 failed auth attempts  │
     │  in 12 seconds. DMZ-01 targeted. All 3 layers confirmed.               │
     │  MITRE: T1110.001 — Brute Force: Password Guessing │ CORR: ATK-A3F8B21C │
     └─────────────────────────────────────────────────────────────────────────┘
```

### Cross-Layer Correlation Confirmed Block (cyan border)
```
     ┌─ [◈ CROSS-LAYER CORRELATION CONFIRMED] ──────────────────────────────────┐
     │  corr_id=ATK-A3F8B21C │ layers=[network, endpoint, application]          │
     │  confidence=94% │ severity=CRITICAL                                       │
     │  Single-layer signal upgraded to CRITICAL incident after multi-layer match│
     └─────────────────────────────────────────────────────────────────────────-┘
```

### False Positive Resolution Block (amber border)
```
     ┌─ [✓ FALSE POSITIVE RESOLVED] ─────────────────────────────────────────────┐
     │  Initial network signal: 250MB outbound (flagged as exfiltration)         │
     │  Resolved by endpoint: parent=taskschd.exe, user=DOMAIN\svc_backup        │
     │  Resolved by app: endpoint=/backup/nightly, ua=robocopy                   │
     │  Cross-layer confidence: 14% → DOWNGRADED → FALSE_POSITIVE               │
     │  CORR: FP-7A3B9C2D │ REASON: scheduled_task+service_account+backup_ep    │
     └────────────────────────────────────────────────────────────────────────────┘
```

---

## REACT COMPONENT — SocTerminal.tsx

```tsx
import React, { useEffect, useRef, useState, useCallback } from 'react';

interface LogEntry {
  id: string;
  lineNum: number;
  timestamp: string;
  layer: 'NET' | 'EP' | 'APP' | 'CORR' | 'SYS' | 'ALERT';
  raw: string;           // Pre-formatted HTML string (see renderer below)
  severity?: 'critical' | 'high' | 'medium' | 'low';
  isAlert?: boolean;
  isCorrelation?: boolean;
  isFalsePositive?: boolean;
  corrId?: string;
}

interface SocTerminalProps {
  simulationId: string;
  height?: number;
  onAlertClick?: (corrId: string) => void;  // Link to network graph highlight
}

export const SocTerminal: React.FC<SocTerminalProps> = ({
  simulationId,
  height = 480,
  onAlertClick,
}) => {
  const logAreaRef = useRef<HTMLDivElement>(null);
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [paused, setPaused] = useState(false);
  const [lineCounter, setLineCounter] = useState(1);
  const [filter, setFilter] = useState<'all' | 'NET' | 'EP' | 'APP' | 'alerts'>('all');
  const [counts, setCounts] = useState({ critical: 0, high: 0, medium: 0, low: 0, total: 0 });
  const pausedRef = useRef(false);
  const lineRef = useRef(1);

  // Auto-scroll unless paused
  useEffect(() => {
    if (!paused && logAreaRef.current) {
      logAreaRef.current.scrollTop = logAreaRef.current.scrollHeight;
    }
  }, [entries, paused]);

  // ── RENDER A SINGLE LOG LINE TO HTML ────────────────────────────────────────
  // Call this whenever a new log arrives from the WebSocket step message.
  // It converts structured log data to the color-coded HTML string.

  const renderNetworkLog = useCallback((log: NetworkLogData): string => {
    const dstIp = log.target_host_id === -1
      ? log.dst_ip                          // External IP for exfil/beacon
      : `10.0.${log.target_host_id}.x`;

    return [
      kv('src', `${log.src_ip}:${log.src_port}`, 'ip', 'port'),
      sep(),
      kv('dst', `${dstIp}:${log.dst_port}`, 'ip', 'port'),
      sep(),
      kv('proto', log.protocol, 'proto'),
      sep(),
      kv('bytes', fmtBytes(log.bytes_sent), 'bytes'),
      sep(),
      kv('dur_ms', log.duration_ms, 'num'),
      sep(),
      kv('flags', log.flags, 'flag'),
      log.action_type !== 'normal_traffic' ? sep() + badge(log.action_type) : '',
    ].join(' ');
  }, []);

  const renderEndpointLog = useCallback((log: EndpointLogData): string => {
    return [
      kv('host', log.host_label, 'ip'),
      sep(),
      kv('proc', log.process_name, 'proc'),
      sep(),
      kv('ppid', log.process_pid, 'num'),
      sep(),
      kv('parent', log.parent_process, 'flag'),
      sep(),
      kv('user', log.user, 'user'),
      log.file_access?.length ? sep() + kv('file', log.file_access[0], 'path') : '',
      log.registry_changes?.length ? sep() + kv('reg', log.registry_changes[0], 'reg') : '',
      log.correlation_id ? sep() + kv('corr_id', log.correlation_id, 'ip') : '',
    ].join(' ');
  }, []);

  const renderApplicationLog = useCallback((log: ApplicationLogData): string => {
    const statusColor = log.status_code >= 400 ? 'v-critical'
                      : log.status_code >= 300 ? 'v-medium' : 'v-low';
    return [
      kv('src', log.src_ip, 'ip'),
      sep(),
      `<span class="v-flag">${log.method}</span>`,
      `<span class="v-url"> ${log.endpoint}</span>`,
      sep(),
      kv('status', log.status_code, null, statusColor),
      sep(),
      kv('payload_bytes', fmtBytes(log.payload_size_bytes), 'bytes'),
      sep(),
      kv('ua', truncate(log.user_agent, 30), 'ua'),
      sep(),
      kv('geo', log.geolocation?.country || 'LOCAL', 'country'),
      log.correlation_id ? sep() + kv('corr_id', log.correlation_id, 'ip') : '',
    ].join(' ');
  }, []);

  // ── INGEST FROM WEBSOCKET ────────────────────────────────────────────────────
  // Call this from your useSimulationSocket hook whenever a step message arrives.
  // Pass the full info.logs array from the backend.

  const ingestStepLogs = useCallback((stepLogs: any[], newAlerts: any[]) => {
    if (pausedRef.current) return;

    const newEntries: LogEntry[] = [];

    for (const log of stepLogs) {
      if (!log.layer) continue;

      let rawHtml = '';
      let layer: LogEntry['layer'] = 'SYS';

      if (log.layer === 'network') {
        layer = 'NET';
        rawHtml = renderNetworkLog(log);
      } else if (log.layer === 'endpoint') {
        layer = 'EP';
        rawHtml = renderEndpointLog(log);
      } else if (log.layer === 'application') {
        layer = 'APP';
        rawHtml = renderApplicationLog(log);
      } else {
        continue;
      }

      newEntries.push({
        id: `${log.correlation_id}-${log.layer}-${lineRef.current}`,
        lineNum: lineRef.current++,
        timestamp: new Date().toISOString().substr(11, 12),
        layer,
        raw: rawHtml,
        corrId: log.correlation_id,
      });
    }

    // Append alerts after the logs they relate to
    for (const alert of newAlerts) {
      if (alert.is_likely_false_positive) {
        newEntries.push(buildFPEntry(alert));
      } else {
        newEntries.push(buildCorrEntry(alert));
        newEntries.push(buildAlertEntry(alert));
      }
    }

    setEntries(prev => [...prev.slice(-500), ...newEntries]);  // cap at 500 lines
    setLineCounter(lineRef.current);
  }, [renderNetworkLog, renderEndpointLog, renderApplicationLog]);

  // ── ENTRY BUILDERS ───────────────────────────────────────────────────────────

  const buildCorrEntry = (alert: any): LogEntry => ({
    id: `corr-${alert.id}`,
    lineNum: lineRef.current++,
    timestamp: new Date().toISOString().substr(11, 12),
    layer: 'CORR',
    raw: [
      kv('corr_id', alert.correlation_id, 'ip'),
      sep(),
      kv('layers', `[${Object.entries(alert.layer_breakdown).filter(([,v])=>v).map(([k])=>k).join(',')}]`, 'flag'),
      sep(),
      kv('action', `${alert.threat_type}_detection`, 'proc'),
      sep(),
      `<span class="v-critical v-threat">THREAT</span>`,
      sep(),
      kv('confidence', `${Math.round(alert.confidence * 100)}%`, 'num'),
    ].join(' '),
    isCorrelation: true,
    severity: alert.severity,
    corrId: alert.correlation_id,
  });

  const buildAlertEntry = (alert: any): LogEntry => ({
    id: `alert-${alert.id}`,
    lineNum: lineRef.current++,
    timestamp: new Date().toISOString().substr(11, 12),
    layer: 'ALERT',
    raw: alert.id,    // Treated specially in render
    isAlert: true,
    severity: alert.severity,
    corrId: alert.correlation_id,
  });

  const buildFPEntry = (alert: any): LogEntry => ({
    id: `fp-${alert.id}`,
    lineNum: lineRef.current++,
    timestamp: new Date().toISOString().substr(11, 12),
    layer: 'CORR',
    raw: alert.id,
    isFalsePositive: true,
    corrId: alert.correlation_id,
  });

  // Expose ingestStepLogs to parent via ref
  // Parent calls: terminalRef.current?.ingest(info.logs, info.new_alerts)

  // ── RENDER ───────────────────────────────────────────────────────────────────

  const visibleEntries = filter === 'all' ? entries
    : filter === 'alerts' ? entries.filter(e => e.isAlert || e.isCorrelation || e.isFalsePositive)
    : entries.filter(e => e.layer === filter);

  return (
    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12,
                  background: '#0a0d14', border: '1px solid #1e2a3a',
                  borderRadius: 8, overflow: 'hidden', display: 'flex',
                  flexDirection: 'column', height }}>

      {/* Title bar */}
      <div style={{ background: '#0d1117', borderBottom: '1px solid #1e2a3a',
                    padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ display: 'flex', gap: 6 }}>
          {['#ff5f57','#febc2e','#28c840'].map(c => (
            <div key={c} style={{ width: 11, height: 11, borderRadius: '50%', background: c }} />
          ))}
        </div>
        <span style={{ color: '#4a5568', fontSize: 11, flex: 1, textAlign: 'center', letterSpacing: '0.05em' }}>
          CYBERGUARDIAN AI — SOC TERMINAL
        </span>
        <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 12,
                       background: '#0d2d1a', color: '#00ff88', border: '1px solid #1a4a2a' }}>
          ● LIVE
        </span>
      </div>

      {/* Layer filter tabs */}
      <div style={{ display: 'flex', background: '#0d1117', borderBottom: '1px solid #1e2a3a' }}>
        {(['all','NET','EP','APP','alerts'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            style={{ padding: '5px 14px', fontSize: 11, cursor: 'pointer', background: 'transparent', border: 'none',
                     borderBottom: `2px solid ${filter === f ? '#00e5ff' : 'transparent'}`,
                     color: filter === f ? '#00e5ff'
                          : f === 'NET' ? '#00aacc'
                          : f === 'EP' ? '#cc66ff'
                          : f === 'APP' ? '#00cc66'
                          : f === 'alerts' ? '#ff4466'
                          : '#4a5568' }}>
            {f}
          </button>
        ))}
      </div>

      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 10px',
                    background: '#111520', borderBottom: '1px solid #1e2a3a' }}>
        <button onClick={() => { setPaused(p => !p); pausedRef.current = !pausedRef.current; }}
          style={toolbarBtn(paused ? '#ffcc00' : undefined)}>
          {paused ? '▶ resume' : '⏸ pause'}
        </button>
        <button onClick={() => setEntries([])} style={toolbarBtn()}>✕ clear</button>
        <div style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
          {[['critical','CRIT','#2d0d1a','#ff3366','#4a1a2a'],
            ['high','HIGH','#2d1a0d','#ff6b35','#4a2a1a'],
            ['medium','MED','#2d2700','#ffcc00','#4a4200'],
            ['low','LOW','#0d2d1a','#00ff88','#1a4a2a']].map(([key,label,bg,color,border]) => (
            <span key={key} style={{ fontSize: 10, padding: '2px 7px', borderRadius: 3, fontWeight: 500,
                                     background: bg, color, border: `1px solid ${border}` }}>
              {counts[key as keyof typeof counts]} {label}
            </span>
          ))}
        </div>
      </div>

      {/* Log area */}
      <div ref={logAreaRef} style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
        {visibleEntries.map(entry => (
          <LogLineRenderer key={entry.id} entry={entry} onAlertClick={onAlertClick} />
        ))}
        {entries.length === 0 && (
          <div style={{ color: '#2d3748', padding: '20px 16px', fontSize: 11 }}>
            Waiting for simulation to start...
            <span style={{ display: 'inline-block', width: 7, height: 12, background: '#00e5ff',
                           verticalAlign: 'middle', animation: 'blink 1s step-end infinite', marginLeft: 4 }} />
          </div>
        )}
      </div>

      {/* Stats bar */}
      <div style={{ display: 'flex', gap: 12, padding: '5px 14px', background: '#0d1117',
                    borderTop: '1px solid #1e2a3a', fontSize: 10, color: '#4a5568' }}>
        <StatItem label="TOTAL" value={counts.total} color="#8090a0" />
        <StatItem label="THREATS" value={counts.critical + counts.high} color="#ff3366" />
        <StatItem label="MED" value={counts.medium} color="#ffcc00" />
        <StatItem label="SAFE" value={counts.low} color="#00ff88" />
      </div>
    </div>
  );
};
```

---

## LOG LINE RENDERER COMPONENT

```tsx
const LogLineRenderer: React.FC<{ entry: LogEntry; onAlertClick?: (id: string) => void }> = ({
  entry, onAlertClick
}) => {
  const layerColors: Record<string, { bg: string; color: string; border: string }> = {
    NET:   { bg: '#001a2a', color: '#00aacc', border: '#003a4a' },
    EP:    { bg: '#1a001a', color: '#cc66ff', border: '#3a003a' },
    APP:   { bg: '#001a0d', color: '#00cc66', border: '#003a1a' },
    CORR:  { bg: '#2d2700', color: '#ffcc00', border: '#4a4200' },
    ALERT: { bg: '#2d0d0d', color: '#ff4466', border: '#4a1a1a' },
    SYS:   { bg: '#1a0d00', color: '#ff8833', border: '#3a1a00' },
  };

  const lc = layerColors[entry.layer];

  // Alert block — indented callout
  if (entry.isAlert || entry.isCorrelation || entry.isFalsePositive) {
    const borderColor = entry.isFalsePositive ? '#ffcc00'
                      : entry.isCorrelation  ? '#00e5ff'
                      : entry.severity === 'critical' ? '#ff3366'
                      : entry.severity === 'high'     ? '#ff6b35'
                      : entry.severity === 'medium'   ? '#ffcc00' : '#00ff88';
    const bg = entry.isFalsePositive ? '#0d0d00'
             : entry.isCorrelation  ? '#000d14'
             : entry.severity === 'critical' ? '#0d0008'
             : entry.severity === 'high'     ? '#0d0800'
             : '#0d0d00';

    return (
      <div style={{ borderLeft: `3px solid ${borderColor}`, margin: '2px 0 2px 44px',
                    padding: '4px 10px', background: bg }}
           dangerouslySetInnerHTML={{ __html: entry.raw }} />
    );
  }

  // Normal log line
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', padding: '1px 0',
                  fontSize: 11.5, lineHeight: 1.6, cursor: 'default' }}
         onMouseEnter={e => (e.currentTarget.style.background = '#111a24')}
         onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>

      {/* Line number */}
      <span style={{ color: '#1e3a4a', padding: '0 8px', minWidth: 44,
                     textAlign: 'right', fontSize: 10, paddingTop: 2 }}>
        {entry.lineNum}
      </span>

      {/* Timestamp */}
      <span style={{ color: '#2a4a5a', paddingRight: 6, whiteSpace: 'nowrap', fontSize: 10.5 }}>
        {entry.timestamp}
      </span>

      {/* Layer tag */}
      <span style={{ padding: '0 5px', borderRadius: 2, fontSize: 9.5, fontWeight: 700,
                     marginRight: 6, letterSpacing: '0.04em', whiteSpace: 'nowrap',
                     alignSelf: 'flex-start', marginTop: 3,
                     background: lc.bg, color: lc.color, border: `1px solid ${lc.border}` }}>
        {entry.layer}
      </span>

      {/* Log content */}
      <div style={{ flex: 1, paddingRight: 12, wordBreak: 'break-all' }}
           dangerouslySetInnerHTML={{ __html: entry.raw }} />
    </div>
  );
};
```

---

## CSS HELPERS (put in SocTerminal.css or inline)

```typescript
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
    exploit:      ['v-critical', 'BRUTE_FORCE_CANDIDATE'],
    lateral_move: ['v-high',     'LATERAL_MOVE_CANDIDATE'],
    exfiltrate:   ['v-critical', 'EXFIL_CANDIDATE'],
    beacon:       ['v-medium',   'C2_BEACON_CANDIDATE'],
  };
  const [cls, label] = map[action] || ['v-benign', action.toUpperCase()];
  return `<span class="${cls} v-threat">${label}</span>`;
};

const fmtBytes = (b: number): string => {
  if (b > 1e9) return (b/1e9).toFixed(1)+'GB';
  if (b > 1e6) return (b/1e6).toFixed(1)+'MB';
  if (b > 1e3) return (b/1e3).toFixed(0)+'KB';
  return b+'B';
};

const truncate = (s: string, n: number) => s.length > n ? s.slice(0,n)+'...' : s;
const toolbarBtn = (activeColor?: string) => ({
  fontFamily: 'inherit', fontSize: 10, padding: '3px 10px', background: 'transparent',
  border: `1px solid ${activeColor || '#1e2a3a'}`, borderRadius: 4,
  color: activeColor || '#4a5568', cursor: 'pointer',
} as const);
const StatItem = ({label,value,color}: any) => (
  <div style={{ display: 'flex', gap: 5 }}>
    <span>{label}:</span>
    <span style={{ fontWeight: 700, color }}>{value}</span>
  </div>
);
```

---

## GLOBAL CSS (add to your index.css)

```css
/* JetBrains Mono */
@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;700&display=swap');

.v-ip      { color: #5bc8e8 }
.v-port    { color: #7b9bbb }
.v-proto   { color: #9b7bbb }
.v-bytes   { color: #e8b45b }
.v-proc    { color: #bb7be8 }
.v-user    { color: #7be8b4 }
.v-path    { color: #e8e85b }
.v-reg     { color: #e8875b }
.v-url     { color: #5be8a8 }
.v-ua      { color: #a08060 }
.v-flag    { color: #8080d0 }
.v-num     { color: #d0a060 }
.v-country { color: #d06060 }
.v-str     { color: #b0c0a0 }
.v-threat  { font-weight: 700 }
.v-critical{ color: #ff3366 }
.v-high    { color: #ff6b35 }
.v-medium  { color: #ffcc00 }
.v-low     { color: #00ff88 }
.v-benign  { color: #4a6a5a }
.k         { color: #4a6a8a }
.sep       { color: #1e3a4a; padding: 0 3px }
```

---

## WIRING TO WEBSOCKET (in your /live page)

```tsx
// In LivePage.tsx

const terminalRef = useRef<{ ingest: (logs: any[], alerts: any[]) => void }>(null);

// Inside your WebSocket step handler:
socket.on('step', (msg: StepMessage) => {
  // ... existing graph updates ...

  // Feed terminal
  terminalRef.current?.ingest(
    msg.info.logs,       // all logs from this step (all 3 layers)
    msg.info.new_alerts  // correlated alerts
  );
});

// Layout: terminal sits to the right of or below the D3 network graph
<div style={{ display: 'grid', gridTemplateColumns: '60% 40%', gap: 12, height: '100vh' }}>
  <NetworkTopologyGraph ... />
  <SocTerminal ref={terminalRef} simulationId={simId} height={600}
               onAlertClick={(corrId) => graphRef.current?.highlightCorr(corrId)} />
</div>
```

---

## WHAT EACH LOG TYPE TELLS A BACKEND ENGINEER

| Layer | What they see | Why they care |
|---|---|---|
| `[NET]` | src/dst IP, port, bytes, flags | Is this traffic pattern suspicious? C2? Exfil? |
| `[EP]` | Process, parent, user, file/reg | Did a bad process spawn? Privilege escalation? |
| `[APP]` | Method, endpoint, status, UA | API abuse? Credential stuffing? Data pull? |
| `[CORR]` | corr_id, layers, verdict, confidence | Did 2+ cameras see the same thing? |
| Alert block | Plain English + MITRE ID | What do I do RIGHT NOW? |
| FP block | Why it was cleared | Don't waste my time on this one |

---

*SOC Terminal Prompt v1.0 | CyberGuardian AI | Hack Malenadu '26*
