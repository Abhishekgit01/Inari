import { useEffect, useState } from 'react';
import { Toaster } from 'react-hot-toast';
import { ProductShell } from './components/layout/ProductShell';
import { useAppRouter, type AppRoute } from './hooks/useAppRouter';
import { AttackGraphPage } from './pages/AttackGraphPage';
import { LivePage } from './pages/LivePage';
import { Login, type StoredAuth } from './pages/Login';
import { Onboarding } from './pages/Onboarding';
import { PipelinePage } from './pages/PipelinePage';
import { PlaybooksPage } from './pages/PlaybooksPage';
import { SimulationPage } from './pages/SimulationPage';
import { TrainingPage } from './pages/TrainingPage';
import { WebsitePage } from './pages/WebsitePage';
import { FeaturesPage } from './pages/FeaturesPage';
import { TechnologyPage } from './pages/TechnologyPage';
import { BlogsPage } from './pages/BlogsPage';
import { AboutPage } from './pages/AboutPage';
import { useSimulationStore } from './store/simulationStore';

const PRODUCT_ROUTES = [
  '/live',
  '/simulation',
  '/pipeline',
  '/attack-graph',
  '/playbooks',
  '/training',
 ] as const satisfies readonly AppRoute[];
type ProductRoute = (typeof PRODUCT_ROUTES)[number];

const AUTH_STORAGE_KEY = 'cg_auth';

const isProductRoute = (route: AppRoute): route is ProductRoute =>
  PRODUCT_ROUTES.includes(route as ProductRoute);

const readStoredAuth = (): StoredAuth | null => {
  const stored = window.localStorage.getItem(AUTH_STORAGE_KEY);
  if (!stored) {
    return null;
  }

  try {
    const parsed = JSON.parse(stored) as Partial<StoredAuth>;
    if (typeof parsed?.token !== 'string' || !parsed.token) {
      return null;
    }
    return {
      token: parsed.token,
      alias: typeof parsed.alias === 'string' ? parsed.alias : '',
      onboarded: Boolean(parsed.onboarded),
      operatorId: typeof parsed.operatorId === 'string' ? parsed.operatorId : undefined,
    };
  } catch {
    return null;
  }
};

function App() {
  const { navigate, route } = useAppRouter();
  const { isConnected, maxSteps, simulationId, startSimulation, step } = useSimulationStore();
  const [authIdentity, setAuthIdentity] = useState<StoredAuth | null>(() => readStoredAuth());

  const isAuthenticated = Boolean(authIdentity?.token);

  useEffect(() => {
    if (route === '/auth') {
      navigate('/login');
      return;
    }

    if ((route === '/login' || route === '/onboarding') && !isAuthenticated && route === '/onboarding') {
      navigate('/login');
      return;
    }

    if (route === '/login' && isAuthenticated) {
      navigate(authIdentity?.onboarded ? '/live' : '/onboarding');
      return;
    }

    if (route === '/onboarding' && isAuthenticated && authIdentity?.onboarded) {
      navigate('/live');
      return;
    }

    if (isProductRoute(route) && !isAuthenticated) {
      navigate('/login');
      return;
    }

    if (isProductRoute(route) && isAuthenticated && !authIdentity?.onboarded) {
      navigate('/onboarding');
      return;
    }

    if (isProductRoute(route) && isAuthenticated && authIdentity?.onboarded && !isConnected && !simulationId && !useSimulationStore.getState()._connectionAttempted) {
      void startSimulation();
    }
  }, [authIdentity?.onboarded, isAuthenticated, isConnected, navigate, route, simulationId, startSimulation]);

  const openProduct = async (targetRoute: ProductRoute = '/live') => {
    navigate(targetRoute);
    if (!isConnected) {
      await startSimulation();
    }
  };

  if (route === '/') {
    return (
      <>
        <Toaster
          position="bottom-right"
          toastOptions={{
            style: {
              background: 'rgba(17, 20, 23, 0.94)',
              color: '#e1e2e7',
              border: '1px solid rgba(176, 198, 255, 0.16)',
            },
          }}
        />
        <WebsitePage
          onDemo={() => navigate(isAuthenticated ? (authIdentity?.onboarded ? '/live' : '/onboarding') : '/login')}
          onLogin={() => navigate(isAuthenticated ? (authIdentity?.onboarded ? '/live' : '/onboarding') : '/login')}
        />
      </>
    );
  }

  if (route === '/features') {
    return <FeaturesPage />;
  }
  if (route === '/technology') {
    return <TechnologyPage />;
  }
  if (route === '/blogs') {
    return <BlogsPage />;
  }
  if (route === '/about') {
    return <AboutPage />;
  }

  if ((route === '/login' || route === '/auth') && isAuthenticated) {
    return null;
  }

  if (route === '/onboarding' && (!authIdentity || authIdentity.onboarded)) {
    return null;
  }

  if (isProductRoute(route) && (!authIdentity || !authIdentity.onboarded)) {
    return null;
  }

  if (route === '/login' || route === '/auth') {
    return (
      <>
        <Toaster
          position="bottom-right"
          toastOptions={{
            style: {
              background: 'rgba(17, 20, 23, 0.94)',
              color: '#e1e2e7',
              border: '1px solid rgba(176, 198, 255, 0.16)',
            },
          }}
        />
        <Login
          onAuthenticated={(auth) => {
            setAuthIdentity(auth);
            navigate(auth.onboarded ? '/live' : '/onboarding');
          }}
          onBack={() => navigate('/')}
        />
      </>
    );
  }

  if (route === '/onboarding' && authIdentity) {
    return (
      <>
        <Toaster
          position="bottom-right"
          toastOptions={{
            style: {
              background: 'rgba(17, 20, 23, 0.94)',
              color: '#e1e2e7',
              border: '1px solid rgba(176, 198, 255, 0.16)',
            },
          }}
        />
        <Onboarding
          auth={authIdentity}
          onAuthChange={(auth) => setAuthIdentity(auth)}
          onComplete={(auth) => {
            setAuthIdentity(auth);
            void openProduct('/live');
          }}
        />
      </>
    );
  }

  if (!isProductRoute(route)) {
    return null;
  }

  return (
    <>
      <Toaster
        position="bottom-right"
        toastOptions={{
          style: {
            background: 'rgba(17, 20, 23, 0.96)',
            color: '#e1e2e7',
            border: '1px solid rgba(20, 209, 255, 0.18)',
          },
        }}
      />
      <div style={{ position: 'relative', zIndex: 1 }}>
        <ProductShell
          step={step}
          maxSteps={maxSteps}
        >
          {renderRoute(route)}
        </ProductShell>
      </div>
      <div className="scanline-overlay" />
    </>
  );
}

function renderRoute(route: ProductRoute) {
  switch (route) {
    case '/live':
      return <LivePage />;
    case '/simulation':
      return <SimulationPage />;
    case '/pipeline':
      return <PipelinePage />;
    case '/attack-graph':
      return <AttackGraphPage />;
    case '/playbooks':
      return <PlaybooksPage />;
    case '/training':
      return <TrainingPage />;
    default:
      return <LivePage />;
  }
}

export default App;
