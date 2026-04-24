import { useEffect, useState } from 'react';
import type { Playbook } from '../lib/ops-types';
import { useSimulationStore } from '../store/simulationStore';

export function PlaybooksPage() {
  const { alerts, generatePlaybook, loadPlaybooks, playbooks } = useSimulationStore();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    void loadPlaybooks();
  }, [loadPlaybooks]);

  useEffect(() => {
    if (!selectedId && playbooks.length) {
      setSelectedId(playbooks[0].id);
    }
  }, [playbooks, selectedId]);

  const selected = playbooks.find((playbook) => playbook.id === selectedId) || null;

  return (
    <div className="playbooks-layout">
      <aside className="ops-card p-5">
        <div className="section-heading-row">
          <div>
            <div className="ops-display text-[0.62rem] text-secondary/70">Playbook Library</div>
            <h2 className="panel-title">Generated responses</h2>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            className="ops-chip-button"
            disabled={!alerts.length}
            onClick={() => void generatePlaybook(alerts[0]?.id)}
            type="button"
          >
            Generate from latest alert
          </button>
        </div>

        <div className="panel-scroll mt-5 max-h-[620px] space-y-3 overflow-y-auto pr-1">
          {playbooks.length ? playbooks.map((playbook) => (
            <button
              className={`playbook-list-item ${selectedId === playbook.id ? 'playbook-list-item-active' : ''}`}
              key={playbook.id}
              onClick={() => setSelectedId(playbook.id)}
              type="button"
            >
              <div className="ops-label text-[0.5rem]">{playbook.mitre_id} · {playbook.severity}</div>
              <div className="mt-2 text-sm text-white">{playbook.mitre_name}</div>
              <div className="mt-2 text-xs text-[var(--text-secondary)]">{playbook.incident_summary}</div>
            </button>
          )) : <div className="empty-panel !min-h-[240px]">No playbooks generated yet.</div>}
        </div>
      </aside>

      <section className="ops-card p-5">
        {selected ? (
          <PlaybookDetail playbook={selected} />
        ) : (
          <div className="empty-panel !min-h-[720px]">Select a playbook to inspect the response steps.</div>
        )}
      </section>
    </div>
  );
}

function PlaybookDetail({ playbook }: { playbook: Playbook }) {
  return (
    <div>
      <div className="section-heading-row">
        <div>
          <div className="ops-display text-[0.62rem] text-secondary/70">{playbook.id}</div>
          <h2 className="panel-title">{playbook.mitre_name}</h2>
          <p className="mt-2 max-w-3xl text-sm text-[var(--text-secondary)]">{playbook.incident_summary}</p>
        </div>
        <div className="status-pill status-pill-live">{playbook.severity}</div>
      </div>

      <div className="playbook-steps">
        {playbook.steps.map((step) => (
          <div className="playbook-step" key={step.step_number}>
            <div className="step-number">{step.step_number}</div>
            <div className="step-body">
              <div className="ops-display text-[0.58rem] text-secondary/70">{step.title}</div>
              <p className="mt-2 text-sm text-white">{step.action}</p>
              {step.command ? <code className="step-command">{step.command}</code> : null}
              <div className="step-meta">
                <span>Outcome: {step.expected_outcome}</span>
                <span>Risk: {step.risk_level}</span>
                <span>ETA: {step.estimated_time}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
