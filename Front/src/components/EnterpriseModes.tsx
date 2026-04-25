import { Database, Radio, Activity, Shield, UserCheck } from "lucide-react";

const pathways = [
  {
    title: "Direct SIEM / XDR Integrations",
    model: "App Model",
    summary:
      "Connect Splunk, Sentinel, CrowdStrike, QRadar, or Elastic so Athernex receives high-severity alerts without manual exports.",
    frontend: ["/integrations", "/live", "/playbooks"],
    endpoints: ["/api/connectors/siem", "/api/webhooks/ingest", "/api/integrations/status"],
    icon: Database,
  },
  {
    title: "Real-Time Event Streaming",
    model: "Data Pipeline Model",
    summary:
      "Mirror a filtered subset of security events from Kafka, RabbitMQ, or Kinesis into Athernex for continuous ingestion.",
    frontend: ["/integrations", "/pipeline", "/live"],
    endpoints: ["/api/streaming/configure", "/api/streaming/push", "/api/streaming/status"],
    icon: Radio,
  },
  {
    title: "Lightweight Endpoint Telemetry",
    model: "Telemetry Model",
    summary:
      "Ship endpoint events from Wazuh, osquery, Fluentd, or Logstash-style forwarders so host activity lands inside the war room.",
    frontend: ["/integrations", "/live", "/training"],
    endpoints: ["/api/agents/telemetry", "/api/detection/alerts", "/api/agents/info"],
    icon: Activity,
  },
  {
    title: "Automated Response & SOAR",
    model: "Response Model",
    summary:
      "Queue, approve, and execute containment actions through analyst-in-the-loop workflows before granting direct control changes.",
    frontend: ["/integrations", "/playbooks", "/live"],
    endpoints: ["/api/soar/action", "/api/soar/pending", "/api/soar/log"],
    icon: Shield,
  },
  {
    title: "Identity & SSO",
    model: "Access Model",
    summary:
      "Move from demo-style access toward enterprise identity with Okta, Azure AD, SAML, or Google-backed operator sessions.",
    frontend: ["/integrations", "/login", "/onboarding"],
    endpoints: ["/api/sso/configure", "/api/sso/providers", "/api/sso/authenticate"],
    icon: UserCheck,
  },
];

export default function EnterpriseModes() {
  return (
    <section className="bg-surface py-32">
      <div className="max-w-7xl mx-auto px-8">
        <div className="max-w-3xl">
          <h2 className="text-4xl md:text-5xl font-bold tracking-tight text-white mb-4">How companies can actually use Athernex</h2>
          <p className="text-on-surface-variant text-lg leading-relaxed">
            This is the product story companies need to see: not manual uploads, but connectors, webhooks, streams, telemetry, SOAR, and SSO.
          </p>
        </div>

        <div className="grid gap-6 mt-16 md:grid-cols-2 xl:grid-cols-3">
          {pathways.map((pathway) => {
            const Icon = pathway.icon;
            return (
              <div key={pathway.title} className="glass-card ghost-border rounded-3xl p-8 flex flex-col gap-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.18em] text-secondary">{pathway.model}</div>
                    <h3 className="text-2xl font-bold text-white mt-3">{pathway.title}</h3>
                  </div>
                  <div className="w-12 h-12 rounded-2xl bg-secondary/10 border border-secondary/20 grid place-items-center">
                    <Icon className="text-secondary" size={22} />
                  </div>
                </div>

                <p className="text-on-surface-variant leading-relaxed">{pathway.summary}</p>

                <div>
                  <div className="text-[11px] uppercase tracking-[0.16em] text-secondary mb-3">Frontend routes</div>
                  <div className="flex flex-wrap gap-2">
                    {pathway.frontend.map((route) => (
                      <span key={route} className="rounded-full bg-secondary/10 border border-secondary/20 px-3 py-1 text-xs text-secondary">
                        {route}
                      </span>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="text-[11px] uppercase tracking-[0.16em] text-secondary mb-3">Backend endpoints</div>
                  <div className="flex flex-wrap gap-2">
                    {pathway.endpoints.map((endpoint) => (
                      <code key={endpoint} className="rounded-full bg-white/5 border border-white/10 px-3 py-1 text-[11px] text-white/70">
                        {endpoint}
                      </code>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
