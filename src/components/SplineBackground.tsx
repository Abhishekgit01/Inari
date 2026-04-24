import { useEffect, useRef, useState } from 'react';

/* ─── Animated Canvas Fallback ─── */

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  baseRadius: number;
  color: string;
  pulseSpeed: number;
  pulsePhase: number;
}

function createParticles(w: number, h: number, count: number): Particle[] {
  const colors = [
    'rgba(0, 229, 255, 0.8)',
    'rgba(0, 153, 170, 0.7)',
    'rgba(0, 255, 200, 0.6)',
    'rgba(80, 200, 255, 0.7)',
    'rgba(0, 180, 220, 0.65)',
  ];
  return Array.from({ length: count }, (_, i) => ({
    x: Math.random() * w,
    y: Math.random() * h,
    vx: (Math.random() - 0.5) * 0.3,
    vy: (Math.random() - 0.5) * 0.3,
    radius: 1.5 + Math.random() * 2.5,
    baseRadius: 1.5 + Math.random() * 2.5,
    color: colors[i % colors.length],
    pulseSpeed: 0.5 + Math.random() * 1.5,
    pulsePhase: Math.random() * Math.PI * 2,
  }));
}

function InteractiveCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const particlesRef = useRef<Particle[]>([]);
  const sizeRef = useRef({ w: 0, h: 0 });
  const mouseRef = useRef({ x: -9999, y: -9999 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = window.innerWidth;
      const h = window.innerHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      sizeRef.current = { w, h };
      particlesRef.current = createParticles(w, h, Math.min(100, Math.floor((w * h) / 10000)));
    };

    const onMouse = (e: MouseEvent) => {
      mouseRef.current = { x: e.clientX, y: e.clientY };
    };
    const onMouseLeave = () => {
      mouseRef.current = { x: -9999, y: -9999 };
    };

    resize();
    window.addEventListener('resize', resize);
    window.addEventListener('mousemove', onMouse);
    window.addEventListener('mouseleave', onMouseLeave);
    const connectionDistance = 170;
    const mouseInfluenceRadius = 200;

    const draw = (time: number) => {
      const { w, h } = sizeRef.current;
      const particles = particlesRef.current;
      const t = time * 0.001;
      const mx = mouseRef.current.x;
      const my = mouseRef.current.y;

      const grad = ctx.createLinearGradient(0, 0, w, h);
      grad.addColorStop(0, '#03050f');
      grad.addColorStop(0.5, '#050a1a');
      grad.addColorStop(1, '#03050f');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      for (const p of particles) {
        /* Mouse repulsion — particles drift away from cursor */
        const dmx = p.x - mx;
        const dmy = p.y - my;
        const mouseDist = Math.sqrt(dmx * dmx + dmy * dmy);
        if (mouseDist < mouseInfluenceRadius && mouseDist > 0) {
          const force = (1 - mouseDist / mouseInfluenceRadius) * 0.6;
          p.x += (dmx / mouseDist) * force;
          p.y += (dmy / mouseDist) * force;
        }

        p.x += p.vx;
        p.y += p.vy;
        if (p.x < -10) p.x = w + 10;
        if (p.x > w + 10) p.x = -10;
        if (p.y < -10) p.y = h + 10;
        if (p.y > h + 10) p.y = -10;
        p.radius = p.baseRadius + Math.sin(t * p.pulseSpeed + p.pulsePhase) * 0.8;
      }

      /* Connection lines */
      ctx.lineWidth = 0.5;
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < connectionDistance) {
            const alpha = (1 - dist / connectionDistance) * 0.18;
            ctx.strokeStyle = `rgba(0, 229, 255, ${alpha})`;
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.stroke();
          }
        }
      }

      /* Mouse glow halo */
      if (mx > 0 && my > 0) {
        const haloGrad = ctx.createRadialGradient(mx, my, 0, mx, my, mouseInfluenceRadius);
        haloGrad.addColorStop(0, 'rgba(0, 229, 255, 0.06)');
        haloGrad.addColorStop(0.5, 'rgba(0, 229, 255, 0.02)');
        haloGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = haloGrad;
        ctx.beginPath();
        ctx.arc(mx, my, mouseInfluenceRadius, 0, Math.PI * 2);
        ctx.fill();

        /* Lines from mouse to nearby particles */
        for (const p of particles) {
          const dmx = p.x - mx;
          const dmy = p.y - my;
          const dist = Math.sqrt(dmx * dmx + dmy * dmy);
          if (dist < mouseInfluenceRadius) {
            const alpha = (1 - dist / mouseInfluenceRadius) * 0.12;
            ctx.strokeStyle = `rgba(0, 229, 255, ${alpha})`;
            ctx.lineWidth = 0.4;
            ctx.beginPath();
            ctx.moveTo(mx, my);
            ctx.lineTo(p.x, p.y);
            ctx.stroke();
          }
        }
      }

      /* Particle dots + glow */
      for (const p of particles) {
        const glowGrad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.radius * 4);
        glowGrad.addColorStop(0, p.color.replace(/[\d.]+\)$/, '0.14'));
        glowGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = glowGrad;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius * 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fill();
      }

      /* Scan line */
      const scanY = ((t * 40) % (h + 60)) - 30;
      const scanGrad = ctx.createLinearGradient(0, scanY - 30, 0, scanY + 30);
      scanGrad.addColorStop(0, 'rgba(0, 229, 255, 0)');
      scanGrad.addColorStop(0.5, 'rgba(0, 229, 255, 0.018)');
      scanGrad.addColorStop(1, 'rgba(0, 229, 255, 0)');
      ctx.fillStyle = scanGrad;
      ctx.fillRect(0, scanY - 30, w, 60);

      animRef.current = requestAnimationFrame(draw);
    };

    animRef.current = requestAnimationFrame(draw);
    return () => {
      window.removeEventListener('resize', resize);
      window.removeEventListener('mousemove', onMouse);
      window.removeEventListener('mouseleave', onMouseLeave);
      cancelAnimationFrame(animRef.current);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
    />
  );
}

/* ─── Public Component ─── */

interface SplineBackgroundProps {
  scene?: string;
  overlay?: string;
  showFallback?: boolean;
}

export function SplineBackground({
  scene,
  overlay = 'linear-gradient(135deg, rgba(3, 5, 15, 0.72) 0%, rgba(7, 13, 26, 0.65) 100%)',
}: SplineBackgroundProps) {
  const [splineReady, setSplineReady] = useState(false);
  
  // Inject the spline-viewer script natively
  useEffect(() => {
    if (scene && !document.querySelector('script[src="https://unpkg.com/@splinetool/viewer@1.12.85/build/spline-viewer.js"]')) {
      const script = document.createElement('script');
      script.type = 'module';
      script.src = 'https://unpkg.com/@splinetool/viewer@1.12.85/build/spline-viewer.js';
      document.head.appendChild(script);
    }
    // Since the web component doesn't have an easily trappable onLoad in React, we'll assume it's ready quickly
    // or we can just fade it in immediately.
    setTimeout(() => setSplineReady(true), 500);
  }, [scene]);

  const canvasFallback = <InteractiveCanvas />;

  return (
    <div
      className="spline-bg"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 0,
        overflow: 'hidden',
        // Removed pointerEvents: 'none' to allow interactions
      }}
    >
      {scene ? (
        <div style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          opacity: splineReady ? 1 : 0,
          transition: 'opacity 800ms ease',
        }}>
          {/* @ts-expect-error spline-viewer is a web component not in React TS types */}
          <spline-viewer url={scene} style={{ width: '100%', height: '100%' }}></spline-viewer>
        </div>
      ) : (
        canvasFallback
      )}

      {/* Overlay gradient - Make sure it doesn't block clicks from reaching the Spline! */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: overlay,
          pointerEvents: 'none',
        }}
      />
    </div>
  );
}
