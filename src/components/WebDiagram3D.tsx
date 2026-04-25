import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Stars, Html } from '@react-three/drei';
import * as THREE from 'three';
import { useSimulationStore } from '../store/simulationStore';

export type NodeStatus = 'clean' | 'compromised' | 'detected' | 'isolated' | 'under_attack';

export interface DiagramNode {
  id: number;
  label: string;
  type: 'dmz' | 'app_server' | 'db_server' | 'workstation' | 'internet';
  status: NodeStatus;
  position: [number, number, number];
  description?: string;
}

export interface DiagramEdge {
  source: number;
  target: number;
  active: boolean;
  edgeType: 'normal' | 'attack' | 'lateral' | 'exfil' | 'beacon';
}

export type ViewMode = '2d' | '3d';

export interface WebDiagram3DProps {
  nodes?: DiagramNode[];
  edges?: DiagramEdge[];
  winner?: 'red' | 'blue' | null;
  interactive?: boolean;
  inline?: boolean;
  viewMode?: ViewMode;
  onNodeClick?: (nodeId: number) => void;
}

const STATUS_COLORS: Record<NodeStatus, { rim: string; core: string; glow: string }> = {
  clean: { rim: '#00e5ff', core: '#09101d', glow: '#0a2a33' },
  compromised: { rim: '#ff0044', core: '#26030f', glow: '#33001a' },
  detected: { rim: '#ffcc00', core: '#221903', glow: '#332800' },
  isolated: { rim: '#5b6b89', core: '#0a1019', glow: '#141a22' },
  under_attack: { rim: '#ff6600', core: '#241003', glow: '#331a00' },
};

// Zone-based colors (used when node is clean — overrides the generic cyan)
const ZONE_NODE_COLORS: Record<DiagramNode['type'], { rim: string; core: string; glow: string }> = {
  internet:    { rim: '#ffffff', core: '#0d1117', glow: '#1a1a2e' },
  dmz:         { rim: '#00b4d8', core: '#051520', glow: '#0a2a38' },
  app_server:  { rim: '#ff9f43', core: '#1a1005', glow: '#2a1a08' },
  db_server:   { rim: '#be50ff', core: '#140820', glow: '#1e0c30' },
  workstation: { rim: '#00ff88', core: '#041a0d', glow: '#082a16' },
};

const ZONE_LEGEND_INFO: { key: DiagramNode['type']; label: string; color: string }[] = [
  { key: 'internet',    label: 'Internet',           color: '#ffffff' },
  { key: 'dmz',         label: 'DMZ — Perimeter',    color: '#00b4d8' },
  { key: 'app_server',  label: 'Application Servers', color: '#ff9f43' },
  { key: 'db_server',   label: 'Databases',           color: '#be50ff' },
  { key: 'workstation', label: 'Workstations',        color: '#00ff88' },
];

const EDGE_COLORS: Record<DiagramEdge['edgeType'], string> = {
  normal: '#00e5ff',
  attack: '#ff0044',
  lateral: '#ff6600',
  exfil: '#ff0044',
  beacon: '#ffcc00',
};

const TYPE_RADIUS: Record<DiagramNode['type'], number> = {
  internet: 1.15,
  dmz: 0.88,
  db_server: 0.78,
  app_server: 0.58,
  workstation: 0.38,
};

export const DEFAULT_DIAGRAM_NODES: DiagramNode[] = [
  { id: 20, label: 'INTERNET', type: 'internet', status: 'clean', position: [0, 9, 0], description: 'External threat surface. All inbound traffic enters through here.\nUnfiltered access makes it the primary attack vector.' },
  { id: 0, label: 'DMZ-01', type: 'dmz', status: 'clean', position: [-3, 6, 1], description: 'Primary demilitarized zone firewall. Filters web traffic.\nFirst line of defense against external probes.' },
  { id: 1, label: 'DMZ-02', type: 'dmz', status: 'clean', position: [3, 6, -1], description: 'Secondary DMZ bastion host. Handles API gateway routing.\nIsolates internal services from public exposure.' },
  { id: 2, label: 'APP-01', type: 'app_server', status: 'clean', position: [-8, 2, 2], description: 'Legacy application server running outdated frameworks.\nKnown vulnerability to remote code execution exploits.' },
  { id: 3, label: 'APP-02', type: 'app_server', status: 'clean', position: [-4, 2.5, -2], description: 'Microservice orchestration node. Manages container workloads.\nPotential lateral movement target via API misconfiguration.' },
  { id: 4, label: 'APP-03', type: 'app_server', status: 'clean', position: [0, 3, 3], description: 'Core business logic server. Processes authentication flows.\nHigh-value target for credential harvesting attacks.' },
  { id: 5, label: 'APP-04', type: 'app_server', status: 'clean', position: [4, 2.5, -3], description: 'Payment processing and transaction validation engine.\nCritical for compliance — any breach triggers immediate escalation.' },
  { id: 6, label: 'APP-05', type: 'app_server', status: 'clean', position: [8, 2, 1], description: 'CI/CD pipeline runner with elevated build permissions.\nSupply chain attack vector if deployment keys are compromised.' },
  { id: 7, label: 'DB-01', type: 'db_server', status: 'clean', position: [-2.5, -1, 2], description: 'Primary customer data store. Contains PII and financial records.\nData exfiltration here causes maximum regulatory impact.' },
  { id: 8, label: 'DB-02', type: 'db_server', status: 'clean', position: [0, -1.5, -1], description: 'Analytics and telemetry database. Stores behavioral metrics.\nCan be leveraged for reconnaissance of user patterns.' },
  { id: 9, label: 'DB-03', type: 'db_server', status: 'clean', position: [2.5, -1, 2], description: 'Configuration and secrets vault. Holds API keys and certs.\nCompromise grants attacker access to all connected services.' },
  { id: 10, label: 'WS-01', type: 'workstation', status: 'clean', position: [-11, -5, 3], description: 'Developer workstation with source code access.\nPhishing target — single compromise can chain to code repos.' },
  { id: 11, label: 'WS-02', type: 'workstation', status: 'clean', position: [-8, -5, -2], description: 'Finance team endpoint. Handles invoice and payroll data.\nTarget for business email compromise and wire fraud.' },
  { id: 12, label: 'WS-03', type: 'workstation', status: 'clean', position: [-5, -5.5, 4], description: 'HR department terminal with employee record access.\nPII exfiltration risk through social engineering vectors.' },
  { id: 13, label: 'WS-04', type: 'workstation', status: 'clean', position: [-2, -6, -3], description: 'Executive assistant workstation. Has calendar and email delegation.\nHigh-value intelligence target for strategic planning access.' },
  { id: 14, label: 'WS-05', type: 'workstation', status: 'clean', position: [1, -5.5, 4], description: 'IT operations console with admin tooling installed.\nDirect path to infrastructure control if credentials leak.' },
  { id: 15, label: 'WS-06', type: 'workstation', status: 'clean', position: [4, -6, -2], description: 'Customer support agent terminal with CRM database access.\nCan be used to pivot into customer-facing systems.' },
  { id: 16, label: 'WS-07', type: 'workstation', status: 'clean', position: [6, -5, 3], description: 'Security analyst SIEM dashboard workstation.\nCompromise can blind the blue team by suppressing alerts.' },
  { id: 17, label: 'WS-08', type: 'workstation', status: 'clean', position: [8, -5.5, -3], description: 'Marketing team endpoint with CMS and social media access.\nBrand impersonation risk if session tokens are stolen.' },
  { id: 18, label: 'WS-09', type: 'workstation', status: 'clean', position: [10, -5, 1], description: 'Legal department terminal with contract and IP access.\nTrade secret exfiltration target for corporate espionage.' },
  { id: 19, label: 'WS-10', type: 'workstation', status: 'clean', position: [12, -4.5, -1], description: 'Remote access gateway for external contractors.\nWeakest link — often lacks MFA and has broad network reach.' },
];

const DEFAULT_EDGES: DiagramEdge[] = [
  { source: 20, target: 0, active: true, edgeType: 'normal' },
  { source: 20, target: 1, active: true, edgeType: 'normal' },
  { source: 0, target: 2, active: true, edgeType: 'normal' },
  { source: 0, target: 3, active: true, edgeType: 'normal' },
  { source: 1, target: 4, active: true, edgeType: 'normal' },
  { source: 1, target: 5, active: true, edgeType: 'normal' },
  { source: 1, target: 6, active: true, edgeType: 'normal' },
  { source: 2, target: 7, active: false, edgeType: 'normal' },
  { source: 3, target: 7, active: false, edgeType: 'normal' },
  { source: 4, target: 8, active: false, edgeType: 'normal' },
  { source: 5, target: 8, active: false, edgeType: 'normal' },
  { source: 6, target: 9, active: false, edgeType: 'normal' },
  { source: 2, target: 10, active: false, edgeType: 'normal' },
  { source: 2, target: 11, active: false, edgeType: 'normal' },
  { source: 3, target: 12, active: false, edgeType: 'normal' },
  { source: 3, target: 13, active: false, edgeType: 'normal' },
  { source: 4, target: 14, active: false, edgeType: 'normal' },
  { source: 5, target: 15, active: false, edgeType: 'normal' },
  { source: 5, target: 16, active: false, edgeType: 'normal' },
  { source: 6, target: 17, active: false, edgeType: 'normal' },
  { source: 6, target: 18, active: false, edgeType: 'normal' },
  { source: 6, target: 19, active: false, edgeType: 'normal' },
  { source: 11, target: 12, active: false, edgeType: 'normal' },
  { source: 13, target: 14, active: false, edgeType: 'normal' },
  { source: 15, target: 16, active: false, edgeType: 'normal' },
  { source: 17, target: 18, active: false, edgeType: 'normal' },
];

function ParticleDust({ count = 320 }: { count?: number }) {
  const pointsRef = useRef<THREE.Points>(null);
  const [positions, speeds] = useMemo(() => {
    const pos = new Float32Array(count * 3);
    const spd = new Float32Array(count * 3);

    for (let index = 0; index < count; index += 1) {
      pos[index * 3] = (Math.random() - 0.5) * 32;
      pos[index * 3 + 1] = (Math.random() - 0.5) * 24;
      pos[index * 3 + 2] = (Math.random() - 0.5) * 20;
      spd[index * 3] = (Math.random() - 0.5) * 0.003;
      spd[index * 3 + 1] = (Math.random() - 0.5) * 0.003;
      spd[index * 3 + 2] = (Math.random() - 0.5) * 0.003;
    }

    return [pos, spd];
  }, [count]);

  useFrame(() => {
    if (!pointsRef.current) {
      return;
    }

    const attribute = pointsRef.current.geometry.attributes.position;
    const array = attribute.array as Float32Array;

    for (let index = 0; index < count; index += 1) {
      array[index * 3] += speeds[index * 3];
      array[index * 3 + 1] += speeds[index * 3 + 1];
      array[index * 3 + 2] += speeds[index * 3 + 2];

      if (Math.abs(array[index * 3]) > 16) {
        speeds[index * 3] *= -1;
      }
      if (Math.abs(array[index * 3 + 1]) > 12) {
        speeds[index * 3 + 1] *= -1;
      }
      if (Math.abs(array[index * 3 + 2]) > 10) {
        speeds[index * 3 + 2] *= -1;
      }
    }

    attribute.needsUpdate = true;
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute args={[positions, 3]} attach="attributes-position" />
      </bufferGeometry>
      <pointsMaterial
        color="#00e5ff"
        opacity={0.28}
        size={0.045}
        sizeAttenuation
        transparent
      />
    </points>
  );
}

// ─── SPELL CLASH COLORS & TYPES ──────────────────────────────────────────────
const ATTACK_BEAM_COLORS: Record<string, { core: string; halo: string }> = {
  exploit: { core: '#00ff44', halo: '#00aa22' },
  lateral_move: { core: '#ff6600', halo: '#cc3300' },
  exfiltrate: { core: '#ff0044', halo: '#aa0022' },
  beacon: { core: '#ffcc00', halo: '#cc9900' },
  scan: { core: '#00ccff', halo: '#0066aa' },
};
const DEFENSE_BEAM = { core: '#ff4400', halo: '#ff8800' };

// Global clash trigger signal so we don't have to drill state down deeply
export const clashSignals = new Map<number, number>(); // targetNodeId -> timestamp

function NetworkNode3D({
  node,
  winner,
  onNodeClick,
}: {
  node: DiagramNode;
  winner?: 'red' | 'blue' | null;
  onNodeClick?: (nodeId: number) => void;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const rimRef = useRef<THREE.Mesh>(null);
  const [pingScale, setPingScale] = useState(1);
  const status: NodeStatus = winner ? (winner === 'red' ? 'compromised' : 'clean') : node.status;
  // Use zone colors when clean, otherwise use status colors
  const colors = status === 'clean' ? (ZONE_NODE_COLORS[node.type] || STATUS_COLORS.clean) : STATUS_COLORS[status];
  const radius = TYPE_RADIUS[node.type] ?? 0.5;
  const zoneColor = ZONE_NODE_COLORS[node.type]?.rim || '#00e5ff';

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (Math.random() > 0.58) {
        setPingScale(1.05);
      }
    }, 4000 + Math.random() * 6000);

    return () => window.clearInterval(interval);
  }, []);

  const clashTime = useRef(0);
  const recoilPhase = useRef(0);

  useFrame(({ clock }) => {
    if (!meshRef.current) {
      return;
    }

    // Check for new clash
    const signal = clashSignals.get(node.id);
    if (signal && signal !== clashTime.current) {
      clashTime.current = signal;
      recoilPhase.current = 30; // Frames of shake
    }

    let shakeOffset = 0;
    if (recoilPhase.current > 0) {
      shakeOffset = (Math.random() - 0.5) * 0.8 * (recoilPhase.current / 30);
      recoilPhase.current--;
    }

    // Only offset during attack shake (local to group)
    meshRef.current.position.x = shakeOffset;
    meshRef.current.position.y = shakeOffset;
    meshRef.current.position.z = 0;

    if (status === 'under_attack' || status === 'compromised') {
      const pulse = 1 + Math.sin(clock.elapsedTime * 5) * 0.12;
      meshRef.current.scale.setScalar(pulse);
    } else {
      meshRef.current.scale.setScalar(1);
    }

    if (rimRef.current) {
      rimRef.current.position.copy(meshRef.current.position);
      rimRef.current.rotation.z += 0.008;
    }

    if (pingScale > 1) {
      setPingScale((current) => (current > 3 ? 1 : current + 0.02));
    }
  });

  return (
    <group position={node.position}>
      <mesh
        ref={meshRef}
        onClick={(e) => { e.stopPropagation(); onNodeClick?.(node.id); }}
        onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = onNodeClick ? 'pointer' : 'default'; }}
        onPointerOut={() => { document.body.style.cursor = 'default'; }}
      >
        <sphereGeometry args={[radius, 32, 32]} />
        <meshPhysicalMaterial
          color={colors.core}
          emissive={colors.rim}
          emissiveIntensity={status === 'compromised' ? 1.2 : status === 'under_attack' ? 0.9 : 0.35}
          metalness={0.34}
          opacity={0.88}
          roughness={0.08}
          thickness={0.5}
          transmission={0.42}
          transparent
        />
      </mesh>

      <mesh ref={rimRef}>
        <torusGeometry args={[radius * 1.14, radius * 0.04, 8, 64]} />
        <meshBasicMaterial
          color={colors.rim}
          opacity={status === 'isolated' ? 0.18 : 0.74}
          transparent
        />
      </mesh>

      <mesh>
        <sphereGeometry args={[radius * 1.6, 16, 16]} />
        <meshBasicMaterial color={colors.glow} opacity={status === 'under_attack' || status === 'compromised' ? 0.45 : 0.22} transparent depthWrite={false} blending={THREE.AdditiveBlending} />
      </mesh>

      {/* Outer glow halo for active threat states */}
      {(status === 'under_attack' || status === 'compromised') && (
        <mesh>
          <sphereGeometry args={[radius * 2.4, 12, 12]} />
          <meshBasicMaterial color={colors.glow} opacity={0.15} transparent depthWrite={false} blending={THREE.AdditiveBlending} />
        </mesh>
      )}

      {/* Point light on active threat nodes */}
      {(status === 'under_attack' || status === 'compromised') && (
        <pointLight
          color={status === 'compromised' ? '#ff0044' : '#ff6600'}
          intensity={1.5}
          distance={6}
          decay={2}
        />
      )}

      {pingScale > 1 && pingScale < 3 ? (
        <mesh>
          <torusGeometry args={[radius * pingScale, radius * 0.02, 8, 64]} />
          <meshBasicMaterial
            color={colors.rim}
            opacity={Math.max(0, 0.56 - (pingScale - 1) / 2)}
            transparent
          />
        </mesh>
      ) : null}

      <Html
        position={[0, radius + 1.2, 0]}
        center
        distanceFactor={18}
        zIndexRange={[100, 0]}
        style={{ pointerEvents: 'none', userSelect: 'none' }}
      >
        <div style={{
          fontFamily: '"Orbitron", "IBM Plex Mono", monospace',
          fontSize: '10px',
          fontWeight: 700,
          color: zoneColor,
          textShadow: `0 0 8px ${zoneColor}, 0 0 16px rgba(0,0,0,0.9)`,
          whiteSpace: 'nowrap',
          letterSpacing: '0.5px',
          textAlign: 'center',
          background: 'rgba(0,0,0,0.6)',
          padding: '2px 6px',
          borderRadius: '4px',
          border: `1px solid ${zoneColor}66`
        }}>
          {node.label}
        </div>
      </Html>
    </group>
  );
}

function ConnectionEdge({
  edge,
  sourcePos,
  targetPos,
  winner,
}: {
  edge: DiagramEdge;
  sourcePos: [number, number, number];
  targetPos: [number, number, number];
  winner?: 'red' | 'blue' | null;
}) {
  const tubeRef = useRef<THREE.Mesh>(null);
  const color = winner ? (winner === 'red' ? '#ff0044' : '#00e5ff') : EDGE_COLORS[edge.edgeType];

  const curve = useMemo(() => {
    const start = new THREE.Vector3(...sourcePos);
    const end = new THREE.Vector3(...targetPos);
    const mid = start.clone().lerp(end, 0.5);
    const dx = end.x - start.x;
    const dz = end.z - start.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    
    // In 2D mode, we don't want lines popping out in Y which causes parallax
    // We'll pass an is3D boolean or just use a small offset. 
    // Since we don't have is3D passed to ConnectionEdge right now, we can check if the camera is angled, 
    // or better, just keep curve mostly flat but offset in X/Z to avoid overlap.
    mid.y += Math.max(0.1, dist * 0.05); // Much smaller Y curve to reduce 2D parallax
    mid.x += dz * 0.08;
    mid.z -= dx * 0.08;
    return new THREE.CatmullRomCurve3([start, mid, end]);
  }, [sourcePos, targetPos]);

  useFrame(({ clock }) => {
    if (!tubeRef.current) {
      return;
    }

    const material = tubeRef.current.material as THREE.MeshBasicMaterial;
    material.opacity = edge.active ? 0.46 + Math.sin(clock.elapsedTime * 3) * 0.2 : 0.14;
  });

  return (
    <mesh ref={tubeRef}>
      <tubeGeometry args={[curve, 20, edge.active ? 0.035 : 0.015, 10, false]} />
      <meshBasicMaterial color={color} opacity={edge.active ? 0.62 : 0.14} transparent />
    </mesh>
  );
}

function WinnerFlash({ winner }: { winner: 'red' | 'blue' | null }) {
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    if (!meshRef.current) {
      return;
    }

    const material = meshRef.current.material as THREE.MeshBasicMaterial;
    material.opacity = 0.05 + Math.sin(clock.elapsedTime * 2) * 0.04;
  });

  if (!winner) {
    return null;
  }

  return (
    <mesh position={[0, 0, -5]} ref={meshRef}>
      <planeGeometry args={[100, 100]} />
      <meshBasicMaterial
        color={winner === 'red' ? '#ff0044' : '#00e5ff'}
        opacity={0.06}
        transparent
      />
    </mesh>
  );
}

// ─── 3D SPELL CLASH EFFECTS (REMOVED — kept simple) ──────────────────────
// Spell clash beams/flashes have been removed for a cleaner look.
// Nodes now indicate attacks via color change + pulse only.

function Scene({
  edges,
  nodes,
  winner,
  viewMode,
  onNodeClick,
}: {
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  winner?: 'red' | 'blue' | null;
  viewMode: ViewMode;
  onNodeClick?: (nodeId: number) => void;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const { latestRedAction, latestBlueAction, network: simNet } = useSimulationStore();

  const posMap = useMemo(
    () =>
      nodes.reduce<Record<number, [number, number, number]>>((accumulator, node) => {
        accumulator[node.id] = node.position;
        return accumulator;
      }, {}),
    [nodes],
  );

  // Simple clash signal for node pulse (no beams)
  useEffect(() => {
    if (latestRedAction && ['exploit', 'lateral_move', 'exfiltrate', 'beacon', 'scan'].includes(latestRedAction.action_name)) {
      clashSignals.set(latestRedAction.target_host_id, Date.now());
    }
  }, [latestRedAction, latestBlueAction, simNet]);

  useFrame(({ clock }) => {
    if (!groupRef.current) {
      return;
    }

    if (viewMode === '2d') {
      groupRef.current.rotation.y = clock.elapsedTime * (Math.PI * 2 / 120);
      groupRef.current.rotation.x = Math.sin(clock.elapsedTime * 0.05) * 0.03;
    }
  });

  return (
    <>
      <ambientLight color="#001030" intensity={0.14} />
      <pointLight color="#00e5ff" distance={32} intensity={1.8} position={[0, 10, 0]} />
      <pointLight color="#0040ff" distance={26} intensity={0.75} position={[-10, 0, 5]} />
      <pointLight color="#ff0044" distance={18} intensity={0.42} position={[10, -5, 0]} />

      <ParticleDust count={460} />
      <Stars count={1300} depth={40} factor={3} fade radius={80} saturation={0.4} speed={0.3} />
      <WinnerFlash winner={winner ?? null} />

      <group ref={groupRef}>
        {edges.map((edge, index) => {
          const source = posMap[edge.source];
          const target = posMap[edge.target];
          if (!source || !target) {
            return null;
          }

          return (
            <ConnectionEdge
              edge={edge}
              key={`edge-${index}`}
              sourcePos={source}
              targetPos={target}
              winner={winner}
            />
          );
        })}

        {nodes.map((node) => (
          <NetworkNode3D key={`node-${node.id}`} node={node} winner={winner} onNodeClick={onNodeClick} />
        ))}

      </group>
    </>
  );
}

export function WebDiagram3D({
  nodes = DEFAULT_DIAGRAM_NODES,
  edges = DEFAULT_EDGES,
  winner = null,
  interactive = false,
  inline = false,
  viewMode = '2d',
  onNodeClick,
}: WebDiagram3DProps) {
  const is3D = viewMode === '3d';
  return (
    <div
      style={{
        position: inline ? 'relative' : 'fixed',
        inset: inline ? undefined : 0,
        width: '100%',
        height: inline ? '100%' : undefined,
        minHeight: inline ? 500 : undefined,
        zIndex: inline ? undefined : 0,
        pointerEvents: is3D || interactive || onNodeClick ? 'auto' : 'none',
        background: '#000308',
        borderRadius: inline ? 16 : undefined,
        overflow: 'hidden',
      }}
    >
      <Canvas
        camera={{ position: is3D ? [0, 8, 18] : [0, 4, 22], fov: is3D ? 60 : 55 }}
        gl={{ alpha: false, antialias: true }}
        style={{ height: '100%', width: '100%' }}
      >
        <Scene edges={edges} nodes={nodes} winner={winner} viewMode={viewMode} onNodeClick={onNodeClick} />
        {viewMode === '3d' ? (
          <OrbitControls
            enablePan
            enableRotate
            enableZoom
            minDistance={8}
            maxDistance={45}
            makeDefault
          />
        ) : null}
      </Canvas>

      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'radial-gradient(ellipse at center, transparent 40%, rgba(0, 3, 8, 0.68) 100%)',
          pointerEvents: 'none',
        }}
      />

      {/* ── Side Legend ──────────────────────────────────────── */}
      <div
        style={{
          position: 'absolute',
          bottom: 16,
          left: 16,
          padding: '14px 16px',
          background: 'rgba(8,14,24,0.88)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 12,
          pointerEvents: 'none',
          backdropFilter: 'blur(8px)',
          zIndex: 10,
        }}
      >
        <p style={{ fontFamily: '"Orbitron", monospace', fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.5)', letterSpacing: 1.5, marginBottom: 10, textTransform: 'uppercase' as const }}>Network Zones</p>
        {ZONE_LEGEND_INFO.map((z) => (
          <div key={z.key} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7 }}>
            <div style={{ width: 10, height: 10, borderRadius: 3, background: z.color, boxShadow: `0 0 6px ${z.color}55` }} />
            <span style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: 10, color: 'rgba(255,255,255,0.6)' }}>{z.label}</span>
          </div>
        ))}
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', marginTop: 8, paddingTop: 8 }}>
          <p style={{ fontFamily: '"Orbitron", monospace', fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.5)', letterSpacing: 1.5, marginBottom: 8, textTransform: 'uppercase' as const }}>Edges</p>
          {[
            { color: '#ff0044', label: 'Attack / Exfil' },
            { color: '#ff6600', label: 'Lateral Move' },
            { color: '#ffcc00', label: 'Beacon' },
            { color: '#00e5ff', label: 'Normal Traffic' },
          ].map((e) => (
            <div key={e.label} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
              <div style={{ width: 16, height: 2, borderRadius: 1, background: e.color }} />
              <span style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: 10, color: 'rgba(255,255,255,0.6)' }}>{e.label}</span>
            </div>
          ))}
        </div>
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', marginTop: 8, paddingTop: 8 }}>
          <p style={{ fontFamily: '"Orbitron", monospace', fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.5)', letterSpacing: 1.5, marginBottom: 8, textTransform: 'uppercase' as const }}>Status</p>
          {[
            { color: '#00ff88', label: 'Clean' },
            { color: '#ff0044', label: 'Compromised' },
            { color: '#ffcc00', label: 'Detected' },
            { color: '#ff6600', label: 'Under Attack' },
            { color: '#5b6b89', label: 'Isolated' },
          ].map((s) => (
            <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: s.color, boxShadow: `0 0 4px ${s.color}55` }} />
              <span style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: 10, color: 'rgba(255,255,255,0.6)' }}>{s.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default WebDiagram3D;
