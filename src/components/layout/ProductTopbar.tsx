import { useEffect, useState } from 'react';
import type { AppRoute } from '../../hooks/useAppRouter';

type ProductRoute = Extract<
  AppRoute,
  '/live' | '/simulation' | '/pipeline' | '/attack-graph' | '/playbooks' | '/training'
>;

const routeTitles: Record<ProductRoute, { kicker: string; title: string }> = {
  '/live': { kicker: 'Primary Demo', title: 'Live War Room' },
  '/simulation': { kicker: 'Agent Duel', title: 'Simulation Viewer' },
  '/pipeline': { kicker: 'Predictive Stack', title: 'Neural Pipeline' },
  '/attack-graph': { kicker: 'Counterfactual', title: 'Attack Graph' },
  '/playbooks': { kicker: 'Response', title: 'Playbook Library' },
  '/training': { kicker: 'Offline Learning', title: 'Training Dashboard' },
};

interface ProductTopbarProps {
  currentRoute: ProductRoute;
  isConnected: boolean;
  step: number;
  maxSteps: number;
  simulationId: string | null;
}

export function ProductTopbar({
  currentRoute,
  isConnected,
  step,
  maxSteps,
  simulationId,
}: ProductTopbarProps) {
  const meta = routeTitles[currentRoute];
  const [utcTime, setUtcTime] = useState(() =>
    new Date().toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
      timeZone: 'UTC',
    }),
  );

  useEffect(() => {
    const timer = window.setInterval(() => {
      setUtcTime(
        new Date().toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
          timeZone: 'UTC',
        }),
      );
    }, 1000);

    return () => window.clearInterval(timer);
  }, []);

  return (
    <header className="top-status-bar">
      <div>
        <div className="ops-display text-[0.58rem] text-secondary/70">INARI AI</div>
        <div className="topbar-title-row">
          <div className="mt-1 text-2xl font-semibold tracking-[0.08em] text-white">{meta.title}</div>
          <div className="ops-label text-[0.52rem] text-secondary/70">{meta.kicker}</div>
        </div>
      </div>

      <div className="topbar-metrics">
        <span className={`status-pill ${isConnected ? 'status-pill-live' : ''}`}>
          SIM {isConnected ? 'ACTIVE' : 'STANDBY'}
        </span>
        <span className="status-pill">EPISODE {simulationId || 'BOOTING'}</span>
        <span className="status-pill">STEP {step}/{maxSteps}</span>
        <span className="status-pill">{utcTime} UTC</span>
      </div>
    </header>
  );
}
