import { useMemo, useEffect, useState } from 'react';
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
        { label: 'War Room', href: '/live', ariaLabel: 'Live War Room' },
        { label: 'Docker Nodes', href: '/docker', ariaLabel: 'Docker Container Nodes' },
      ]
    },
    {
      label: 'Intelligence',
      bgColor: 'rgba(3, 10, 20, 0.45)',
      textColor: '#e1e2e7',
      links: [
        { label: 'Threat Pipeline', href: '/pipeline', ariaLabel: 'Threat Pipeline' },
        { label: 'Attack Graph', href: '/attack-graph', ariaLabel: 'Attack Graph' },
        { label: 'URL Security', href: '/url-security', ariaLabel: 'URL Security Analysis' },
      ]
    },
    {
      label: 'Resources',
      bgColor: 'rgba(5, 10, 20, 0.45)',
      textColor: '#e1e2e7',
      links: [
        { label: 'Playbooks', href: '/playbooks', ariaLabel: 'Playbooks' },
        { label: 'Training', href: '/training', ariaLabel: 'Training' },
        { label: 'Integrations', href: '/integrations', ariaLabel: 'Integrations' },
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

  const [discoveredNodes, setDiscoveredNodes] = useState<any[]>([]);

  useEffect(() => {
    let active = true;
    const fetchNodes = async () => {
      try {
        const apiKey = window.localStorage.getItem('cg_enterprise_key') || 'ath_local_admin';
        const res = await fetch('http://127.0.0.1:8001/api/nodes/discover', {
          headers: { 'X-API-Key': apiKey }
        });
        if (res.ok) {
          const data = await res.json();
          if (data && data.nodes && active) setDiscoveredNodes(data.nodes);
        }
      } catch { }
    };
    fetchNodes();
    const int = setInterval(fetchNodes, 1500);
    return () => { active = false; clearInterval(int); };
  }, []);

  /* ── Compute 3D diagram data from live simulation state ── */
  const diagramNodes = useMemo<DiagramNode[] | undefined>(() => {
    const baseNodes = network?.nodes?.length ? network.nodes : DEFAULT_DIAGRAM_NODES;
    const fb = new Map(DEFAULT_DIAGRAM_NODES.map((n) => [n.id, n.position]));
    const descMap = new Map(DEFAULT_DIAGRAM_NODES.map((n) => [n.id, n.description]));
    
    let finalNodes: any[] = [...baseNodes];
    if (discoveredNodes.length > 0) {
      finalNodes = baseNodes.filter(n => n.type === 'internet' || discoveredNodes.some(dn => dn.node_id === n.id));
      
      const missingNodes = discoveredNodes.filter(dn => !baseNodes.some(n => n.id === dn.node_id) && dn.node_id !== 20);
      const newNodes = missingNodes.map((dn): DiagramNode => ({
        id: dn.node_id,
        label: dn.label,
        type: dn.zone as any,
        status: 'clean',
        position: [(dn.node_id % 4) * 8 - 12, (dn.node_id % 3) * 4 - 4, (dn.node_id % 5) * 8 - 16]
      }));
      finalNodes = [...finalNodes, ...newNodes];
    }

    return (finalNodes as any[]).map((n) => {
      const dNode = discoveredNodes.find(dn => dn.node_id === n.id);
      
      // Merge real discovery status with simulation status
      let finalStatus = n.status || 'clean';
      if (dNode && dNode.compromised) {
        finalStatus = 'compromised';
      } else if (!dNode && n.type !== 'internet' && n.id !== 20) {
        // If it's a simulation node but missing from live discovery, it is dead
        finalStatus = 'offline';
      } else if (n.is_offline) {
        finalStatus = 'offline';
      }

      return {
        ...n,
        id: n.id, 
        label: dNode ? dNode.label.toUpperCase() : n.label?.toUpperCase() || '', 
        type: dNode ? dNode.zone : n.type, 
        status: finalStatus,
        position: fb.get(n.id) || n.position || [(n.id % 4) * 8 - 12, (n.id % 3) * 4 - 4, (n.id % 5) * 8 - 16],
        description: descMap.get(n.id) || 'Dynamically provisioned network node interface.',
      };
    }).filter(n => n.status !== 'offline'); // Omit offline nodes so the geometry completely disappears
  }, [network?.nodes, discoveredNodes]);

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
          <main className="product-content" style={{ marginTop: '6rem', pointerEvents: route === '/live' ? 'none' : 'auto' }}>
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
