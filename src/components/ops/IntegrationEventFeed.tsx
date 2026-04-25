import type { IntegrationFeedEvent } from '../../lib/ops-types';

const badgeColor = (vendor: string) => {
  const normalized = vendor.toLowerCase();
  if (normalized.includes('splunk')) return { bg: 'rgba(20,209,255,0.12)', border: 'rgba(20,209,255,0.28)', color: '#14d1ff' };
  if (normalized.includes('endpoint') || normalized.includes('telemetry')) return { bg: 'rgba(255,204,0,0.12)', border: 'rgba(255,204,0,0.28)', color: '#ffcc00' };
  if (normalized.includes('stream')) return { bg: 'rgba(127,216,255,0.12)', border: 'rgba(127,216,255,0.28)', color: '#7fd8ff' };
  if (normalized.includes('crowdstrike')) return { bg: 'rgba(255,111,145,0.12)', border: 'rgba(255,111,145,0.28)', color: '#ff6f91' };
  return { bg: 'rgba(176,198,255,0.12)', border: 'rgba(176,198,255,0.28)', color: '#b0c6ff' };
};

const severityColor = (severity: string) => {
  switch (severity) {
    case 'critical':
      return '#ff335f';
    case 'high':
      return '#ff6600';
    case 'medium':
      return '#ffcc00';
    default:
      return '#14d1ff';
  }
};

export function IntegrationEventFeed({ events }: { events: IntegrationFeedEvent[] }) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <div className="ops-display text-[0.62rem]" style={{ color: '#00e5ff' }}>Threat Ops Bridge</div>
          <div style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 6 }}>
            Real external alerts bridged into the War Room
          </div>
        </div>
        <div className="status-pill status-pill-live">{events.length} external events</div>
      </div>

      <div className="panel-scroll mt-4 space-y-3 max-h-[360px] overflow-y-auto pr-1">
        {events.length ? (
          events.map((event) => {
            const badge = badgeColor(event.vendor || event.source);
            return (
              <div
                className="feed-item"
                key={event.id}
                style={{
                  borderColor: 'rgba(255,255,255,0.08)',
                  background: 'rgba(3, 8, 18, 0.36)',
                }}
              >
                <div className="flex items-center justify-between gap-3">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span
                      style={{
                        padding: '4px 8px',
                        borderRadius: 999,
                        border: `1px solid ${badge.border}`,
                        background: badge.bg,
                        color: badge.color,
                        fontSize: 10,
                        letterSpacing: '0.12em',
                        textTransform: 'uppercase',
                        fontFamily: '"IBM Plex Mono", monospace',
                      }}
                    >
                      {event.vendor.replace(/_/g, ' ')}
                    </span>
                    <span className="ops-label text-[0.5rem]">{event.source.replace(/_/g, ' ')}</span>
                  </div>
                  <div className="ops-data text-[0.65rem]" style={{ color: severityColor(event.severity) }}>
                    {event.severity.toUpperCase()}
                  </div>
                </div>

                <p className="mt-2 text-sm text-white/90">
                  {event.host_label} hit by {event.threat_type.replace(/_/g, ' ')}
                </p>
                <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-white/45" style={{ fontFamily: '"IBM Plex Mono", monospace' }}>
                  <span>Layer: {event.layer}</span>
                  <span>Score: {Math.round(event.alert_score * 100)}%</span>
                  <span>Host ID: {event.host_id}</span>
                </div>
              </div>
            );
          })
        ) : (
          <div className="empty-panel !min-h-[220px]">
            Webhook, telemetry, stream, and URL-ingest events will appear here as soon as they hit the live bridge.
          </div>
        )}
      </div>
    </div>
  );
}
