import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Activity,
  ClipboardList,
  Database,
  Radio,
  Route,
  Shield,
  UserCheck,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { SiteNavbar } from '../components/SiteNavbar';
import { FrostGlass } from '../components/FrostGlass';
import {
  FALLBACK_ENTERPRISE_PATHWAYS,
  PRODUCT_SURFACES,
  type EnterprisePathway,
  type EnterprisePathwaysResponse,
} from '../lib/enterprise';

const ENTERPRISE_API_BASE =
  import.meta.env.VITE_API_URL || (import.meta.env.PROD ? '/api' : 'http://127.0.0.1:8001');

const PATHWAY_META: Record<string, { icon: LucideIcon; accent: string }> = {
  siem_xdr_app: { icon: Database, accent: '#14d1ff' },
  streaming_pipeline: { icon: Radio, accent: '#7fd8ff' },
  endpoint_telemetry: { icon: Activity, accent: '#ffcc00' },
  soar_response: { icon: Shield, accent: '#ff6f91' },
  identity_sso: { icon: UserCheck, accent: '#b0c6ff' },
};

export function FeaturesPage() {
  const [enterprise, setEnterprise] = useState<EnterprisePathwaysResponse>(FALLBACK_ENTERPRISE_PATHWAYS);

  useEffect(() => {
    let cancelled = false;

    const loadEnterprisePathways = async () => {
      try {
        const response = await fetch(`${ENTERPRISE_API_BASE}/api/enterprise/pathways`);
        if (!response.ok) {
          return;
        }
        const payload = (await response.json()) as EnterprisePathwaysResponse;
        if (!cancelled && payload?.pathways?.length) {
          setEnterprise(payload);
        }
      } catch {
        // Keep the fallback copy when the backend is unavailable.
      }
    };

    void loadEnterprisePathways();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div style={{ minHeight: '100vh', background: '#111216', color: '#fff', paddingBottom: '120px' }}>
      <SiteNavbar />

      <main
        style={{
          paddingTop: '160px',
          maxWidth: '1180px',
          margin: '0 auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '36px',
          paddingInline: '24px',
        }}
      >
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          <FrostGlass style={{ display: 'flex', flexDirection: 'column', gap: '18px' }} padding="44px">
            <div style={{ fontSize: '12px', letterSpacing: '0.18em', textTransform: 'uppercase', color: '#7fd8ff', fontFamily: '"IBM Plex Mono", monospace' }}>
              Enterprise Product Pathways
            </div>
            <h1 style={{ fontSize: '40px', lineHeight: 1.1, margin: 0, fontWeight: 700, fontFamily: '"Inter", sans-serif' }}>
              How companies can really use Athernex beyond manual file uploads
            </h1>
            <p style={{ margin: 0, maxWidth: '840px', color: '#a1a1aa', fontSize: '16px', lineHeight: 1.75, fontFamily: '"Inter", sans-serif' }}>
              The real product pivot is moving from one-off CSV seeding toward continuous enterprise ingestion. This page now shows the
              exact 5 operating models, the frontend routes that support them, and the backend endpoints already wired into the platform.
            </p>

            <div
              style={{
                display: 'grid',
                gap: '16px',
                gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
              }}
            >
              <InfoCard
                label="Recommended first step"
                value={enterprise.recommended_first_step.title}
                detail={enterprise.recommended_first_step.why}
                badge={enterprise.recommended_first_step.backend_endpoint}
              />
              <InfoCard
                label="Frontend route"
                value={enterprise.recommended_first_step.frontend_route}
                detail="Use the Integrations console to register connectors, webhook push, streaming, telemetry, SOAR, and SSO."
              />
              <InfoCard
                label="Product direction"
                value="Continuous integration model"
                detail="Connect to the customer stack and keep analysts in the loop, instead of asking them to upload files into a demo."
              />
            </div>
          </FrostGlass>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.05 }}>
          <FrostGlass style={{ display: 'flex', flexDirection: 'column', gap: '24px' }} padding="40px">
            <div>
              <h2 style={{ fontSize: '30px', margin: 0, fontWeight: 650, fontFamily: '"Inter", sans-serif' }}>5 real enterprise usage models</h2>
              <p style={{ marginTop: '12px', color: '#a1a1aa', lineHeight: 1.7, fontFamily: '"Inter", sans-serif' }}>
                These are the actual ways I would position the product to companies right now, based on the capabilities already present in the repo.
              </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '18px' }}>
              {enterprise.pathways.map((pathway) => (
                <PathwayCard key={pathway.id} pathway={pathway} />
              ))}
            </div>
          </FrostGlass>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.1 }}>
          <FrostGlass style={{ display: 'flex', flexDirection: 'column', gap: '24px' }} padding="40px">
            <div>
              <h2 style={{ fontSize: '30px', margin: 0, fontWeight: 650, fontFamily: '"Inter", sans-serif' }}>Current demo state to target enterprise state</h2>
              <p style={{ marginTop: '12px', color: '#a1a1aa', lineHeight: 1.7, fontFamily: '"Inter", sans-serif' }}>
                This is the honest product transition. It shows where Athernex is today and what the enterprise version needs to become.
              </p>
            </div>

            <div style={{ display: 'grid', gap: '14px' }}>
              {enterprise.current_vs_target.map((row) => (
                <div
                  key={row.feature_area}
                  style={{
                    display: 'grid',
                    gap: '16px',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                    padding: '18px',
                    borderRadius: '18px',
                    border: '1px solid rgba(255,255,255,0.08)',
                    background: 'rgba(3, 8, 18, 0.28)',
                  }}
                >
                  <div>
                    <div style={{ fontSize: '11px', letterSpacing: '0.14em', textTransform: 'uppercase', color: '#7fd8ff', fontFamily: '"IBM Plex Mono", monospace' }}>
                      Feature Area
                    </div>
                    <div style={{ marginTop: '10px', fontWeight: 650, fontFamily: '"Inter", sans-serif' }}>{row.feature_area}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '11px', letterSpacing: '0.14em', textTransform: 'uppercase', color: '#f4f4f5', fontFamily: '"IBM Plex Mono", monospace' }}>
                      Current Demo State
                    </div>
                    <div style={{ marginTop: '10px', color: '#c4c4cc', lineHeight: 1.7, fontFamily: '"Inter", sans-serif' }}>{row.current_demo_state}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '11px', letterSpacing: '0.14em', textTransform: 'uppercase', color: '#a6e6ff', fontFamily: '"IBM Plex Mono", monospace' }}>
                      Target Enterprise State
                    </div>
                    <div style={{ marginTop: '10px', color: '#e4e4e7', lineHeight: 1.7, fontFamily: '"Inter", sans-serif' }}>{row.target_enterprise_state}</div>
                  </div>
                </div>
              ))}
            </div>
          </FrostGlass>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.15 }}>
          <FrostGlass style={{ display: 'flex', flexDirection: 'column', gap: '24px' }} padding="40px">
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <Route size={22} color="#14d1ff" />
              <div>
                <h2 style={{ fontSize: '30px', margin: 0, fontWeight: 650, fontFamily: '"Inter", sans-serif' }}>Feature-to-endpoint coverage</h2>
                <p style={{ margin: '12px 0 0', color: '#a1a1aa', lineHeight: 1.7, fontFamily: '"Inter", sans-serif' }}>
                  Every major feature in the logged-in product now has a visible frontend route and backend endpoint map.
                </p>
              </div>
            </div>

            <div style={{ display: 'grid', gap: '14px' }}>
              {PRODUCT_SURFACES.map((surface) => (
                <div
                  key={surface.route}
                  style={{
                    display: 'grid',
                    gap: '16px',
                    alignItems: 'start',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                    padding: '18px',
                    borderRadius: '18px',
                    border: '1px solid rgba(255,255,255,0.08)',
                    background: 'rgba(3, 8, 18, 0.28)',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 650, color: '#fff', fontFamily: '"Inter", sans-serif' }}>{surface.feature}</div>
                    <div style={{ marginTop: '8px', color: '#a1a1aa', lineHeight: 1.7, fontFamily: '"Inter", sans-serif', fontSize: '14px' }}>
                      {surface.deliveryNote}
                    </div>
                  </div>
                  <LabelBlock label="Frontend route" items={[surface.route]} accent />
                  <LabelBlock label="Backend endpoints" items={surface.backendEndpoints} compact />
                </div>
              ))}
            </div>
          </FrostGlass>
        </motion.div>
      </main>
    </div>
  );
}

function PathwayCard({ pathway }: { pathway: EnterprisePathway }) {
  const meta = PATHWAY_META[pathway.id] || { icon: Activity, accent: '#14d1ff' };
  const Icon = meta.icon;

  return (
    <FrostGlass style={{ display: 'flex', flexDirection: 'column', gap: '18px', minHeight: '100%' }} padding="26px">
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div
          style={{
            width: '44px',
            height: '44px',
            borderRadius: '14px',
            display: 'grid',
            placeItems: 'center',
            background: `${meta.accent}18`,
            border: `1px solid ${meta.accent}33`,
          }}
        >
          <Icon size={20} color={meta.accent} />
        </div>
        <div>
          <div style={{ fontSize: '11px', letterSpacing: '0.15em', textTransform: 'uppercase', color: '#94a3b8', fontFamily: '"IBM Plex Mono", monospace' }}>
            {pathway.model}
          </div>
          <h3 style={{ margin: '6px 0 0', fontSize: '20px', fontWeight: 650, fontFamily: '"Inter", sans-serif' }}>{pathway.title}</h3>
        </div>
      </div>

      <p style={{ margin: 0, color: '#c4c4cc', lineHeight: 1.7, fontFamily: '"Inter", sans-serif' }}>{pathway.how_companies_use_it}</p>

      <div
        style={{
          borderRadius: '18px',
          padding: '16px',
          border: '1px solid rgba(255,255,255,0.06)',
          background: 'rgba(3, 8, 18, 0.32)',
        }}
      >
        <div style={{ fontSize: '11px', letterSpacing: '0.14em', textTransform: 'uppercase', color: '#7fd8ff', fontFamily: '"IBM Plex Mono", monospace' }}>
          Who buys this
        </div>
        <p style={{ margin: '10px 0 0', color: '#e5e7eb', lineHeight: 1.7, fontFamily: '"Inter", sans-serif' }}>{pathway.buyer}</p>
      </div>

      <StatusBlock label="Current state" value={pathway.current_state} />
      <StatusBlock label="Target state" value={pathway.target_state} />
      <LabelBlock label="Frontend routes" items={pathway.frontend_routes} />
      <LabelBlock label="Backend endpoints" items={pathway.backend_endpoints} />
      <RolloutList steps={pathway.recommended_rollout} />
    </FrostGlass>
  );
}

function InfoCard({
  label,
  value,
  detail,
  badge,
}: {
  label: string;
  value: string;
  detail: string;
  badge?: string;
}) {
  return (
    <div
      style={{
        borderRadius: '18px',
        padding: '18px',
        border: '1px solid rgba(255,255,255,0.08)',
        background: 'rgba(3, 8, 18, 0.28)',
      }}
    >
      <div style={{ fontSize: '11px', letterSpacing: '0.14em', textTransform: 'uppercase', color: '#7fd8ff', fontFamily: '"IBM Plex Mono", monospace' }}>
        {label}
      </div>
      <div style={{ marginTop: '10px', fontSize: '18px', fontWeight: 650, fontFamily: '"Inter", sans-serif' }}>{value}</div>
      <p style={{ margin: '10px 0 0', color: '#c4c4cc', lineHeight: 1.7, fontFamily: '"Inter", sans-serif' }}>{detail}</p>
      {badge ? (
        <code
          style={{
            display: 'inline-block',
            marginTop: '12px',
            padding: '8px 10px',
            borderRadius: '999px',
            background: 'rgba(20, 209, 255, 0.1)',
            color: '#a6e6ff',
            fontSize: '13px',
          }}
        >
          {badge}
        </code>
      ) : null}
    </div>
  );
}

function StatusBlock({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: '11px', letterSpacing: '0.14em', textTransform: 'uppercase', color: '#7fd8ff', fontFamily: '"IBM Plex Mono", monospace' }}>
        {label}
      </div>
      <p style={{ margin: '10px 0 0', color: '#d4d4d8', lineHeight: 1.7, fontFamily: '"Inter", sans-serif' }}>{value}</p>
    </div>
  );
}

function RolloutList({ steps }: { steps: string[] }) {
  return (
    <div>
      <div style={{ fontSize: '11px', letterSpacing: '0.14em', textTransform: 'uppercase', color: '#7fd8ff', fontFamily: '"IBM Plex Mono", monospace' }}>
        Recommended rollout
      </div>
      <div style={{ display: 'grid', gap: '10px', marginTop: '10px' }}>
        {steps.map((step) => (
          <div
            key={step}
            style={{
              padding: '12px 14px',
              borderRadius: '14px',
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
              color: '#d4d4d8',
              fontSize: '14px',
              lineHeight: 1.7,
              fontFamily: '"Inter", sans-serif',
            }}
          >
            {step}
          </div>
        ))}
      </div>
    </div>
  );
}

function LabelBlock({
  label,
  items,
  compact = false,
  accent = false,
}: {
  label: string;
  items: string[];
  compact?: boolean;
  accent?: boolean;
}) {
  return (
    <div>
      <div style={{ fontSize: '11px', letterSpacing: '0.14em', textTransform: 'uppercase', color: '#7fd8ff', fontFamily: '"IBM Plex Mono", monospace' }}>
        {label}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: compact ? '8px' : '10px', marginTop: '10px' }}>
        {items.map((item) => (
          <code
            key={item}
            style={{
              padding: compact ? '7px 10px' : '8px 12px',
              borderRadius: '999px',
              background: accent ? 'rgba(20, 209, 255, 0.1)' : 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.08)',
              color: accent ? '#a6e6ff' : '#e4e4e7',
              fontSize: compact ? '12px' : '13px',
            }}
          >
            {item}
          </code>
        ))}
      </div>
    </div>
  );
}
