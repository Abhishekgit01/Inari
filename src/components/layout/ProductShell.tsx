import { useMemo } from 'react';
import type { ReactNode } from 'react';
import { CardNav, type CardNavItem } from './CardNav';
import { WebDiagram3D, DEFAULT_DIAGRAM_NODES } from '../WebDiagram3D';
import type { DiagramNode, DiagramEdge } from '../WebDiagram3D';
import { useSimulationStore } from '../../store/simulationStore';
import { useAppRouter } from '../../hooks/useAppRouter';



interface ProductShellProps {
  step: number;
  maxSteps: number;
  children: ReactNode;
}

export function ProductShell({
  step,
  maxSteps,
  children,
}: ProductShellProps) {
  const { network, viewMode, setSelectedNodeId } = useSimulationStore();
  const { route } = useAppRouter();

  const handleLogout = () => {
    window.localStorage.removeItem('cg_auth');
    window.location.href = '/login';
  };

  const navItems: CardNavItem[] = [
    {
      label: 'Operations',
      bgColor: 'rgba(3, 13, 26, 0.45)',
      textColor: '#e1e2e7',
      links: [
        { label: 'Live Dashboard', href: '/live', ariaLabel: 'Live Dashboard' },
        { label: 'War Room', href: '/simulation', ariaLabel: 'Simulation War Room' }
      ]
    },
    {
      label: 'Intelligence',
      bgColor: 'rgba(3, 10, 20, 0.45)',
      textColor: '#e1e2e7',
      links: [
        { label: 'Threat Pipeline', href: '/pipeline', ariaLabel: 'Threat Pipeline' },
        { label: 'Attack Graph', href: '/attack-graph', ariaLabel: 'Attack Graph' }
      ]
    },
    {
      label: 'Resources',
      bgColor: 'rgba(5, 10, 20, 0.45)',
      textColor: '#e1e2e7',
      links: [
        { label: 'Playbooks', href: '/playbooks', ariaLabel: 'Playbooks' },
        { label: 'Training', href: '/training', ariaLabel: 'Training' }
      ]
    }
  ];

  const getAlias = () => {
    try {
      const stored = window.localStorage.getItem('cg_auth');
      if (stored) {
        const parsed = JSON.parse(stored);
        return parsed.alias || parsed.operatorId || 'Operator';
      }
    } catch {
      //
    }
    return 'Operator';
  };

  /* ── Compute 3D diagram data from live simulation state ── */
  const diagramNodes = useMemo<DiagramNode[] | undefined>(() => {
    if (!network?.nodes.length) return undefined;
    const fb = new Map(DEFAULT_DIAGRAM_NODES.map((n) => [n.id, n.position]));
    const descMap = new Map(DEFAULT_DIAGRAM_NODES.map((n) => [n.id, n.description]));
    return network.nodes.map((n) => ({
      id: n.id, label: n.label, type: n.type, status: n.status,
      position: fb.get(n.id) || [0, 0, 0],
      description: descMap.get(n.id),
    }));
  }, [network?.nodes]);

  const diagramEdges = useMemo<DiagramEdge[] | undefined>(() => {
    if (!network?.edges.length) return undefined;
    return network.edges.map((e) => ({
      source: e.source, target: e.target, active: e.is_active,
      edgeType: e.edge_type === 'c2' ? 'beacon' : e.edge_type,
    }));
  }, [network?.edges]);

  const diagramWinner: 'red' | 'blue' | null = useMemo(() => {
    if (step < maxSteps) return null;
    return 'blue';
  }, [maxSteps, step]);

  return (
    <div className="product-shell">
      {/* ═══ FULL-SCREEN 3D BACKGROUND (Global) ═══ */}
      <div style={{ position: 'fixed', inset: 0, zIndex: 0 }}>
        <WebDiagram3D
          nodes={diagramNodes}
          edges={diagramEdges}
          winner={diagramWinner}
          viewMode={viewMode}
          onNodeClick={(id) => setSelectedNodeId(id)}
        />
      </div>

      <div style={{ position: 'relative', zIndex: 1, width: '100%', display: 'flex', flexDirection: 'column', pointerEvents: 'none' }}>
        <div style={{ pointerEvents: 'auto' }}>
          <CardNav 
            items={navItems}
            userName={getAlias()}
            onLogout={handleLogout}
          />
        </div>
        <div className="product-main" style={{ marginLeft: 0, pointerEvents: route === '/live' ? 'none' : 'auto' }}>
          <main className="product-content" style={{ marginTop: '6rem', pointerEvents: route === '/live' ? 'none' : 'auto' }}>{children}</main>
        </div>
      </div>
    </div>
  );
}
