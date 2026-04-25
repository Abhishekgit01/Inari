import { useEffect, useState, useCallback } from 'react';
import { FiBox, FiActivity, FiAlertTriangle, FiCheckCircle, FiRefreshCw, FiTerminal, FiEdit2, FiShield } from 'react-icons/fi';
import { apiClient } from '../api/client';

interface NodeInfo {
  port: number;
  node_id: number;
  label: string;
  zone: string;
  service: string;
  vulnerability: string;
  data_value: string;
  compromised: boolean;
  status: string;
  alive: boolean;
  cpu_pct?: number;
  mem_mb?: number;
  internal_ip?: string;
  os_name?: string;
  net_rx_kbps?: number;
  net_tx_kbps?: number;
  cves_found?: string[];
  open_ports?: number[];
  running_processes?: string[];
  data_records?: number;
}

interface NodeDiscovery {
  nodes: NodeInfo[];
  total: number;
  zones: Record<string, NodeInfo[]>;
}

const ZONE_COLORS: Record<string, { bg: string; border: string; text: string; glow: string; icon: string }> = {
  dmz:         { bg: 'rgba(0,180,216,0.06)',  border: 'rgba(0,180,216,0.25)',  text: '#00b4d8', glow: '0 0 20px rgba(0,180,216,0.15)', icon: '🛡️' },
  app_server:  { bg: 'rgba(255,165,0,0.06)',  border: 'rgba(255,165,0,0.25)',  text: '#ffa500', glow: '0 0 20px rgba(255,165,0,0.15)', icon: '⚙️' },
  db_server:   { bg: 'rgba(190,80,255,0.06)', border: 'rgba(190,80,255,0.25)', text: '#be50ff', glow: '0 0 20px rgba(190,80,255,0.15)', icon: '🗄️' },
  workstation: { bg: 'rgba(0,255,136,0.06)',  border: 'rgba(0,255,136,0.25)',  text: '#00ff88', glow: '0 0 20px rgba(0,255,136,0.15)', icon: '👤' },
};

const ZONE_LABELS: Record<string, string> = {
  dmz: 'DMZ — Perimeter',
  app_server: 'Application Servers',
  db_server: 'Databases',
  workstation: 'Workstations & Endpoints',
};

const SEVERITY_COLORS: Record<string, string> = {
  low: '#00ff88',
  medium: '#ffa500',
  high: '#ff335f',
  critical: '#ff0044',
};

export function DockerPage() {
  const [discovery, setDiscovery] = useState<NodeDiscovery | null>(null);
  const [logs, setLogs] = useState<{ port: number; label: string; lines: { ts: string; method: string; path: string; ua: string }[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingNode, setEditingNode] = useState<{ port: number; label: string; role: string } | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [editRole, setEditRole] = useState('');

  const getApiKey = () => localStorage.getItem('cg_enterprise_key') || 'ath_local_admin';

  const fetchNodes = useCallback(async () => {
    try {
      const res = await apiClient.get('/api/nodes/discover', { headers: { 'X-API-Key': getApiKey() } });
      setDiscovery(res.data);
    } catch {
      setDiscovery({ nodes: [], total: 0, zones: {} });
    }
    setLoading(false);
  }, []);

  const fetchLogs = async (port: number, label: string) => {
    try {
      const res = await apiClient.get(`/api/nodes/${port}/logs`, { headers: { 'X-API-Key': getApiKey() } });
      setLogs({ port, label, lines: res.data.logs || [] });
    } catch {
      setLogs({ port, label, lines: [] });
    }
  };

  const handleEdit = async () => {
    if (!editingNode) return;
    try {
      await apiClient.put(`/api/nodes/${editingNode.port}/edit`, { label: editLabel, role: editRole }, { headers: { 'X-API-Key': getApiKey(), 'Content-Type': 'application/json' } });
      setEditingNode(null);
      fetchNodes();
    } catch { /* ignore */ }
  };

  useEffect(() => {
    fetchNodes();
    const interval = setInterval(fetchNodes, 2000);
    return () => clearInterval(interval);
  }, [fetchNodes]);

  const nodeCount = discovery?.total ?? 0;
  const onlineCount = discovery?.nodes.filter(n => n.alive).length ?? 0;
  const compromisedCount = discovery?.nodes.filter(n => n.compromised).length ?? 0;

  return (
    <div className="min-h-screen p-4 md:p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white" style={{ fontFamily: '"Orbitron", monospace' }}>
            Network Infrastructure
          </h1>
          <p className="text-sm text-gray-400 mt-1" style={{ fontFamily: '"IBM Plex Mono", monospace' }}>
            Live node services · {nodeCount > 0 ? `${discovery?.nodes[0]?.port}–${discovery?.nodes[discovery.nodes.length - 1]?.port}` : 'Waiting for nodes...'}
          </p>
        </div>
        <button
          onClick={() => { setLoading(true); fetchNodes(); }}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all hover:scale-105"
          style={{ backgroundColor: 'rgba(0,229,255,0.1)', color: '#00e5ff', border: '1px solid rgba(0,229,255,0.3)', fontFamily: '"IBM Plex Mono", monospace' }}
        >
          <FiRefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Total Nodes', value: nodeCount, color: '#00e5ff', icon: <FiBox size={16} /> },
          { label: 'Online', value: onlineCount, color: '#00ff88', icon: <FiActivity size={16} /> },
          { label: 'Compromised', value: compromisedCount, color: compromisedCount > 0 ? '#ff335f' : '#555', icon: <FiAlertTriangle size={16} /> },
          { label: 'Zones', value: Object.keys(discovery?.zones ?? {}).length, color: '#be50ff', icon: <FiShield size={16} /> },
        ].map((s) => (
          <div key={s.label} className="rounded-xl p-3 flex items-center gap-3" style={{ backgroundColor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ color: s.color }}>{s.icon}</div>
            <div>
              <p className="text-xl font-bold" style={{ color: s.color, fontFamily: '"Orbitron", monospace' }}>{s.value}</p>
              <p className="text-[10px] text-gray-500 uppercase tracking-wider" style={{ fontFamily: '"IBM Plex Mono", monospace' }}>{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Status Banner */}
      <div
        className="rounded-xl p-4 mb-6 flex items-center gap-4"
        style={{
          backgroundColor: nodeCount > 0 ? 'rgba(0,255,136,0.04)' : 'rgba(255,51,95,0.04)',
          border: `1px solid ${nodeCount > 0 ? 'rgba(0,255,136,0.15)' : 'rgba(255,51,95,0.15)'}`,
        }}
      >
        {nodeCount > 0 ? <FiCheckCircle className="text-green-400 shrink-0" size={20} /> : <FiAlertTriangle className="text-red-400 shrink-0" size={20} />}
        <div>
          <p className="text-white font-medium text-sm">
            {nodeCount > 0 ? `${nodeCount} Node Services Detected` : 'No Node Services Running'}
          </p>
          <p className="text-gray-400 text-xs mt-0.5" style={{ fontFamily: '"IBM Plex Mono", monospace' }}>
            {nodeCount > 0
              ? `${onlineCount} online across ${Object.keys(discovery?.zones ?? {}).length} zones · Polling every 8s`
              : 'Start nodes with: cd backend && python node_servers.py'}
          </p>
        </div>
      </div>

      {/* Zone Cards */}
      {loading && !discovery ? (
        <div className="text-center text-gray-400 py-12">
          <FiRefreshCw className="animate-spin mx-auto mb-2" size={24} />
          Discovering nodes...
        </div>
      ) : nodeCount === 0 ? (
        <div className="text-center py-12">
          <FiBox className="mx-auto mb-3 text-gray-500" size={40} />
          <p className="text-gray-400 text-sm">No node services discovered on ports 8005-8019</p>
          <p className="text-gray-500 text-xs mt-2" style={{ fontFamily: '"IBM Plex Mono", monospace' }}>
            Run: <span className="text-cyan-400">cd backend && python node_servers.py</span>
          </p>
        </div>
      ) : (
        <div className="flex gap-6">
          {/* Main Grid */}
          <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-4">
            {Object.entries(discovery?.zones ?? {}).map(([zone, zoneNodes]) => {
              const zc = ZONE_COLORS[zone] || { bg: 'rgba(255,255,255,0.03)', border: 'rgba(255,255,255,0.08)', text: '#aaa', glow: 'none', icon: '📦' };
              return (
                <div
                  key={zone}
                  className="rounded-xl p-4 transition-all"
                  style={{ backgroundColor: zc.bg, border: `1px solid ${zc.border}`, boxShadow: zc.glow }}
                >
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-lg">{zc.icon}</span>
                    <h2 className="text-sm font-semibold" style={{ color: zc.text, fontFamily: '"Orbitron", monospace' }}>
                      {ZONE_LABELS[zone] || zone}
                    </h2>
                    <span
                      className="text-xs px-2 py-0.5 rounded-full ml-auto"
                      style={{ backgroundColor: zc.text, color: '#0a1628', fontWeight: 700, fontFamily: '"IBM Plex Mono", monospace' }}
                    >
                      {zoneNodes.length} nodes
                    </span>
                  </div>

                  <div className="space-y-2">
                    {zoneNodes.map((n) => (
                      <div
                        key={n.port}
                        className="p-3 rounded-lg cursor-pointer transition-all hover:bg-white/5 group relative"
                        style={{ backgroundColor: 'rgba(12,18,28,0.9)', border: `1px solid ${n.compromised ? 'rgba(255,51,95,0.3)' : 'rgba(255,255,255,0.06)'}` }}
                        onClick={() => fetchLogs(n.port, n.label)}
                      >
                        {/* Node Name Label on top */}
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: n.alive ? '#00ff88' : '#ff335f', boxShadow: n.alive ? '0 0 6px #00ff88' : '0 0 6px #ff335f' }} />
                            <span className="text-white text-sm font-bold tracking-wide" style={{ fontFamily: '"Orbitron", monospace', color: zc.text }}>
                              {n.label}
                            </span>
                            {n.compromised && (
                              <span className="text-[9px] px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 font-bold tracking-wider" style={{ fontFamily: '"IBM Plex Mono", monospace' }}>
                                COMPROMISED
                              </span>
                            )}
                          </div>
                          <button
                            className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-cyan-400 p-1"
                            onClick={(e) => { e.stopPropagation(); setEditingNode({ port: n.port, label: n.label, role: n.service }); setEditLabel(n.label); setEditRole(n.service); }}
                          >
                            <FiEdit2 size={12} />
                          </button>
                        </div>

                        {/* Node Details */}
                        <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[9px] leading-tight" style={{ fontFamily: '"IBM Plex Mono", monospace' }}>
                          <span className="text-gray-500">OS Name</span>
                          <span className="text-gray-300 truncate">{n.os_name || 'Alpine Linux'}</span>
                          <span className="text-gray-500">Internal IP</span>
                          <span className="text-blue-300 truncate">{n.internal_ip || '10.0.1.X'}</span>
                          <span className="text-gray-500">Role</span>
                          <span className="text-gray-300 truncate">{n.service || 'Unknown'}</span>
                          <span className="text-gray-500">Port Binding</span>
                          <span className="text-green-300">127.0.0.1:{n.port}</span>
                          <span className="text-gray-500">CPU Usage</span>
                          <span className="text-yellow-200">{n.cpu_pct !== undefined ? n.cpu_pct + '%' : '--'}</span>
                          <span className="text-gray-500">Memory (RSS)</span>
                          <span className="text-yellow-200">{n.mem_mb !== undefined ? n.mem_mb + ' MB' : '--'}</span>
                          <span className="text-gray-500">Net RX/TX</span>
                          <span className="text-emerald-300">{(n.net_rx_kbps || 0).toFixed(0)}/{(n.net_tx_kbps || 0).toFixed(0)} kbps</span>
                          <span className="text-gray-500">Vuln Exp</span>
                          <span style={{ color: SEVERITY_COLORS[n.vulnerability || 'low'] || '#aaa', fontWeight: 600 }}>{(n.vulnerability || 'low').toUpperCase()}</span>
                          
                          <div className="col-span-2 my-1 border-t border-white/10" />
                          <span className="text-gray-500">Identified CVEs</span>
                          <span className="text-red-300 truncate">{n.cves_found && n.cves_found.length > 0 && n.cves_found[0] !== 'None' ? n.cves_found.join(', ') : 'None'}</span>
                          <span className="text-gray-500">Open TCP Ports</span>
                          <span className="text-cyan-300 truncate">{n.open_ports ? n.open_ports.join(', ') : `${n.port}`}</span>
                          <span className="text-gray-500">Active Procs</span>
                          <span className="text-gray-400 truncate">{n.running_processes ? n.running_processes.join(', ') : '--'}</span>
                          <span className="text-gray-500">Data Records</span>
                          <span className="text-fuchsia-300">{n.data_records !== undefined && n.data_records > 0 ? n.data_records.toLocaleString() : 'N/A'}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Side Legend */}
          <div className="hidden xl:block w-56 shrink-0">
            <div className="rounded-xl p-4 sticky top-6" style={{ backgroundColor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <h3 className="text-xs font-bold text-gray-300 uppercase tracking-wider mb-3" style={{ fontFamily: '"Orbitron", monospace' }}>
                Zone Legend
              </h3>
              <div className="space-y-3">
                {Object.entries(ZONE_COLORS).map(([zone, zc]) => (
                  <div key={zone} className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: zc.text }} />
                    <span className="text-[11px] text-gray-400" style={{ fontFamily: '"IBM Plex Mono", monospace' }}>
                      {ZONE_LABELS[zone] || zone}
                    </span>
                  </div>
                ))}
              </div>

              <div className="mt-5 pt-4 border-t border-white/5">
                <h3 className="text-xs font-bold text-gray-300 uppercase tracking-wider mb-3" style={{ fontFamily: '"Orbitron", monospace' }}>
                  Status
                </h3>
                <div className="space-y-2">
                  {[
                    { color: '#00ff88', label: 'Online' },
                    { color: '#ff335f', label: 'Compromised' },
                    { color: '#555', label: 'Offline' },
                  ].map((s) => (
                    <div key={s.label} className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color, boxShadow: `0 0 4px ${s.color}` }} />
                      <span className="text-[11px] text-gray-400" style={{ fontFamily: '"IBM Plex Mono", monospace' }}>{s.label}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-5 pt-4 border-t border-white/5">
                <h3 className="text-xs font-bold text-gray-300 uppercase tracking-wider mb-2" style={{ fontFamily: '"Orbitron", monospace' }}>
                  Commands
                </h3>
                <p className="text-[10px] text-gray-500 leading-relaxed" style={{ fontFamily: '"IBM Plex Mono", monospace' }}>
                  <span className="text-cyan-400">Start:</span> cd backend && python node_servers.py<br />
                  <span className="text-cyan-400">Probe:</span> curl localhost:8005/health<br />
                  <span className="text-cyan-400">Logs:</span> curl localhost:8005/logs
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Log Viewer Modal */}
      {logs && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setLogs(null)}>
          <div
            className="w-full max-w-2xl max-h-[70vh] rounded-xl overflow-hidden"
            style={{ backgroundColor: 'rgba(8,14,24,0.97)', border: '1px solid rgba(0,229,255,0.2)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-3 border-b border-white/5">
              <div className="flex items-center gap-2">
                <FiTerminal className="text-cyan-400" size={14} />
                <span className="text-white text-sm font-medium" style={{ fontFamily: '"IBM Plex Mono", monospace' }}>
                  {logs.label} · :{logs.port}
                </span>
              </div>
              <button onClick={() => setLogs(null)} className="text-gray-400 hover:text-white text-xs px-2 py-1">Close</button>
            </div>
            <div className="p-3 overflow-y-auto max-h-[60vh]">
              {logs.lines.length === 0 ? (
                <p className="text-gray-500 text-xs">No requests logged yet. The AI simulation will populate this.</p>
              ) : (
                logs.lines.map((entry, i) => (
                  <p key={i} className="text-xs leading-relaxed" style={{
                    color: entry.ua?.includes('EXPLOIT') || entry.ua?.includes('SCAN') ? '#ff335f' : entry.ua?.includes('ISOLATE') || entry.ua?.includes('MONITOR') ? '#00e5ff' : 'rgba(200,210,230,0.7)',
                    fontFamily: '"IBM Plex Mono", monospace',
                  }}>
                    <span className="text-gray-600">{entry.ts?.slice(11,19) || '—'}</span>
                    {' '}<span className="text-gray-400">{entry.method}</span>
                    {' '}<span className="text-white/80">{entry.path}</span>
                    {entry.ua && <span className="text-gray-600"> · {entry.ua}</span>}
                  </p>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editingNode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setEditingNode(null)}>
          <div
            className="w-full max-w-md rounded-xl p-5"
            style={{ backgroundColor: 'rgba(8,14,24,0.97)', border: '1px solid rgba(0,229,255,0.2)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-white font-bold mb-4" style={{ fontFamily: '"Orbitron", monospace' }}>Edit Node · :{editingNode.port}</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-400 block mb-1" style={{ fontFamily: '"IBM Plex Mono", monospace' }}>Label</label>
                <input
                  value={editLabel}
                  onChange={(e) => setEditLabel(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg text-sm text-white outline-none"
                  style={{ backgroundColor: 'rgba(0,0,0,0.4)', border: '1px solid rgba(0,229,255,0.2)', fontFamily: '"IBM Plex Mono", monospace' }}
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1" style={{ fontFamily: '"IBM Plex Mono", monospace' }}>Role</label>
                <input
                  value={editRole}
                  onChange={(e) => setEditRole(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg text-sm text-white outline-none"
                  style={{ backgroundColor: 'rgba(0,0,0,0.4)', border: '1px solid rgba(0,229,255,0.2)', fontFamily: '"IBM Plex Mono", monospace' }}
                />
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button
                onClick={handleEdit}
                className="flex-1 py-2 rounded-lg text-sm font-medium"
                style={{ backgroundColor: 'rgba(0,229,255,0.15)', color: '#00e5ff', border: '1px solid rgba(0,229,255,0.3)', fontFamily: '"IBM Plex Mono", monospace' }}
              >
                Save
              </button>
              <button
                onClick={() => setEditingNode(null)}
                className="flex-1 py-2 rounded-lg text-sm font-medium text-gray-400"
                style={{ backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
