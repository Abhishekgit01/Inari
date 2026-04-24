# SPELL CLASH BATTLE ANIMATION — NODE COMBAT SYSTEM
## Implementation Prompt | CyberGuardian AI Network Graph
## Inspired by: Priori Incantatem — the spell-lock from the images above

---

## THE CONCEPT

What you see in those images is called Priori Incantatem — when two spells
collide mid-air, lock together, and fight for dominance with an explosion of
light, sparks, and fire at the collision point.

Map this EXACTLY to your network graph:

  RED AI (attacker) fires a KILLING CURSE — a venomous green beam
  BLUE AI (defender) fires a SHIELD SPELL — a blazing red/orange beam
  They collide AT THE TARGETED NODE with a white-gold explosion
  Sparks and fire particles spray outward in all directions
  The node SHAKES and RECOILS from the impact
  Winner decided by the RL action outcome — node either falls (red) or holds (stays green)

The result: every single attack step in your simulation looks like a magic duel.
Judges who have never heard of cybersecurity will gasp.

---

## VISUAL BREAKDOWN — FRAME BY FRAME

```
FRAME 1–5 (Attack initiated):
  A thin green beam shoots FROM the attacker node (Red AI position)
  TOWARD the target node. The beam is not straight — it wobbles and crackles
  like electricity, with a bright neon green core and a darker green halo.
  
  Simultaneously: a red/orange counter-beam fires FROM the Blue AI's 
  current monitoring node TOWARD the same target.
  
  Both beams travel fast — ~400ms to reach target.

FRAME 6–10 (Collision / Priori Incantatem):
  The two beams meet AT the target node's center.
  
  At the collision point:
  → BRIGHT WHITE FLASH (fills the node entirely, radius expands then contracts)
  → GOLDEN/AMBER RINGS pulse outward (like a shockwave) — 3 rings, fading out
  → 40–60 SPARK PARTICLES explode outward in all directions
     - Some sparks are GREEN (attacker energy)
     - Some sparks are RED/ORANGE (defender energy)  
     - A few are WHITE/GOLD (the collision energy itself)
  → The node SHAKES violently (translateX oscillation, 8px amplitude, 200ms)
  → The connecting EDGE between nodes flashes bright then dims

FRAME 11–15 (Resolution):
  If RED AGENT WINS (exploit succeeded):
    → Green sparks win — they consume the red sparks
    → Node slowly fills with dark red/crimson
    → Skull icon materializes inside node (scale 0 → 1, elastic easing)
    → Continuous smoldering: 2-3 ember particles float upward from node slowly
    → Node border cracks appear (SVG path animation, hairline fractures)
    
  If BLUE AGENT WINS (defense/detection):
    → Red/orange sparks win — push the green back
    → Green beam recoils — it reverses direction and snaps back to attacker
    → Target node flashes bright cyan/white then settles back to normal
    → Attacker node RECOILS (shake + brief dim)
    → Blue shield shimmer plays on target node (rotating arc, 500ms, then gone)
```

---

## IMPLEMENTATION — FULL CODE

### File: `src/components/visualization/SpellClashEffect.tsx`

This component manages all combat animations. It renders an OVERLAY SVG
on top of your existing D3 network graph, handling all particle effects
without touching the main graph SVG.

```tsx
import React, { useEffect, useRef, useCallback } from 'react';
import * as d3 from 'd3';

// ─── TYPES ────────────────────────────────────────────────────────────────────

interface NodePosition {
  id: number;
  x: number;
  y: number;
}

interface SpellClashEvent {
  id: string;
  attackerNodeId: number;
  defenderNodeId: number;
  targetNodeId: number;
  outcome: 'attack_wins' | 'defense_wins';
  attackType: 'exploit' | 'lateral_move' | 'exfiltrate' | 'beacon' | 'scan';
}

interface SpellClashEffectProps {
  width: number;
  height: number;
  nodePositions: Map<number, NodePosition>;  // current D3 node positions
  clashEvent: SpellClashEvent | null;         // latest combat event from WebSocket
  onClashComplete: () => void;
}

// ─── COLOR MAP ────────────────────────────────────────────────────────────────

const ATTACK_BEAM_COLORS: Record<string, { core: string; halo: string; glow: string }> = {
  exploit:      { core: '#00ff44', halo: '#00aa22', glow: 'rgba(0,255,68,0.4)' },
  lateral_move: { core: '#ff6600', halo: '#cc3300', glow: 'rgba(255,102,0,0.4)' },
  exfiltrate:   { core: '#ff0044', halo: '#aa0022', glow: 'rgba(255,0,68,0.5)' },
  beacon:       { core: '#ffcc00', halo: '#cc9900', glow: 'rgba(255,204,0,0.3)' },
  scan:         { core: '#00ccff', halo: '#0066aa', glow: 'rgba(0,204,255,0.3)' },
};

const DEFENSE_BEAM = {
  core:  '#ff4400',
  halo:  '#ff8800',
  glow:  'rgba(255,68,0,0.5)',
};

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────

export const SpellClashEffect: React.FC<SpellClashEffectProps> = ({
  width,
  height,
  nodePositions,
  clashEvent,
  onClashComplete,
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number>();
  const particlesRef = useRef<Particle[]>([]);
  const activeBeamsRef = useRef<Beam[]>([]);

  // ─── PARTICLE SYSTEM (Canvas) ──────────────────────────────────────────────

  interface Particle {
    x: number; y: number;
    vx: number; vy: number;
    life: number;           // 0.0 → 1.0 (1 = just born, 0 = dead)
    maxLife: number;
    color: string;
    radius: number;
    type: 'spark' | 'ember' | 'ring';
    ringRadius?: number;
  }

  interface Beam {
    x1: number; y1: number;   // start position
    x2: number; y2: number;   // end position (target node)
    progress: number;          // 0.0 → 1.0 (how far beam has traveled)
    color: string;
    glowColor: string;
    width: number;
    type: 'attack' | 'defense';
    wobbleOffset: number[];    // pre-computed wobble curve
  }

  const spawnClashParticles = useCallback((
    cx: number,
    cy: number,
    attackColor: string,
    outcome: 'attack_wins' | 'defense_wins'
  ) => {
    const newParticles: Particle[] = [];

    // 1. Main explosion sparks (40 sparks)
    for (let i = 0; i < 40; i++) {
      const angle = (Math.random() * Math.PI * 2);
      const speed = 2 + Math.random() * 6;
      const isAttackerSpark = Math.random() > 0.45;
      const isGoldSpark = Math.random() > 0.75;

      newParticles.push({
        x: cx, y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1.0,
        maxLife: 0.6 + Math.random() * 0.8,
        color: isGoldSpark
          ? '#ffffff'
          : isAttackerSpark ? attackColor : DEFENSE_BEAM.core,
        radius: 1.5 + Math.random() * 3,
        type: 'spark',
      });
    }

    // 2. Slow-floating embers (10 pieces — drift upward)
    for (let i = 0; i < 10; i++) {
      const angle = -Math.PI * 0.5 + (Math.random() - 0.5) * Math.PI;
      newParticles.push({
        x: cx + (Math.random() - 0.5) * 20,
        y: cy + (Math.random() - 0.5) * 20,
        vx: Math.cos(angle) * (0.3 + Math.random() * 0.8),
        vy: Math.sin(angle) * (0.3 + Math.random() * 0.8) - 0.5,
        life: 1.0,
        maxLife: 1.5 + Math.random() * 1.0,
        color: outcome === 'attack_wins' ? '#ff4400' : '#00aaff',
        radius: 2 + Math.random() * 3,
        type: 'ember',
      });
    }

    // 3. Shockwave rings (3 expanding rings)
    for (let i = 0; i < 3; i++) {
      newParticles.push({
        x: cx, y: cy,
        vx: 0, vy: 0,
        life: 1.0,
        maxLife: 0.4 + i * 0.15,
        color: '#ffffff',
        radius: 0,
        type: 'ring',
        ringRadius: 0,
      });
    }

    particlesRef.current.push(...newParticles);
  }, []);

  // Particle render loop (runs on canvas for performance)
  const renderParticles = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, width, height);

    let hasAlive = false;

    particlesRef.current = particlesRef.current.filter(p => {
      p.life -= 0.016 / p.maxLife;  // deplete based on desired lifetime
      if (p.life <= 0) return false;
      hasAlive = true;

      const alpha = Math.max(0, p.life);

      if (p.type === 'ring') {
        // Expanding shockwave ring
        const ringR = (1 - p.life) * 60;
        ctx.beginPath();
        ctx.arc(p.x, p.y, ringR, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255, 220, 100, ${alpha * 0.6})`;
        ctx.lineWidth = 2 * p.life;
        ctx.stroke();

      } else if (p.type === 'ember') {
        // Floating ember — glowing circle with trail effect
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius * p.life, 0, Math.PI * 2);
        const emberGlow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.radius * 3);
        emberGlow.addColorStop(0, p.color + 'ff');
        emberGlow.addColorStop(1, p.color + '00');
        ctx.fillStyle = emberGlow;
        ctx.fill();
        // Apply gravity + gentle drift
        p.vy -= 0.02;
        p.vx += (Math.random() - 0.5) * 0.1;

      } else {
        // Spark — line from prev to current (motion blur effect)
        const prevX = p.x - p.vx * 3;
        const prevY = p.y - p.vy * 3;

        ctx.beginPath();
        ctx.moveTo(prevX, prevY);
        ctx.lineTo(p.x, p.y);

        // Glow pass
        ctx.strokeStyle = `rgba(255, 255, 255, ${alpha * 0.4})`;
        ctx.lineWidth = p.radius * 2.5;
        ctx.lineCap = 'round';
        ctx.stroke();

        // Core bright pass
        ctx.strokeStyle = p.color + Math.floor(alpha * 255).toString(16).padStart(2, '0');
        ctx.lineWidth = p.radius;
        ctx.stroke();

        // Apply gravity
        p.vy += 0.08;
      }

      // Move particle
      p.x += p.vx;
      p.y += p.vy;

      // Decelerate sparks
      if (p.type === 'spark') {
        p.vx *= 0.93;
        p.vy *= 0.93;
      }

      return true;
    });

    if (hasAlive || activeBeamsRef.current.length > 0) {
      animFrameRef.current = requestAnimationFrame(renderParticles);
    }
  }, [width, height]);

  // ─── SVG BEAM SYSTEM ────────────────────────────────────────────────────────

  const playSpellClash = useCallback((event: SpellClashEvent) => {
    const svg = d3.select(svgRef.current);
    const attacker = nodePositions.get(event.attackerNodeId);
    const defender = nodePositions.get(event.defenderNodeId);
    const target = nodePositions.get(event.targetNodeId);

    if (!target) return;

    const attackColors = ATTACK_BEAM_COLORS[event.attackType] ?? ATTACK_BEAM_COLORS.exploit;
    const cx = target.x;
    const cy = target.y;

    // ── DEFINE SVG FILTERS ──────────────────────────────────────────────────

    const defs = svg.select('defs').empty()
      ? svg.append('defs')
      : svg.select('defs');

    // Glow filter for beams
    const glowId = `spell-glow-${event.id}`;
    const glowFilter = defs.append('filter')
      .attr('id', glowId)
      .attr('x', '-50%').attr('y', '-50%')
      .attr('width', '200%').attr('height', '200%');
    glowFilter.append('feGaussianBlur')
      .attr('in', 'SourceGraphic')
      .attr('stdDeviation', '4')
      .attr('result', 'blur');
    glowFilter.append('feMerge').selectAll('feMergeNode')
      .data(['blur', 'SourceGraphic'])
      .enter().append('feMergeNode')
      .attr('in', d => d);

    // Intense flash filter for collision
    const flashId = `spell-flash-${event.id}`;
    const flashFilter = defs.append('filter').attr('id', flashId)
      .attr('x', '-100%').attr('y', '-100%')
      .attr('width', '300%').attr('height', '300%');
    flashFilter.append('feFlood').attr('flood-color', '#ffffff').attr('flood-opacity', 1).attr('result', 'flood');
    flashFilter.append('feComposite').attr('in', 'flood').attr('in2', 'SourceGraphic').attr('operator', 'in').attr('result', 'coloredSrc');
    flashFilter.append('feGaussianBlur').attr('in', 'coloredSrc').attr('stdDeviation', '8').attr('result', 'blur');
    flashFilter.append('feMerge').selectAll('feMergeNode')
      .data(['blur', 'SourceGraphic'])
      .enter().append('feMergeNode')
      .attr('in', d => d);

    // ── PHASE 1: DRAW ATTACK BEAM ─────────────────────────────────────────

    if (attacker) {
      // Wobble path using quadratic bezier
      const midX = (attacker.x + cx) / 2 + (Math.random() - 0.5) * 40;
      const midY = (attacker.y + cy) / 2 + (Math.random() - 0.5) * 40;
      const pathData = `M ${attacker.x} ${attacker.y} Q ${midX} ${midY} ${cx} ${cy}`;

      // Outer glow beam
      const outerBeam = svg.append('path')
        .attr('d', pathData)
        .attr('fill', 'none')
        .attr('stroke', attackColors.halo)
        .attr('stroke-width', 8)
        .attr('stroke-linecap', 'round')
        .attr('filter', `url(#${glowId})`)
        .attr('opacity', 0);

      // Inner core beam
      const innerBeam = svg.append('path')
        .attr('d', pathData)
        .attr('fill', 'none')
        .attr('stroke', attackColors.core)
        .attr('stroke-width', 3)
        .attr('stroke-linecap', 'round')
        .attr('opacity', 0);

      // Animate beam drawing
      const totalLength = 200; // approximate
      [outerBeam, innerBeam].forEach((beam, i) => {
        const len = (beam.node() as SVGPathElement)?.getTotalLength?.() ?? totalLength;
        beam
          .attr('stroke-dasharray', `${len} ${len}`)
          .attr('stroke-dashoffset', len)
          .attr('opacity', 1)
          .transition().duration(350).ease(d3.easeLinear)
          .attr('stroke-dashoffset', 0)
          .on('end', () => {
            if (i === 1) triggerCollision();
          });
      });

      // Traveling spark along beam path
      for (let s = 0; s < 3; s++) {
        svg.append('circle')
          .attr('r', 4)
          .attr('fill', '#ffffff')
          .attr('filter', `url(#${glowId})`)
          .attr('opacity', 0.9)
          .append('animateMotion')
          .attr('path', pathData)
          .attr('dur', `${0.25 + s * 0.04}s`)
          .attr('begin', `${s * 0.05}s`)
          .attr('fill', 'freeze');
      }

      // Clean up beams after collision
      setTimeout(() => {
        [outerBeam, innerBeam].forEach(b => {
          b.transition().duration(200).attr('opacity', 0).remove();
        });
      }, 600);
    }

    // ── PHASE 2: DRAW DEFENSE BEAM ────────────────────────────────────────

    if (defender && defender.id !== (attacker?.id ?? -1)) {
      const midX2 = (defender.x + cx) / 2 + (Math.random() - 0.5) * 30;
      const midY2 = (defender.y + cy) / 2 + (Math.random() - 0.5) * 30;
      const defPath = `M ${defender.x} ${defender.y} Q ${midX2} ${midY2} ${cx} ${cy}`;

      const defBeamOuter = svg.append('path')
        .attr('d', defPath).attr('fill', 'none')
        .attr('stroke', DEFENSE_BEAM.halo).attr('stroke-width', 6)
        .attr('filter', `url(#${glowId})`).attr('opacity', 0);

      const defBeamInner = svg.append('path')
        .attr('d', defPath).attr('fill', 'none')
        .attr('stroke', DEFENSE_BEAM.core).attr('stroke-width', 2.5)
        .attr('opacity', 0);

      [defBeamOuter, defBeamInner].forEach(b => {
        const len = (b.node() as SVGPathElement)?.getTotalLength?.() ?? 200;
        b.attr('stroke-dasharray', `${len} ${len}`)
         .attr('stroke-dashoffset', len)
         .attr('opacity', 1)
         .transition().duration(320).ease(d3.easeLinear)
         .attr('stroke-dashoffset', 0);
      });

      setTimeout(() => {
        [defBeamOuter, defBeamInner].forEach(b => {
          b.transition().duration(200).attr('opacity', 0).remove();
        });
      }, 600);
    }

    // ── PHASE 3: COLLISION ────────────────────────────────────────────────

    const triggerCollision = () => {
      // Flash circle at impact point
      const flash = svg.append('circle')
        .attr('cx', cx).attr('cy', cy)
        .attr('r', 0)
        .attr('fill', '#ffffff')
        .attr('filter', `url(#${flashId})`)
        .attr('opacity', 1);

      flash.transition().duration(80)
        .attr('r', 35)
        .transition().duration(200)
        .attr('r', 20)
        .attr('fill', event.outcome === 'attack_wins' ? attackColors.core : '#00ddff')
        .attr('opacity', 0.6)
        .transition().duration(300)
        .attr('r', 0)
        .attr('opacity', 0)
        .remove();

      // Clash sparks ring (SVG version — fast radial lines)
      const numRays = 16;
      for (let r = 0; r < numRays; r++) {
        const angle = (r / numRays) * Math.PI * 2;
        const rayLength = 20 + Math.random() * 30;
        const rayLine = svg.append('line')
          .attr('x1', cx).attr('y1', cy)
          .attr('x2', cx + Math.cos(angle) * 8)
          .attr('y2', cy + Math.sin(angle) * 8)
          .attr('stroke', r % 3 === 0 ? '#ffffff' : (r % 2 === 0 ? attackColors.core : DEFENSE_BEAM.core))
          .attr('stroke-width', 1.5 + Math.random())
          .attr('stroke-linecap', 'round')
          .attr('filter', `url(#${glowId})`)
          .attr('opacity', 1);

        rayLine.transition().duration(200 + Math.random() * 150)
          .attr('x2', cx + Math.cos(angle) * rayLength)
          .attr('y2', cy + Math.sin(angle) * rayLength)
          .attr('opacity', 0)
          .remove();
      }

      // ── Spawn canvas particles ─────────────────────────────────────────
      spawnClashParticles(cx, cy, attackColors.core, event.outcome);
      animFrameRef.current = requestAnimationFrame(renderParticles);

      // ── NODE SHAKE ─────────────────────────────────────────────────────
      const targetNodeEl = d3.select(`#node-${event.targetNodeId}`);
      let shakePhase = 0;
      const shakeAmplitudes = [8, -6, 5, -4, 3, -2, 1, 0];
      const shakeInterval = setInterval(() => {
        if (shakePhase >= shakeAmplitudes.length) {
          clearInterval(shakeInterval);
          targetNodeEl.attr('transform', null);
          return;
        }
        targetNodeEl.attr('transform',
          `translate(${shakeAmplitudes[shakePhase]}, ${(Math.random() - 0.5) * 4})`);
        shakePhase++;
      }, 25);

      // ── OUTCOME VISUAL ─────────────────────────────────────────────────
      setTimeout(() => {
        if (event.outcome === 'attack_wins') {
          playNodeFall(svg, cx, cy, attackColors, glowId, event.targetNodeId);
        } else {
          playNodeDefend(svg, cx, cy, glowId, event.attackerNodeId);
        }

        // Clean up filters after animation
        setTimeout(() => {
          defs.select(`#${glowId}`).remove();
          defs.select(`#${flashId}`).remove();
          onClashComplete();
        }, 1500);
      }, 350);
    };

  }, [nodePositions, spawnClashParticles, renderParticles, onClashComplete]);

  // ─── NODE FALL (attack wins) ──────────────────────────────────────────────

  const playNodeFall = (
    svg: d3.Selection<SVGSVGElement | null, unknown, null, undefined>,
    cx: number, cy: number,
    attackColors: { core: string; halo: string; glow: string },
    glowId: string,
    nodeId: number
  ) => {
    // Corruption wave spreading outward
    const corruptRing = svg.append('circle')
      .attr('cx', cx).attr('cy', cy).attr('r', 10)
      .attr('fill', 'none')
      .attr('stroke', attackColors.core)
      .attr('stroke-width', 4)
      .attr('filter', `url(#${glowId})`)
      .attr('opacity', 0.9);

    corruptRing.transition().duration(500)
      .attr('r', 40)
      .attr('stroke-width', 1)
      .attr('opacity', 0)
      .remove();

    // Persistent smoldering embers — float upward from fallen node
    const spawnEmber = () => {
      const ember = svg.append('circle')
        .attr('cx', cx + (Math.random() - 0.5) * 20)
        .attr('cy', cy + 10)
        .attr('r', 2 + Math.random() * 2)
        .attr('fill', Math.random() > 0.5 ? '#ff4400' : '#ff8800')
        .attr('filter', `url(#${glowId})`)
        .attr('opacity', 0.8);

      ember.transition().duration(800 + Math.random() * 400)
        .attr('cy', cy - 30 - Math.random() * 20)
        .attr('cx', cx + (Math.random() - 0.5) * 30)
        .attr('opacity', 0)
        .remove();
    };

    // 6 initial embers
    for (let e = 0; e < 6; e++) {
      setTimeout(spawnEmber, e * 80);
    }

    // Continue spawning embers for 2 seconds
    const emberInterval = setInterval(spawnEmber, 300);
    setTimeout(() => clearInterval(emberInterval), 2000);
  };

  // ─── NODE DEFEND (defense wins) ──────────────────────────────────────────

  const playNodeDefend = (
    svg: d3.Selection<SVGSVGElement | null, unknown, null, undefined>,
    cx: number, cy: number,
    glowId: string,
    attackerNodeId: number
  ) => {
    // Shield shimmer — rotating arc around node
    const shieldArc = svg.append('path')
      .attr('fill', 'none')
      .attr('stroke', '#00e5ff')
      .attr('stroke-width', 3)
      .attr('filter', `url(#${glowId})`)
      .attr('opacity', 0.9);

    let shieldAngle = 0;
    const shieldInterval = setInterval(() => {
      shieldAngle += 15;
      const r = 26;
      const start = (shieldAngle * Math.PI) / 180;
      const end = ((shieldAngle + 200) * Math.PI) / 180;
      const x1 = cx + r * Math.cos(start);
      const y1 = cy + r * Math.sin(start);
      const x2 = cx + r * Math.cos(end);
      const y2 = cy + r * Math.sin(end);
      shieldArc.attr('d', `M ${x1} ${y1} A ${r} ${r} 0 1 1 ${x2} ${y2}`);
    }, 16);

    setTimeout(() => {
      clearInterval(shieldInterval);
      shieldArc.transition().duration(300).attr('opacity', 0).remove();
    }, 600);

    // Deflection — attacker node recoils
    const attackerEl = d3.select(`#node-${attackerNodeId}`);
    const recoilAmounts = [-10, 8, -5, 3, 0];
    recoilAmounts.forEach((amt, i) => {
      setTimeout(() => {
        attackerEl.attr('transform', `translate(${amt}, 0)`);
        if (i === recoilAmounts.length - 1) attackerEl.attr('transform', null);
      }, i * 40);
    });
  };

  // ─── TRIGGER EFFECT WHEN EVENT ARRIVES ───────────────────────────────────

  useEffect(() => {
    if (clashEvent) {
      playSpellClash(clashEvent);
    }
  }, [clashEvent, playSpellClash]);

  // ─── CLEANUP ─────────────────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, []);

  return (
    <>
      {/* Canvas layer — for particle system (performance) */}
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        style={{
          position: 'absolute',
          top: 0, left: 0,
          pointerEvents: 'none',
          zIndex: 10,
        }}
      />
      {/* SVG overlay — for beams and structural effects */}
      <svg
        ref={svgRef}
        width={width}
        height={height}
        style={{
          position: 'absolute',
          top: 0, left: 0,
          pointerEvents: 'none',
          overflow: 'visible',
          zIndex: 11,
        }}
      />
    </>
  );
};

export default SpellClashEffect;
```

---

### File: `src/components/visualization/NodeCombatShell.tsx`

Wrap your existing D3 container with this shell so spell effects overlay correctly:

```tsx
import React, { useState, useCallback } from 'react';
import { SpellClashEffect } from './SpellClashEffect';

// Wrap your existing NetworkTopology component like this:
export const NodeCombatShell: React.FC<{
  width: number;
  height: number;
  nodePositions: Map<number, { id: number; x: number; y: number }>;
  children: React.ReactNode;  // your existing D3 graph
}> = ({ width, height, nodePositions, children }) => {

  const [currentClash, setCurrentClash] = useState<SpellClashEvent | null>(null);

  // Call this from your WebSocket handler when a step arrives
  const triggerClash = useCallback((
    redAction: AgentAction,
    blueAction: AgentAction,
    outcome: 'attack_wins' | 'defense_wins'
  ) => {
    // Only show clash for hostile Red actions
    if (!['exploit','lateral_move','exfiltrate','beacon'].includes(redAction.action_name)) return;

    setCurrentClash({
      id: `clash-${Date.now()}`,
      attackerNodeId: redAction.source_host_id ?? 0,
      defenderNodeId: blueAction.target_host_id ?? 0,
      targetNodeId: redAction.target_host_id,
      outcome,
      attackType: redAction.action_name as any,
    });
  }, []);

  return (
    <div style={{ position: 'relative', width, height }}>
      {/* Your existing D3 network graph */}
      {children}

      {/* Spell clash overlay */}
      <SpellClashEffect
        width={width}
        height={height}
        nodePositions={nodePositions}
        clashEvent={currentClash}
        onClashComplete={() => setCurrentClash(null)}
      />
    </div>
  );
};
```

---

### Bind to WebSocket — in your existing useSimulationSocket hook

```typescript
// In useSimulationSocket.ts, when a step message arrives:

socket.on('step', (msg: StepMessage) => {
  // Determine outcome
  const redWon = msg.info.compromised_hosts.includes(msg.red_action.target_host_id);
  const outcome = redWon ? 'attack_wins' : 'defense_wins';

  // Only fire for hostile actions
  const hostileActions = ['exploit', 'lateral_move', 'exfiltrate', 'beacon'];
  if (hostileActions.includes(msg.red_action.action_name)) {
    combatShellRef.current?.triggerClash(
      msg.red_action,
      msg.blue_action,
      outcome
    );
  }

  // ... rest of your existing state updates
});
```

---

## ATTACK TYPE → SPELL COLOR REFERENCE

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ATTACK TYPE        BEAM COLOR     FEEL
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
exploit            KILLING GREEN  → Like Avada Kedavra
                   #00ff44        → Deadly, fast, sickly bright

lateral_move       DARK ORANGE    → Creeping, spreading
                   #ff6600        → Like fire moving between rooms

exfiltrate         BLOOD RED      → The actual theft happening
                   #ff0044        → Maximum danger, thick beam

beacon             AMBER YELLOW   → Subtle, periodic, eerie
                   #ffcc00        → Slow pulse, not aggressive

scan               ICE CYAN       → Cold, calculated, probing
                   #00ccff        → Thin, fast, searching

DEFENSE BEAM       FIRE ORANGE    → Like Expelliarmus/Protego
                   #ff4400        → Pushes back, warm glow
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## PERFORMANCE NOTES

1. Canvas handles ALL particles — never put particles in SVG (too slow at 60fps)
2. SVG handles ALL beams and structural effects (paths, circles, filters)
3. D3 filters (feGaussianBlur) are created and destroyed per-event — no leaks
4. Node shake uses direct DOM transform, NOT D3 transition (faster, no queue issues)
5. Max simultaneous clashes: 1 (queue subsequent events if needed)
6. On mobile/low-end devices: reduce particle count to 15 sparks, 4 embers

---

## DEMO LINE FOR JUDGES

"Every time the Red Agent attacks a node, you're watching the attack beam —
 green like a killing curse — meet the Blue Agent's defense — red like the
 counter-spell — right at the target. The particle explosion is the AI's
 decision being made. When the green wins, the node falls. When the red wins,
 the shield holds. You're watching two AIs duel in real time."

---

*Spell Clash Animation Prompt v1.0 | CyberGuardian AI | Hack Malenadu '26*
*"Priori Incantatem — when two spells meet, only one can win"*
