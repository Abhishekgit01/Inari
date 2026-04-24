import {
  Activity,
  Bot,
  ChartColumn,
  ClipboardList,
  GitBranch,
  Layers3,
  Plug,
  Radio,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { AppRoute } from '../../hooks/useAppRouter';

type ProductRoute = Extract<
  AppRoute,
  '/live' | '/simulation' | '/pipeline' | '/attack-graph' | '/playbooks' | '/training' | '/integrations'
>;

const navItems: Array<{ route: ProductRoute; label: string; icon: LucideIcon }> = [
  { route: '/live', label: 'War Room', icon: Activity },
  { route: '/simulation', label: 'Battle', icon: Bot },
  { route: '/pipeline', label: 'Pipeline', icon: Layers3 },
  { route: '/attack-graph', label: 'Attack Graph', icon: GitBranch },
  { route: '/playbooks', label: 'Playbooks', icon: ClipboardList },
  { route: '/training', label: 'Training', icon: ChartColumn },
  { route: '/integrations', label: 'Integrations', icon: Plug },
];

interface ProductSidebarProps {
  currentRoute: AppRoute;
  onNavigate: (route: AppRoute) => void;
  isConnected: boolean;
}

export function ProductSidebar({ currentRoute, onNavigate, isConnected }: ProductSidebarProps) {
  return (
    <aside className="product-sidebar hidden md:flex">
      <button className="brand-lockup" onClick={() => onNavigate('/')} type="button">
        <div className="brand-mark">CG</div>
        <div className="ops-display text-[0.54rem] text-secondary/70">CyberGuardian</div>
      </button>

      <nav className="mt-8 flex flex-1 flex-col gap-3">
        {navItems.map((item) => {
          const active = currentRoute === item.route;
          const Icon = item.icon;
          return (
            <button
              className={`sidebar-link ${active ? 'sidebar-link-active' : ''}`}
              key={item.route}
              onClick={() => onNavigate(item.route)}
              type="button"
            >
              <Icon size={18} strokeWidth={1.8} />
              <span className="ops-label text-[0.56rem]">{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="status-pod">
        <Radio className={`status-dot-icon ${isConnected ? 'status-dot-live' : ''}`} size={16} strokeWidth={2.2} />
        <div className="ops-label mt-2 text-[0.54rem]">{isConnected ? 'Live Link' : 'Standby'}</div>
      </div>
    </aside>
  );
}
