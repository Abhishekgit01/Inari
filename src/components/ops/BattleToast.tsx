import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useEffect, useState } from 'react';
import type { NodeBattleResult } from '../../lib/ops-types';

interface BattleToastData {
  id: string;
  result: NodeBattleResult;
  createdAt: number;
}

interface BattleToastManagerProps {
  results: NodeBattleResult[];
}

const TOAST_DURATION = {
  captured: 8000,
  defended: 5000,
  recaptured: 6000,
} as const satisfies Record<'captured' | 'defended' | 'recaptured', number>;

const TOAST_COLORS = {
  captured: { bg: '#1a0008', border: '#ff0044', icon: '☠', title: 'NODE CAPTURED' },
  defended: { bg: '#001a1f', border: '#00e5ff', icon: '🛡', title: 'NODE DEFENDED' },
  recaptured: { bg: '#001a1f', border: '#00e5ff', icon: '♻', title: 'NODE RECAPTURED' },
} as const satisfies Record<
  'captured' | 'defended' | 'recaptured',
  { bg: string; border: string; icon: string; title: string }
>;

const FP_STYLE = { bg: '#1a1200', border: '#ffcc00', icon: '⚠', title: 'FALSE POSITIVE' };

export default function BattleToastManager({ results }: BattleToastManagerProps) {
  const [toasts, setToasts] = useState<BattleToastData[]>([]);
  const [seen, setSeen] = useState<Set<string>>(new Set());

  // Add new toasts from results
  useEffect(() => {
    const newToasts: BattleToastData[] = [];
    for (const result of results) {
      const id = `${result.node_id}-${result.step_resolved}-${result.outcome}`;
      if (!seen.has(id)) {
        newToasts.push({ id, result, createdAt: Date.now() });
        setSeen((prev) => new Set(prev).add(id));
      }
    }
    if (newToasts.length > 0) {
      setToasts((prev) => [...prev, ...newToasts].slice(-3));
    }
  }, [results]);

  // Auto-dismiss
  useEffect(() => {
    if (toasts.length === 0) return;
    const timers = toasts.map((toast) => {
      const duration = TOAST_DURATION[toast.result.outcome as keyof typeof TOAST_DURATION] ?? 6000;
      return window.setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== toast.id));
      }, duration);
    });
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [toasts]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <div className="fixed right-4 top-20 z-[1100] flex flex-col gap-3 pointer-events-none">
      <AnimatePresence>
        {toasts.map((toast) => {
          const r = toast.result;
          const outcome = r.outcome as keyof typeof TOAST_COLORS;
          const style = r.false_positive ? FP_STYLE : TOAST_COLORS[outcome] ?? TOAST_COLORS.captured;
          return (
            <motion.div
              animate={{ opacity: 1, x: 0 }}
              className="pointer-events-auto w-[380px] rounded-sm border-l-4 px-4 py-3"
              exit={{ opacity: 0, x: 80 }}
              initial={{ opacity: 0, x: 80 }}
              key={toast.id}
              style={{
                backgroundColor: style.bg,
                borderColor: style.border,
                borderLeftWidth: 4,
                borderRightWidth: 1,
                borderTopWidth: 1,
                borderBottomWidth: 1,
                boxShadow: `0 0 20px ${style.border}30`,
              }}
              transition={{ type: 'spring', stiffness: 300, damping: 20 }}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-lg">{style.icon}</span>
                  <span className="ops-display text-sm" style={{ color: style.border }}>
                    {style.title} — {r.node_label}
                  </span>
                </div>
                <button
                  className="ops-muted text-xs hover:text-white transition-colors"
                  onClick={() => dismiss(toast.id)}
                >✕</button>
              </div>
              <div className="ops-muted mt-2 text-xs leading-5">
                {r.incident_summary}
              </div>
              <div className="mt-2 border-t border-white/10 pt-2 ops-muted text-[0.62rem]">
                <strong style={{ color: style.border }}>IMPACT:</strong> {r.strategic_impact}
              </div>
              {r.outcome === 'captured' ? (
                <div className="mt-2 text-center">
                  <span className="ops-label cursor-pointer rounded-sm border border-red-400/30 bg-red-400/10 px-3 py-1 text-[0.62rem] text-red-300 hover:bg-red-400/20 transition-colors">
                    📋 GENERATE EMERGENCY PLAYBOOK
                  </span>
                </div>
              ) : null}
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
