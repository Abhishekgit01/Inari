import { useSimulationStore } from '../store/simulationStore';

export function AttackGraphPage() {
  const { pipeline } = useSimulationStore();
  const nodes = pipeline?.attack_graph_nodes || [];
  const edges = pipeline?.attack_graph_edges || [];
  const width = 980;
  const height = 520;

  return (
    <div className="attack-graph-layout">
      <section className="ops-card p-5">
        <div className="section-heading-row">
          <div>
            <div className="ops-display text-[0.62rem] text-secondary/70">Counterfactual Attack Graph</div>
            <h2 className="panel-title">Critical path to crown-jewel databases</h2>
          </div>
        </div>

        {nodes.length ? (
          <svg className="mt-4 h-[520px] w-full" preserveAspectRatio="xMidYMid meet" viewBox={`0 0 ${width} ${height}`}>
            {edges.map((edge, index) => {
              const source = nodes.find((node) => node.id === edge.source);
              const target = nodes.find((node) => node.id === edge.target);
              if (!source || !target) {
                return null;
              }
              return (
                <g key={`${edge.source}-${edge.target}-${index}`}>
                  <line
                    stroke={edge.is_critical_path ? '#ff335f' : edge.is_predicted ? '#ffcc00' : '#14d1ff'}
                    strokeDasharray={edge.is_predicted ? '8 8' : edge.success ? '' : '4 8'}
                    strokeWidth={edge.is_critical_path ? 4 : 2}
                    x1={source.x || 80}
                    x2={target.x || 80}
                    y1={source.y || 80}
                    y2={target.y || 80}
                  />
                  <text className="ops-label" fill="rgba(255,255,255,0.65)" fontSize="10" x={((source.x || 80) + (target.x || 80)) / 2} y={((source.y || 80) + (target.y || 80)) / 2 - 8}>
                    {edge.action_type}
                  </text>
                </g>
              );
            })}

            {nodes.map((node) => (
              <g key={node.id} transform={`translate(${node.x || 80}, ${node.y || 80})`}>
                <circle
                  cx="0"
                  cy="0"
                  fill={node.compromised ? '#2a0711' : node.is_critical_target ? '#1c1b10' : '#0d1628'}
                  r={node.is_critical_target ? 22 : 18}
                  stroke={node.compromised ? '#ff335f' : node.is_critical_target ? '#ffcc00' : '#14d1ff'}
                  strokeWidth={node.is_critical_target ? 3 : 2}
                />
                <text className="ops-data" fill="white" fontSize="11" textAnchor="middle" y="4">{node.label}</text>
              </g>
            ))}
          </svg>
        ) : (
          <div className="empty-panel !min-h-[520px] mt-4">Attack graph data becomes available once the pipeline emits its first graph snapshot.</div>
        )}
      </section>

      <aside className="ops-card p-5">
        <div className="ops-display text-[0.62rem] text-secondary/70">If We Don&apos;t Act</div>
        <div className="metric-stack mt-5">
          <ThreatCountdown label="Steps to DB breach" value={pipeline?.steps_to_db_breach ?? 0} suffix="steps" />
          <ThreatCountdown label="Data at risk" value={pipeline?.data_at_risk_gb ?? 0} suffix="GB" />
          <ThreatCountdown label="Critical path length" value={pipeline?.critical_path.length ?? 0} suffix="nodes" />
        </div>
      </aside>
    </div>
  );
}

function ThreatCountdown({ label, value, suffix }: { label: string; value: number; suffix: string }) {
  return (
    <div className="countdown-card">
      <div className="ops-label text-[0.52rem]">{label}</div>
      <div className="ops-data mt-2 text-4xl text-white">{value}{suffix ? <span className="ml-2 text-base text-secondary/80">{suffix}</span> : null}</div>
    </div>
  );
}
