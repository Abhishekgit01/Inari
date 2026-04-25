import { useEffect, useState } from 'react';
import type { Playbook } from '../lib/ops-types';
import { useSimulationStore } from '../store/simulationStore';
import { MagicBentoGrid, BentoCard } from '../components/ui/MagicBento';

export function PlaybooksPage() {
  const { alerts, generatePlaybook, loadPlaybooks, playbooks } = useSimulationStore();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => { void loadPlaybooks(); }, [loadPlaybooks]);
  useEffect(() => { if (!selectedId && playbooks.length) setSelectedId(playbooks[0].id); }, [playbooks, selectedId]);

  const selected = playbooks.find((p) => p.id === selectedId) || null;

  return (
    <div className="page-stack">
      <div className="flex items-center justify-between mb-4 px-1">
        <div>
          <div style={{ fontFamily: '"Orbitron", monospace', fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#00e5ff' }}>
            Playbook Library
          </div>
          <h2 className="panel-title">AI-generated incident response</h2>
        </div>
        <button className="ops-chip-button" disabled={!alerts.length} onClick={() => void generatePlaybook(alerts[0]?.id)}>
          Generate from latest alert
        </button>
      </div>

      <MagicBentoGrid className="grid-cols-1 lg:grid-cols-3">
        {/* Sidebar */}
        <BentoCard label="Playbooks" style={{ minHeight: 500 }}>
          <div className="space-y-3 max-h-[600px] overflow-y-auto pr-1">
            {playbooks.length ? playbooks.map((p) => (
              <button
                className={`playbook-list-item w-full text-left ${selectedId === p.id ? 'playbook-list-item-active' : ''}`}
                key={p.id}
                onClick={() => setSelectedId(p.id)}
                type="button"
              >
                <div className="ops-label text-[0.5rem]">{p.mitre_id} · {p.severity}</div>
                <div className="mt-2 text-sm text-white">{p.mitre_name}</div>
                <div className="mt-2 text-xs text-[var(--text-secondary)]">{p.incident_summary}</div>
              </button>
            )) : <div className="empty-panel !min-h-[240px]">No playbooks generated yet.</div>}
          </div>
        </BentoCard>

        {/* Detail */}
        <BentoCard label="Response Plan" className="lg:col-span-2" style={{ minHeight: 500 }}>
          {selected ? <PlaybookDetail playbook={selected} /> : (
            <div className="empty-panel !min-h-[400px]">Select a playbook to inspect the response steps.</div>
          )}
        </BentoCard>
      </MagicBentoGrid>
    </div>
  );
}

function PlaybookDetail({ playbook }: { playbook: Playbook }) {
  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-4">
        <div>
          <div className="ops-display text-[0.62rem] text-secondary/70">{playbook.id}</div>
          <h2 className="panel-title">{playbook.mitre_name}</h2>
          <p className="mt-2 max-w-3xl text-sm text-[var(--text-secondary)]">{playbook.incident_summary}</p>
        </div>
        <div className="status-pill status-pill-live">{playbook.severity}</div>
      </div>

      <div className="playbook-steps">
        {playbook.steps.map((s) => (
          <div className="playbook-step" key={s.step_number}>
            <div className="step-number">{s.step_number}</div>
            <div className="step-body">
              <div className="ops-display text-[0.58rem] text-secondary/70">{s.title}</div>
              <p className="mt-2 text-sm text-white">{s.action}</p>
              {s.command ? <code className="step-command">{s.command}</code> : null}
              <div className="step-meta">
                <span>Outcome: {s.expected_outcome}</span>
                <span>Risk: {s.risk_level}</span>
                <span>ETA: {s.estimated_time}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
