/**
 * MagicBento — GSAP-powered bento grid with spotlight, particles, tilt, and border glow.
 *
 * This version supports **two** usage modes:
 *   1. Static cards — pass `cards` prop (title/description/label array)
 *   2. Children mode — wrap any React content with `<BentoCard>` inside `<MagicBentoGrid>`
 *
 * The Children mode is used by the product pages to mount real live components
 * (SocTerminal, BreachCountdown, HyperAgentPanel, etc.) inside the glowing cards.
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from 'react';
import { gsap } from 'gsap';

/* ── Constants ────────────────────────────────────────────────────────── */
const DEFAULT_PARTICLE_COUNT = 10;
const DEFAULT_SPOTLIGHT_RADIUS = 260;
const DEFAULT_GLOW_COLOR = '20, 209, 255';
const MOBILE_BREAKPOINT = 768;

/* ── Shared CSS (injected once) ───────────────────────────────────────── */
const BENTO_STYLES = (glowColor: string) => `
  .bento-section {
    --glow-x: 50%;
    --glow-y: 50%;
    --glow-intensity: 0;
    --glow-radius: 220px;
    --glow-color: ${glowColor};
    --border-color: rgba(255,255,255,0.08);
    --background-dark: rgba(6, 14, 24, 0.9);
    --white: hsl(0, 0%, 100%);
  }
  .card--border-glow::after {
    content: '';
    position: absolute;
    inset: 0;
    padding: 1px;
    background: radial-gradient(var(--glow-radius) circle at var(--glow-x) var(--glow-y),
      rgba(${glowColor}, calc(var(--glow-intensity) * 0.7)) 0%,
      rgba(${glowColor}, calc(var(--glow-intensity) * 0.28)) 28%,
      transparent 62%);
    border-radius: inherit;
    -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
    -webkit-mask-composite: xor;
    mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
    mask-composite: exclude;
    pointer-events: none;
    z-index: 1;
  }
  .text-clamp-1 {
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 1;
    line-clamp: 1;
    overflow: hidden;
  }
  .text-clamp-2 {
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    overflow: hidden;
  }
`;

/* ── Helpers ──────────────────────────────────────────────────────────── */
const createParticleElement = (x: number, y: number, color = DEFAULT_GLOW_COLOR) => {
  const el = document.createElement('div');
  el.className = 'particle';
  el.style.cssText = `
    position: absolute;
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background: rgba(${color}, 1);
    box-shadow: 0 0 8px rgba(${color}, 0.8);
    pointer-events: none;
    z-index: 100;
    left: ${x}px;
    top: ${y}px;
  `;
  return el;
};

const calculateSpotlightValues = (radius: number) => ({
  proximity: radius * 0.5,
  fadeDistance: radius * 0.85,
});

const updateCardGlowProperties = (
  card: HTMLElement,
  mouseX: number,
  mouseY: number,
  glow: number,
  radius: number,
) => {
  const rect = card.getBoundingClientRect();
  const relativeX = ((mouseX - rect.left) / rect.width) * 100;
  const relativeY = ((mouseY - rect.top) / rect.height) * 100;
  card.style.setProperty('--glow-x', `${relativeX}%`);
  card.style.setProperty('--glow-y', `${relativeY}%`);
  card.style.setProperty('--glow-intensity', glow.toString());
  card.style.setProperty('--glow-radius', `${radius}px`);
};

function useMobileDetection() {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth <= MOBILE_BREAKPOINT);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);
  return isMobile;
}

/* ── ParticleCard ─────────────────────────────────────────────────────── */
function ParticleCard({
  children,
  className = '',
  disableAnimations = false,
  style,
  particleCount = DEFAULT_PARTICLE_COUNT,
  glowColor = DEFAULT_GLOW_COLOR,
  enableTilt = true,
  clickEffect = false,
  enableMagnetism = false,
}: {
  children: ReactNode;
  className?: string;
  disableAnimations?: boolean;
  style?: CSSProperties;
  particleCount?: number;
  glowColor?: string;
  enableTilt?: boolean;
  clickEffect?: boolean;
  enableMagnetism?: boolean;
}) {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const particlesRef = useRef<HTMLDivElement[]>([]);
  const timeoutsRef = useRef<number[]>([]);
  const isHoveredRef = useRef(false);
  const memoizedParticles = useRef<HTMLDivElement[]>([]);
  const particlesInitialized = useRef(false);
  const magnetismAnimationRef = useRef<gsap.core.Tween | null>(null);

  const initializeParticles = useCallback(() => {
    if (particlesInitialized.current || !cardRef.current) return;
    const { width, height } = cardRef.current.getBoundingClientRect();
    memoizedParticles.current = Array.from({ length: particleCount }, () =>
      createParticleElement(Math.random() * width, Math.random() * height, glowColor),
    );
    particlesInitialized.current = true;
  }, [particleCount, glowColor]);

  const clearAllParticles = useCallback(() => {
    timeoutsRef.current.forEach(window.clearTimeout);
    timeoutsRef.current = [];
    magnetismAnimationRef.current?.kill();
    particlesRef.current.forEach((p) => {
      gsap.to(p, {
        scale: 0,
        opacity: 0,
        duration: 0.25,
        ease: 'back.in(1.7)',
        onComplete: () => p.parentNode?.removeChild(p),
      });
    });
    particlesRef.current = [];
  }, []);

  const animateParticles = useCallback(() => {
    if (!cardRef.current || !isHoveredRef.current) return;
    if (!particlesInitialized.current) initializeParticles();
    memoizedParticles.current.forEach((particle, index) => {
      const tid = window.setTimeout(() => {
        if (!isHoveredRef.current || !cardRef.current) return;
        const clone = particle.cloneNode(true) as HTMLDivElement;
        cardRef.current.appendChild(clone);
        particlesRef.current.push(clone);
        gsap.fromTo(clone, { scale: 0, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.3, ease: 'back.out(1.7)' });
        gsap.to(clone, {
          x: (Math.random() - 0.5) * 100,
          y: (Math.random() - 0.5) * 100,
          rotation: Math.random() * 360,
          duration: 2 + Math.random() * 2,
          ease: 'none',
          repeat: -1,
          yoyo: true,
        });
        gsap.to(clone, { opacity: 0.3, duration: 1.6, ease: 'power2.inOut', repeat: -1, yoyo: true });
      }, index * 80);
      timeoutsRef.current.push(tid);
    });
  }, [initializeParticles]);

  useEffect(() => {
    if (disableAnimations || !cardRef.current) return;
    const el = cardRef.current;
    const onEnter = () => { isHoveredRef.current = true; animateParticles(); };
    const onLeave = () => {
      isHoveredRef.current = false;
      clearAllParticles();
      gsap.to(el, { rotateX: 0, rotateY: 0, x: 0, y: 0, duration: 0.3, ease: 'power2.out' });
    };
    const onMove = (e: MouseEvent) => {
      const rect = el.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const cx = rect.width / 2;
      const cy = rect.height / 2;
      if (enableTilt) {
        gsap.to(el, { rotateX: ((y - cy) / cy) * -8, rotateY: ((x - cx) / cx) * 8, duration: 0.12, ease: 'power2.out', transformPerspective: 1000 });
      }
      if (enableMagnetism) {
        magnetismAnimationRef.current = gsap.to(el, { x: (x - cx) * 0.04, y: (y - cy) * 0.04, duration: 0.25, ease: 'power2.out' });
      }
    };
    const onClick = (e: MouseEvent) => {
      if (!clickEffect) return;
      const rect = el.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const maxD = Math.max(Math.hypot(x, y), Math.hypot(x - rect.width, y), Math.hypot(x, y - rect.height), Math.hypot(x - rect.width, y - rect.height));
      const ripple = document.createElement('div');
      ripple.style.cssText = `position:absolute;width:${maxD * 2}px;height:${maxD * 2}px;border-radius:50%;background:radial-gradient(circle,rgba(${glowColor},0.35) 0%,rgba(${glowColor},0.16) 34%,transparent 70%);left:${x - maxD}px;top:${y - maxD}px;pointer-events:none;z-index:1000;`;
      el.appendChild(ripple);
      gsap.fromTo(ripple, { scale: 0, opacity: 1 }, { scale: 1, opacity: 0, duration: 0.8, ease: 'power2.out', onComplete: () => ripple.remove() });
    };
    el.addEventListener('mouseenter', onEnter);
    el.addEventListener('mouseleave', onLeave);
    el.addEventListener('mousemove', onMove);
    el.addEventListener('click', onClick);
    return () => {
      isHoveredRef.current = false;
      el.removeEventListener('mouseenter', onEnter);
      el.removeEventListener('mouseleave', onLeave);
      el.removeEventListener('mousemove', onMove);
      el.removeEventListener('click', onClick);
      clearAllParticles();
    };
  }, [animateParticles, clearAllParticles, clickEffect, disableAnimations, enableMagnetism, enableTilt, glowColor]);

  return (
    <div ref={cardRef} className={`${className} relative overflow-hidden`} style={{ ...style, position: 'relative', overflow: 'hidden' }}>
      {children}
    </div>
  );
}

/* ── GlobalSpotlight ──────────────────────────────────────────────────── */
function GlobalSpotlight({
  gridRef,
  disableAnimations = false,
  enabled = true,
  spotlightRadius = DEFAULT_SPOTLIGHT_RADIUS,
  glowColor = DEFAULT_GLOW_COLOR,
}: {
  gridRef: RefObject<HTMLDivElement | null>;
  disableAnimations?: boolean;
  enabled?: boolean;
  spotlightRadius?: number;
  glowColor?: string;
}) {
  const spotlightRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (disableAnimations || !gridRef.current || !enabled) return;
    const spotlight = document.createElement('div');
    spotlight.style.cssText = `position:fixed;width:760px;height:760px;border-radius:50%;pointer-events:none;background:radial-gradient(circle,rgba(${glowColor},0.12) 0%,rgba(${glowColor},0.08) 14%,rgba(${glowColor},0.03) 34%,transparent 70%);z-index:200;opacity:0;transform:translate(-50%,-50%);mix-blend-mode:screen;`;
    document.body.appendChild(spotlight);
    spotlightRef.current = spotlight;

    const onMove = (e: MouseEvent) => {
      if (!spotlightRef.current || !gridRef.current) return;
      const section = gridRef.current.closest('.bento-section');
      const rect = section?.getBoundingClientRect();
      const inside = rect && e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom;
      const cards = gridRef.current.querySelectorAll<HTMLElement>('.card');
      if (!inside) {
        gsap.to(spotlightRef.current, { opacity: 0, duration: 0.3, ease: 'power2.out' });
        cards.forEach((c) => c.style.setProperty('--glow-intensity', '0'));
        return;
      }
      const { proximity, fadeDistance } = calculateSpotlightValues(spotlightRadius);
      let minD = Infinity;
      cards.forEach((card) => {
        const cr = card.getBoundingClientRect();
        const d = Math.max(0, Math.hypot(e.clientX - (cr.left + cr.width / 2), e.clientY - (cr.top + cr.height / 2)) - Math.max(cr.width, cr.height) / 2);
        minD = Math.min(minD, d);
        const gi = d <= proximity ? 1 : d <= fadeDistance ? (fadeDistance - d) / (fadeDistance - proximity) : 0;
        updateCardGlowProperties(card, e.clientX, e.clientY, gi, spotlightRadius);
      });
      gsap.to(spotlightRef.current, { left: e.clientX, top: e.clientY, duration: 0.1, ease: 'power2.out' });
      const op = minD <= proximity ? 0.78 : minD <= fadeDistance ? ((fadeDistance - minD) / (fadeDistance - proximity)) * 0.78 : 0;
      gsap.to(spotlightRef.current, { opacity: op, duration: op > 0 ? 0.18 : 0.42, ease: 'power2.out' });
    };
    const onLeave = () => {
      gridRef.current?.querySelectorAll<HTMLElement>('.card').forEach((c) => c.style.setProperty('--glow-intensity', '0'));
      if (spotlightRef.current) gsap.to(spotlightRef.current, { opacity: 0, duration: 0.3, ease: 'power2.out' });
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseleave', onLeave);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseleave', onLeave);
      spotlightRef.current?.parentNode?.removeChild(spotlightRef.current);
    };
  }, [disableAnimations, enabled, glowColor, gridRef, spotlightRadius]);

  return null;
}

/* ══════════════════════════════════════════════════════════════════════
 * PUBLIC API — Children-based Usage
 * ══════════════════════════════════════════════════════════════════════ */

export interface BentoCardProps {
  children: ReactNode;
  /** Extra classes (e.g. `col-span-full`, `col-span-2`, `row-span-2`) */
  className?: string;
  /** Accent label shown top-left */
  label?: string;
  style?: CSSProperties;
}

/** Individual card inside a MagicBentoGrid */
export function BentoCard({ children, className = '', label, style }: BentoCardProps) {
  return (
    <ParticleCard
      className={`card card--border-glow flex flex-col relative w-full max-w-full p-5 rounded-[20px] border border-solid font-light overflow-hidden transition-all duration-300 ${className}`}
      style={{
        backgroundColor: 'var(--background-dark)',
        borderColor: 'var(--border-color)',
        color: 'var(--white)',
        minHeight: 160,
        ...style,
      }}
      enableTilt={false}
      clickEffect
      enableMagnetism
      glowColor={DEFAULT_GLOW_COLOR}
    >
      {label && (
        <div className="mb-3" style={{ fontFamily: '"Orbitron", monospace', fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#00e5ff' }}>
          {label}
        </div>
      )}
      {children}
    </ParticleCard>
  );
}

export interface MagicBentoGridProps {
  children: ReactNode;
  /** Grid class override — default is a responsive 4-column grid */
  className?: string;
  glowColor?: string;
  enableSpotlight?: boolean;
  disableAnimations?: boolean;
  spotlightRadius?: number;
}

/** Wraps children in a GSAP-powered bento section with spotlight */
export function MagicBentoGrid({
  children,
  className = '',
  glowColor = DEFAULT_GLOW_COLOR,
  enableSpotlight = true,
  disableAnimations = false,
  spotlightRadius = DEFAULT_SPOTLIGHT_RADIUS,
}: MagicBentoGridProps) {
  const gridRef = useRef<HTMLDivElement | null>(null);
  const isMobile = useMobileDetection();
  const shouldDisable = disableAnimations || isMobile;

  return (
    <>
      <style>{BENTO_STYLES(glowColor)}</style>
      {enableSpotlight && (
        <GlobalSpotlight
          gridRef={gridRef}
          disableAnimations={shouldDisable}
          enabled
          spotlightRadius={spotlightRadius}
          glowColor={glowColor}
        />
      )}
      <div
        className={`bento-section select-none relative ${className}`}
        ref={gridRef}
        style={{ display: 'grid', gap: 12 }}
      >
        {children}
      </div>
    </>
  );
}

/* ══════════════════════════════════════════════════════════════════════
 * LEGACY API — Static cards array (kept for backward compat)
 * ══════════════════════════════════════════════════════════════════════ */

export interface MagicBentoStaticCard {
  color?: string;
  title: string;
  description: string;
  label: string;
}

export default function MagicBento({
  cards,
  glowColor = DEFAULT_GLOW_COLOR,
  enableSpotlight = true,
  disableAnimations = false,
}: {
  cards: MagicBentoStaticCard[];
  glowColor?: string;
  enableSpotlight?: boolean;
  disableAnimations?: boolean;
}) {
  return (
    <MagicBentoGrid
      glowColor={glowColor}
      enableSpotlight={enableSpotlight}
      disableAnimations={disableAnimations}
      className="grid-cols-1 md:grid-cols-2 lg:grid-cols-4"
    >
      {cards.map((card, i) => (
        <BentoCard key={`${card.title}-${i}`} label={card.label}>
          <h3 className="m-0 mb-2 text-[1rem] font-semibold text-white">{card.title}</h3>
          <p className="text-sm leading-6 text-white/75">{card.description}</p>
        </BentoCard>
      ))}
    </MagicBentoGrid>
  );
}
