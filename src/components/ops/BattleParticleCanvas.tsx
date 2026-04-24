import { useEffect, useRef } from 'react';
import type { ContestEvent } from '../../lib/ops-types';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  life: number;
  maxLife: number;
  size: number;
}

interface BattleParticleCanvasProps {
  events: ContestEvent[];
  nodePositions: Map<number, { x: number; y: number }>;
  width: number;
  height: number;
}

const RED_COLOR = '#ff0044';
const BLUE_COLOR = '#00e5ff';
const FLASH_COLOR = '#ffffff';

/**
 * Canvas overlay for particle collision effects on contested nodes.
 * Uses requestAnimationFrame for high-performance particle rendering.
 */
export default function BattleParticleCanvas({ events, nodePositions, width, height }: BattleParticleCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const rafRef = useRef<number>(0);

  // Spawn particles for contested nodes
  useEffect(() => {
    const activeEvents = events.filter(
      (e) => e.phase !== 'idle' && e.phase !== 'blue_defended' && e.phase !== 'blue_recaptured'
    );

    for (const event of activeEvents) {
      const pos = nodePositions.get(event.node_id);
      if (!pos) continue;

      const numParticles = Math.ceil(event.contest_intensity * 8) + 2;
      for (let i = 0; i < numParticles; i++) {
        const isRed = Math.random() > 0.5;
        const angle = Math.random() * Math.PI * 2;
        const speed = 0.3 + Math.random() * 1.2;
        particlesRef.current.push({
          x: pos.x + (Math.random() - 0.5) * 20,
          y: pos.y + (Math.random() - 0.5) * 20,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          color: isRed ? RED_COLOR : BLUE_COLOR,
          life: 1.0,
          maxLife: 0.6 + Math.random() * 0.8,
          size: 1.5 + Math.random() * 2,
        });
      }
    }

    // Cap max particles
    if (particlesRef.current.length > 500) {
      particlesRef.current = particlesRef.current.slice(-500);
    }
  }, [events, nodePositions]);

  // Animation loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const animate = () => {
      ctx.clearRect(0, 0, width, height);
      const particles = particlesRef.current;
      const alive: Particle[] = [];

      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        p.life -= 0.016 / p.maxLife;
        p.vx *= 0.98;
        p.vy *= 0.98;

        if (p.life <= 0) continue;
        alive.push(p);

        const alpha = Math.max(0, p.life);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = p.color;
        ctx.shadowBlur = p.size * 3;
        ctx.shadowColor = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2);
        ctx.fill();
      }

      // Check for red-blue particle collisions — emit white flash
      for (let i = 0; i < alive.length; i++) {
        for (let j = i + 1; j < alive.length; j++) {
          const a = alive[i];
          const b = alive[j];
          if (a.color === b.color) continue;
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 6) {
            // Flash
            ctx.globalAlpha = 0.8;
            ctx.fillStyle = FLASH_COLOR;
            ctx.shadowBlur = 12;
            ctx.shadowColor = FLASH_COLOR;
            ctx.beginPath();
            ctx.arc((a.x + b.x) / 2, (a.y + b.y) / 2, 3, 0, Math.PI * 2);
            ctx.fill();
            // Kill both
            a.life = 0;
            b.life = 0;
          }
        }
      }

      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;
      particlesRef.current = alive.filter((p) => p.life > 0);
      rafRef.current = requestAnimationFrame(animate);
    };

    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [width, height]);

  return (
    <canvas
      className="absolute inset-0 pointer-events-none"
      height={height}
      ref={canvasRef}
      style={{ zIndex: 10 }}
      width={width}
    />
  );
}
