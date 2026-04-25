import { useEffect, useState } from 'react';

export type AppRoute =
  | '/'
  | '/auth'
  | '/login'
  | '/onboarding'
  | '/live'
  | '/simulation'
  | '/pipeline'
  | '/attack-graph'
  | '/playbooks'
  | '/training'
  | '/url-security'
  | '/docker'
  | '/features'
  | '/technology'
  | '/integrations'
  | '/threat-report'
  | '/blogs'
  | '/about'
  | '/pricing';

const VALID_ROUTES = new Set<AppRoute>([
  '/',
  '/auth',
  '/login',
  '/onboarding',
  '/live',
  '/simulation',
  '/pipeline',
  '/attack-graph',
  '/playbooks',
  '/training',
  '/url-security',
  '/docker',
  '/features',
  '/technology',
  '/integrations',
  '/threat-report',
  '/blogs',
  '/about',
  '/pricing',
]);

const normalizeRoute = (value: string): AppRoute => {
  const cleaned = value.replace(/\/+$/, '') || '/';
  return VALID_ROUTES.has(cleaned as AppRoute) ? (cleaned as AppRoute) : '/';
};

const ROUTE_CHANGE_EVENT = 'cg:routechange';

export function useAppRouter() {
  const [route, setRoute] = useState<AppRoute>('/');

  useEffect(() => {
    setRoute(normalizeRoute(window.location.pathname));
    const sync = () => setRoute(normalizeRoute(window.location.pathname));
    // Listen to both browser back/forward AND our custom navigate events
    window.addEventListener('popstate', sync);
    window.addEventListener(ROUTE_CHANGE_EVENT, sync);
    return () => {
      window.removeEventListener('popstate', sync);
      window.removeEventListener(ROUTE_CHANGE_EVENT, sync);
    };
  }, []);

  const navigate = (nextRoute: AppRoute) => {
    if (nextRoute === route) {
      return;
    }
    window.history.pushState({}, '', nextRoute);
    // Notify ALL useAppRouter instances (App, CardNav, etc.)
    window.dispatchEvent(new Event(ROUTE_CHANGE_EVENT));
  };

  return { route, navigate };
}
