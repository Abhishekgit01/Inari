# R3F WEB DIAGRAM BACKGROUND — CyberGuardian AI
## Build a fully controllable 3D network background matching the Spline Web Diagram aesthetic
## Scope: CREATE `src/components/WebDiagram3D.tsx` only. Touch nothing else.

---

## ⚠️ HARD RULES

- **DO NOT modify any existing page, component, store, or CSS file**
- **DO NOT install packages other than the ones listed below**
- **DO NOT remove or change the existing D3 network graph** — this 3D scene is the background layer only
- This file is a standalone background component dropped into `Login.tsx`, `Onboarding.tsx`, and the main layout wrapper

---

## INSTALL

```bash
npm install @react-three/fiber @react-three/drei three @types/three
```

---

## WHAT THE SPLINE "WEB DIAGRAM" SCENE LOOKS LIKE (reference)

The scene at `https://my.spline.design/webdiagram-kY7zX8TL7w9Kjisp3ZZeuClq/` is:
- **Deep space black background** (`#000308` — near-black with a hint of blue)
- **20–30 floating 3D spheres** as nodes — varying sizes (small: r=0.3, medium: r=0.6, large: r=1.0)
- Nodes are **translucent/glassy** — dark fill with a glowing rim light in cyan/blue
- **Glowing tube connections** between nearby nodes — thin cylinders with emissive cyan/blue material
- Nodes **slowly float** in 3D space — each with a unique drift direction and speed (very slow, subtle)
- The **whole scene slowly rotates** on the Y axis (one full rotation every ~120 seconds)
- **Particle dust** — hundreds of tiny points floating in the void, slow random drift
- **Post-processing bloom** — glowing nodes bloom outward, edges emit soft light halos
- Some nodes emit a **pulsing ring** outward (like a sonar ping) at random intervals
- The camera is slightly angled, looking at the network from above-left

**In your project this maps directly to the 20 network hosts in the RL environment:**
- DMZ (hosts 0–1): large spheres, positioned top-center
- App Servers (hosts 2–6): medium spheres, middle layer
- DB Servers (hosts 7–9): medium-large spheres with amber rim (high-value targets)
- Workstations (hosts 10–19): small spheres, lower layer
- INTERNET: large glowing sphere at the very top, outside the network

---

## FILE: `src/components/WebDiagram3D.tsx`

```tsx
import { useRef, useMemo, useEffect, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls, Sphere, Tube, Float, Stars, Bloom, EffectComposer } from '@react-three/drei'
import * as THREE from 'three'
import { CatmullRomCurve3, Vector3 } from 'three'

// ─── TYPES ────────────────────────────────────────────────────────────────────

export type NodeStatus = 'clean' | 'compromised' | 'detected' | 'isolated' | 'under_attack'

export interface DiagramNode {
  id: number
  label: string
  type: 'dmz' | 'app_server' | 'db_server' | 'workstation' | 'internet'
  status: NodeStatus
  position: [number, number, number]
}

export interface DiagramEdge {
  source: number
  target: number
  active: boolean
  edgeType: 'normal' | 'attack' | 'lateral' | 'exfil' | 'beacon'
}

export interface WebDiagram3DProps {
  /** Pass live node data from WebSocket. If null, renders default ambient scene. */
  nodes?: DiagramNode[]
  /** Pass live edge data from WebSocket. */
  edges?: DiagramEdge[]
  /** When episode ends, pass 'red' or 'blue'. All nodes flash this color. */
  winner?: 'red' | 'blue' | null
  /** Pointer events passthrough — set false for background use */
  interactive?: boolean
}

// ─── COLOR MAP ────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<NodeStatus, { rim: string; core: string; bloom: number }> = {
  clean:        { rim: '#00e5ff', core: '#0a1628', bloom: 0.4 },
  compromised:  { rim: '#ff0044', core: '#2a0010', bloom: 1.2 },
  detected:     { rim: '#ffcc00', core: '#1a1000', bloom: 0.8 },
  isolated:     { rim: '#334466', core: '#0a0d18', bloom: 0.1 },
  under_attack: { rim: '#ff6600', core: '#1a0800', bloom: 1.5 },
}

const EDGE_COLORS: Record<string, string> = {
  normal:  '#00e5ff',
  attack:  '#ff0044',
  lateral: '#ff6600',
  exfil:   '#ff0044',
  beacon:  '#ffcc00',
}

const TYPE_RADIUS: Record<string, number> = {
  internet:    1.2,
  dmz:         0.9,
  db_server:   0.8,
  app_server:  0.6,
  workstation: 0.4,
}

// ─── DEFAULT NODE POSITIONS (20 hosts + 1 internet) ──────────────────────────
// Spread across 3D space in zone bands matching the RL environment topology
// Units: Three.js world units (roughly: x ∈ [-12,12], y ∈ [-8,8], z ∈ [-6,6])

const DEFAULT_NODES: DiagramNode[] = [
  // Internet (virtual, top-center)
  { id: 20, label: 'INTERNET', type: 'internet',    status: 'clean', position: [0,    9,   0] },
  // DMZ (hosts 0–1) — upper band
  { id: 0,  label: 'DMZ-01',  type: 'dmz',          status: 'clean', position: [-3,   6,   1] },
  { id: 1,  label: 'DMZ-02',  type: 'dmz',          status: 'clean', position: [3,    6,  -1] },
  // App Servers (hosts 2–6) — mid band
  { id: 2,  label: 'APP-01',  type: 'app_server',   status: 'clean', position: [-8,   2,   2] },
  { id: 3,  label: 'APP-02',  type: 'app_server',   status: 'clean', position: [-4,   2.5, -2] },
  { id: 4,  label: 'APP-03',  type: 'app_server',   status: 'clean', position: [0,    3,   3] },
  { id: 5,  label: 'APP-04',  type: 'app_server',   status: 'clean', position: [4,    2.5, -3] },
  { id: 6,  label: 'APP-05',  type: 'app_server',   status: 'clean', position: [8,    2,   1] },
  // DB Servers (hosts 7–9) — center, clustered together (crown jewels)
  { id: 7,  label: 'DB-01',   type: 'db_server',    status: 'clean', position: [-2.5, -1,  2] },
  { id: 8,  label: 'DB-02',   type: 'db_server',    status: 'clean', position: [0,   -1.5, -1] },
  { id: 9,  label: 'DB-03',   type: 'db_server',    status: 'clean', position: [2.5, -1,   2] },
  // Workstations (hosts 10–19) — lower band, spread wide
  { id: 10, label: 'WS-01',   type: 'workstation',  status: 'clean', position: [-11, -5,   3] },
  { id: 11, label: 'WS-02',   type: 'workstation',  status: 'clean', position: [-8,  -5,  -2] },
  { id: 12, label: 'WS-03',   type: 'workstation',  status: 'clean', position: [-5,  -5.5, 4] },
  { id: 13, label: 'WS-04',   type: 'workstation',  status: 'clean', position: [-2,  -6,  -3] },
  { id: 14, label: 'WS-05',   type: 'workstation',  status: 'clean', position: [1,   -5.5, 4] },
  { id: 15, label: 'WS-06',   type: 'workstation',  status: 'clean', position: [4,   -6,  -2] },
  { id: 16, label: 'WS-07',   type: 'workstation',  status: 'clean', position: [6,   -5,   3] },
  { id: 17, label: 'WS-08',   type: 'workstation',  status: 'clean', position: [8,   -5.5,-3] },
  { id: 18, label: 'WS-09',   type: 'workstation',  status: 'clean', position: [10,  -5,   1] },
  { id: 19, label: 'WS-10',   type: 'workstation',  status: 'clean', position: [12,  -4.5,-1] },
]

// Network topology: which nodes are connected
// Mirrors the adjacency from the RL environment
const DEFAULT_EDGES: DiagramEdge[] = [
  // Internet → DMZ
  { source: 20, target: 0,  active: true,  edgeType: 'normal' },
  { source: 20, target: 1,  active: true,  edgeType: 'normal' },
  // DMZ → App Servers
  { source: 0,  target: 2,  active: true,  edgeType: 'normal' },
  { source: 0,  target: 3,  active: true,  edgeType: 'normal' },
  { source: 1,  target: 4,  active: true,  edgeType: 'normal' },
  { source: 1,  target: 5,  active: true,  edgeType: 'normal' },
  { source: 1,  target: 6,  active: true,  edgeType: 'normal' },
  // App Servers → DB Servers
  { source: 2,  target: 7,  active: false, edgeType: 'normal' },
  { source: 3,  target: 7,  active: false, edgeType: 'normal' },
  { source: 4,  target: 8,  active: false, edgeType: 'normal' },
  { source: 5,  target: 8,  active: false, edgeType: 'normal' },
  { source: 6,  target: 9,  active: false, edgeType: 'normal' },
  // App Servers → Workstations
  { source: 2,  target: 10, active: false, edgeType: 'normal' },
  { source: 2,  target: 11, active: false, edgeType: 'normal' },
  { source: 3,  target: 12, active: false, edgeType: 'normal' },
  { source: 3,  target: 13, active: false, edgeType: 'normal' },
  { source: 4,  target: 14, active: false, edgeType: 'normal' },
  { source: 5,  target: 15, active: false, edgeType: 'normal' },
  { source: 5,  target: 16, active: false, edgeType: 'normal' },
  { source: 6,  target: 17, active: false, edgeType: 'normal' },
  { source: 6,  target: 18, active: false, edgeType: 'normal' },
  { source: 6,  target: 19, active: false, edgeType: 'normal' },
  // Workstation cross-connects (lateral movement paths)
  { source: 11, target: 12, active: false, edgeType: 'normal' },
  { source: 13, target: 14, active: false, edgeType: 'normal' },
  { source: 15, target: 16, active: false, edgeType: 'normal' },
  { source: 17, target: 18, active: false, edgeType: 'normal' },
]

// ─── PARTICLE DUST ─────────────────────────────────────────────────────────

function ParticleDust({ count = 400 }: { count?: number }) {
  const pointsRef = useRef<THREE.Points>(null)

  const [positions, speeds] = useMemo(() => {
    const pos = new Float32Array(count * 3)
    const spd = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      pos[i * 3]     = (Math.random() - 0.5) * 30
      pos[i * 3 + 1] = (Math.random() - 0.5) * 25
      pos[i * 3 + 2] = (Math.random() - 0.5) * 20
      spd[i * 3]     = (Math.random() - 0.5) * 0.003
      spd[i * 3 + 1] = (Math.random() - 0.5) * 0.003
      spd[i * 3 + 2] = (Math.random() - 0.5) * 0.003
    }
    return [pos, spd]
  }, [count])

  useFrame(() => {
    if (!pointsRef.current) return
    const pos = pointsRef.current.geometry.attributes.position.array as Float32Array
    for (let i = 0; i < count; i++) {
      pos[i * 3]     += speeds[i * 3]
      pos[i * 3 + 1] += speeds[i * 3 + 1]
      pos[i * 3 + 2] += speeds[i * 3 + 2]
      // wrap around bounds
      if (Math.abs(pos[i * 3])     > 15) speeds[i * 3]     *= -1
      if (Math.abs(pos[i * 3 + 1]) > 12) speeds[i * 3 + 1] *= -1
      if (Math.abs(pos[i * 3 + 2]) > 10) speeds[i * 3 + 2] *= -1
    }
    pointsRef.current.geometry.attributes.position.needsUpdate = true
  })

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={count}
          array={positions}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.04}
        color="#00e5ff"
        transparent
        opacity={0.35}
        sizeAttenuation
      />
    </points>
  )
}

// ─── SINGLE NODE ──────────────────────────────────────────────────────────────

function NetworkNode3D({
  node,
  winner,
}: {
  node: DiagramNode
  winner?: 'red' | 'blue' | null
}) {
  const meshRef = useRef<THREE.Mesh>(null)
  const rimRef  = useRef<THREE.Mesh>(null)
  const [pingScale, setPingScale] = useState(1)

  const status  = winner ? (winner === 'red' ? 'compromised' : 'clean') : node.status
  const colors  = STATUS_COLORS[status]
  const radius  = TYPE_RADIUS[node.type] ?? 0.5

  // Ambient float drift — each node gets unique drift params
  const driftSeed = useMemo(() => ({
    x: (Math.random() - 0.5) * 0.5,
    y: (Math.random() - 0.5) * 0.4,
    z: (Math.random() - 0.5) * 0.4,
    speed: 0.3 + Math.random() * 0.4,
    offset: Math.random() * Math.PI * 2,
  }), [])

  // Random sonar ping every 4–12s
  useEffect(() => {
    const interval = setInterval(() => {
      if (Math.random() > 0.6) {
        setPingScale(1)
        const anim = setInterval(() => {
          setPingScale(prev => {
            if (prev > 3) { clearInterval(anim); return 1 }
            return prev + 0.08
          })
        }, 16)
      }
    }, 4000 + Math.random() * 8000)
    return () => clearInterval(interval)
  }, [])

  useFrame(({ clock }) => {
    if (!meshRef.current) return
    const t = clock.elapsedTime * driftSeed.speed + driftSeed.offset
    meshRef.current.position.x = node.position[0] + Math.sin(t * 0.7)  * driftSeed.x
    meshRef.current.position.y = node.position[1] + Math.sin(t * 0.5)  * driftSeed.y
    meshRef.current.position.z = node.position[2] + Math.cos(t * 0.6)  * driftSeed.z

    // Pulse scale when under attack or compromised
    if (status === 'under_attack' || status === 'compromised') {
      const pulse = 1 + Math.sin(clock.elapsedTime * 4) * 0.06
      meshRef.current.scale.setScalar(pulse)
    } else {
      meshRef.current.scale.setScalar(1)
    }

    // Rim light rotation
    if (rimRef.current) {
      rimRef.current.rotation.z += 0.008
    }
  })

  return (
    <group position={node.position}>
      {/* Main sphere — glassy dark core */}
      <mesh ref={meshRef}>
        <sphereGeometry args={[radius, 32, 32]} />
        <meshPhysicalMaterial
          color={colors.core}
          emissive={colors.rim}
          emissiveIntensity={0.15 + (status === 'compromised' ? 0.4 : 0)}
          transparent
          opacity={0.85}
          roughness={0.05}
          metalness={0.3}
          transmission={0.4}
          thickness={0.5}
        />
      </mesh>

      {/* Rim glow ring — thin torus orbiting the sphere */}
      <mesh ref={rimRef}>
        <torusGeometry args={[radius * 1.15, radius * 0.04, 8, 64]} />
        <meshBasicMaterial
          color={colors.rim}
          transparent
          opacity={status === 'isolated' ? 0.15 : 0.7}
        />
      </mesh>

      {/* Sonar ping ring — expands outward and fades */}
      {pingScale > 1 && pingScale < 3 && (
        <mesh>
          <torusGeometry args={[radius * pingScale, radius * 0.02, 8, 64]} />
          <meshBasicMaterial
            color={colors.rim}
            transparent
            opacity={Math.max(0, 0.6 - (pingScale - 1) / 2)}
          />
        </mesh>
      )}

      {/* DB server amber aura (always on for high-value targets) */}
      {node.type === 'db_server' && status === 'clean' && (
        <mesh>
          <sphereGeometry args={[radius * 1.4, 16, 16]} />
          <meshBasicMaterial color="#ffcc00" transparent opacity={0.04} />
        </mesh>
      )}
    </group>
  )
}

// ─── EDGE / CONNECTION TUBE ────────────────────────────────────────────────

function ConnectionEdge({
  sourcePos,
  targetPos,
  edge,
  winner,
}: {
  sourcePos: [number, number, number]
  targetPos: [number, number, number]
  edge: DiagramEdge
  winner?: 'red' | 'blue' | null
}) {
  const tubeRef = useRef<THREE.Mesh>(null)

  const color = winner
    ? winner === 'red' ? '#ff0044' : '#00e5ff'
    : EDGE_COLORS[edge.edgeType] ?? '#00e5ff'

  const opacity = edge.active ? 0.75 : 0.18

  // Slight curve between nodes (mid-point raised slightly in Y)
  const curve = useMemo(() => {
    const start  = new Vector3(...sourcePos)
    const end    = new Vector3(...targetPos)
    const mid    = start.clone().lerp(end, 0.5)
    mid.y       += 0.8
    return new CatmullRomCurve3([start, mid, end])
  }, [sourcePos, targetPos])

  useFrame(({ clock }) => {
    if (!tubeRef.current) return
    const mat = tubeRef.current.material as THREE.MeshBasicMaterial
    if (edge.active) {
      // Animate opacity for active edges — data flowing feel
      mat.opacity = 0.5 + Math.sin(clock.elapsedTime * 3) * 0.25
    }
  })

  return (
    <mesh ref={tubeRef}>
      <tubeGeometry args={[curve, 12, edge.active ? 0.03 : 0.015, 6, false]} />
      <meshBasicMaterial color={color} transparent opacity={opacity} />
    </mesh>
  )
}

// ─── WINNER FLASH OVERLAY ─────────────────────────────────────────────────

function WinnerFlash({ winner }: { winner: 'red' | 'blue' | null }) {
  const meshRef = useRef<THREE.Mesh>(null)
  const color   = winner === 'red' ? '#ff0044' : '#00e5ff'

  useFrame(({ clock }) => {
    if (!meshRef.current) return
    const mat  = meshRef.current.material as THREE.MeshBasicMaterial
    mat.opacity = 0.08 + Math.sin(clock.elapsedTime * 2) * 0.06
  })

  if (!winner) return null
  return (
    <mesh ref={meshRef} position={[0, 0, -5]}>
      <planeGeometry args={[100, 100]} />
      <meshBasicMaterial color={color} transparent opacity={0.08} />
    </mesh>
  )
}

// ─── SCENE WRAPPER (auto-rotate) ─────────────────────────────────────────────

function Scene({
  nodes,
  edges,
  winner,
}: {
  nodes: DiagramNode[]
  edges: DiagramEdge[]
  winner?: 'red' | 'blue' | null
}) {
  const groupRef = useRef<THREE.Group>(null)

  // Build a quick lookup: id → position
  const posMap = useMemo(() => {
    const map: Record<number, [number, number, number]> = {}
    nodes.forEach(n => { map[n.id] = n.position })
    return map
  }, [nodes])

  useFrame(({ clock }) => {
    if (!groupRef.current) return
    // Slow Y-axis rotation — one full rotation every ~120s
    groupRef.current.rotation.y = clock.elapsedTime * (Math.PI * 2 / 120)
    // Slight X tilt that oscillates (breathing motion)
    groupRef.current.rotation.x = Math.sin(clock.elapsedTime * 0.05) * 0.03
  })

  return (
    <>
      {/* Ambient + point lights */}
      <ambientLight intensity={0.15} color="#001030" />
      <pointLight position={[0, 10, 0]}  intensity={2}  color="#00e5ff" distance={30} />
      <pointLight position={[-10, 0, 5]} intensity={0.8} color="#0040ff" distance={25} />
      <pointLight position={[10, -5, 0]} intensity={0.5} color="#ff0044" distance={20} />

      {/* Particle dust — outside rotating group so it stays ambient */}
      <ParticleDust count={500} />

      {/* Distant stars */}
      <Stars radius={80} depth={40} count={1500} factor={3} saturation={0.3} fade speed={0.3} />

      {/* Winner flash overlay */}
      <WinnerFlash winner={winner ?? null} />

      {/* Rotating network group */}
      <group ref={groupRef}>
        {/* Render edges first (behind nodes) */}
        {edges.map((edge, i) => {
          const sp = posMap[edge.source]
          const tp = posMap[edge.target]
          if (!sp || !tp) return null
          return (
            <ConnectionEdge
              key={`edge-${i}`}
              sourcePos={sp}
              targetPos={tp}
              edge={edge}
              winner={winner}
            />
          )
        })}

        {/* Render nodes */}
        {nodes.map(node => (
          <NetworkNode3D key={`node-${node.id}`} node={node} winner={winner} />
        ))}
      </group>
    </>
  )
}

// ─── MAIN EXPORT ─────────────────────────────────────────────────────────────

export function WebDiagram3D({
  nodes    = DEFAULT_NODES,
  edges    = DEFAULT_EDGES,
  winner   = null,
  interactive = false,
}: WebDiagram3DProps) {
  return (
    <div
      style={{
        position:      'fixed',
        inset:         0,
        zIndex:        0,
        pointerEvents: interactive ? 'auto' : 'none',
        background:    '#000308',
      }}
    >
      <Canvas
        camera={{ position: [0, 4, 22], fov: 55 }}
        gl={{ antialias: true, alpha: false }}
        style={{ width: '100%', height: '100%' }}
      >
        <Scene nodes={nodes} edges={edges} winner={winner} />

        {/* Post-processing bloom — the key to the Spline glow look */}
        <EffectComposer>
          <Bloom
            luminanceThreshold={0.1}
            luminanceSmoothing={0.9}
            intensity={1.4}
            radius={0.85}
          />
        </EffectComposer>

        {/* Only allow orbit if interactive=true (standalone view mode) */}
        {interactive && (
          <OrbitControls
            enableZoom
            enablePan={false}
            minDistance={10}
            maxDistance={35}
            autoRotate={false}
          />
        )}
      </Canvas>

      {/* Subtle dark vignette overlay so page content stays readable */}
      <div
        style={{
          position:    'absolute',
          inset:       0,
          background:  'radial-gradient(ellipse at center, transparent 40%, rgba(0,3,8,0.6) 100%)',
          pointerEvents: 'none',
        }}
      />
    </div>
  )
}

export default WebDiagram3D
```

---

## HOW TO WIRE IT INTO YOUR EXISTING FILES

### In `Login.tsx` (background only):
```tsx
import { WebDiagram3D } from '../components/WebDiagram3D'

// First child of the page, before your login card:
<>
  <WebDiagram3D />   {/* no props needed — renders default ambient scene */}
  <div style={{ position: 'relative', zIndex: 1 }}>
    {/* your existing login card JSX */}
  </div>
</>
```

### In `Onboarding.tsx` (background only):
```tsx
import { WebDiagram3D } from '../components/WebDiagram3D'

<>
  <WebDiagram3D />
  <div style={{ position: 'relative', zIndex: 1 }}>
    {/* your existing onboarding card JSX */}
  </div>
</>
```

### In the main layout wrapper (behind all pages):
```tsx
import { WebDiagram3D } from '../components/WebDiagram3D'
import { useSimStore } from '../store/simStore'  // your existing Zustand store

// Inside your layout component:
const networkNodes = useSimStore(s => s.networkNodes)   // DiagramNode[] from WebSocket
const networkEdges = useSimStore(s => s.networkEdges)   // DiagramEdge[] from WebSocket
const winner       = useSimStore(s => s.episodeWinner)  // 'red' | 'blue' | null

<>
  {/* 3D background — z-index 0, pointer-events none, behind everything */}
  <WebDiagram3D
    nodes={networkNodes?.length ? networkNodes : undefined}
    edges={networkEdges?.length ? networkEdges : undefined}
    winner={winner}
  />

  {/* Your existing sidebar + page content — must have position: relative, z-index >= 1 */}
  <div style={{ position: 'relative', zIndex: 1, display: 'flex', height: '100vh' }}>
    {/* existing sidebar nav */}
    {/* existing page router outlet */}
  </div>
</>
```

### In your Zustand store, map WebSocket `StepMessage` to `DiagramNode[]`:
```typescript
// In your existing WebSocket handler, add this mapping:
const mapStepToNodes = (step: StepMessage): DiagramNode[] =>
  step.network_state.nodes.map(n => ({
    id:       n.id,
    label:    n.label,
    type:     n.type as DiagramNode['type'],
    status:   n.status as NodeStatus,
    position: [n.position_x ?? 0, n.position_y ?? 0, n.position_z ?? 0],
    // If backend doesn't send 3D positions, use DEFAULT_NODES positions as fallback:
    // position: DEFAULT_NODES.find(d => d.id === n.id)?.position ?? [0,0,0]
  }))
```

---

## WINNER STATE — How Node Colors Change

When episode ends with `type: "episode_end"`:

| Winner | All node rim color | Background pulse | Edge colors |
|---|---|---|---|
| `'blue'` | `#00e5ff` (cyan) — Blue wins, network secured | Slow cyan bloom pulse | All edges turn cyan |
| `'red'` | `#ff0044` (red) — Red wins, network breached | Slow red bloom pulse | All edges turn red |
| `null` | Normal per-status colors | No override | Normal per-edge colors |

The `winner` prop overrides all node colors simultaneously — no per-node logic needed in the parent.

---

## PERFORMANCE NOTES

- Canvas renders at device pixel ratio — on retina screens, set `dpr={[1, 1.5]}` on `<Canvas>` if performance drops
- The bloom `EffectComposer` is the heaviest part — if FPS drops below 30, reduce `Bloom intensity` to 0.8 and `count` in `ParticleDust` to 200
- The 3D background does not conflict with the D3 SVG network graph on `/live` — they render on different layers (Three.js WebGL canvas at z-index 0, D3 SVG at z-index 1+)
- Both can be visible simultaneously — the 3D ambient scene provides depth while D3 provides the interactive game state
