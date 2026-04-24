import { ArrowRight } from "lucide-react";

export default function TechnicalSpecs() {
  return (
    <section className="bg-surface py-32">
      <div className="max-w-7xl mx-auto px-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-16">
          <div className="lg:col-span-1">
            <h2 className="text-5xl font-bold text-white mb-8 leading-tight tracking-tighter">
              Built for the <br />
              <span className="text-secondary">Architect.</span>
            </h2>
            <p className="text-on-surface-variant text-lg mb-10 leading-relaxed">
              Deeply integrated, low-latency infrastructure designed to fit into your existing DevOps pipelines without friction.
            </p>
            <button className="flex items-center gap-3 text-primary font-bold text-lg group">
              <span>API Documentation</span>
              <ArrowRight className="group-hover:translate-x-2 transition-transform" size={24} />
            </button>
          </div>

          <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-8">
            <SpecCard 
              id="ENGINEERING.01"
              title="Edge Latency"
              desc="Global edge nodes ensure inspection adds less than 5ms overhead to your traffic."
              progress={98}
              accent="secondary"
            />
            <SpecCard 
              id="ENGINEERING.02"
              title="gRPC Integration"
              desc="Native support for ultra-fast, bidirectional streaming telemetry across microservices."
              tags={["Kubernetes", "AWS", "GCP"]}
              accent="primary"
            />
            <SpecCard 
              id="ENGINEERING.03"
              title="ML Precision"
              desc="Bayesian-based anomaly scoring with per-user baseline modeling."
              accent="tertiary"
            />
            <SpecCard 
              id="ENGINEERING.04"
              title="SOC2 / GDPR"
              desc="Fully compliant data residency and encryption at rest/transit protocols."
              accent="white"
            />
          </div>
        </div>
      </div>
    </section>
  );
}

function SpecCard({ id, title, desc, progress, tags, accent }: { 
  id: string; 
  title: string; 
  desc: string; 
  progress?: number; 
  tags?: string[];
  accent: string;
}) {
  const accentColor = {
    secondary: "text-secondary",
    primary: "text-primary",
    tertiary: "text-tertiary",
    white: "text-white"
  }[accent] || "text-white";

  const barColor = {
    secondary: "bg-secondary",
    primary: "bg-primary",
    tertiary: "bg-tertiary",
    white: "bg-white"
  }[accent] || "bg-white";

  return (
    <div className="glass-card ghost-border p-10 rounded-3xl hover:bg-surface-container-high transition-all">
      <div className={`${accentColor} font-mono text-xs font-bold mb-6 tracking-widest`}>{id}</div>
      <h4 className="text-2xl font-bold text-white mb-3">{title}</h4>
      <p className="text-on-surface-variant text-sm leading-relaxed mb-8">{desc}</p>
      
      {progress && (
        <>
          <div className="w-full bg-white/10 h-1.5 rounded-full overflow-hidden">
            <div className={`${barColor} h-full`} style={{ width: `${progress}%` }}></div>
          </div>
          <div className={`mt-3 text-[10px] uppercase font-bold tracking-tighter ${accentColor}`}>
            Optimized Performance
          </div>
        </>
      )}

      {tags && (
        <div className="flex flex-wrap gap-2">
          {tags.map(tag => (
            <span key={tag} className="text-[10px] font-bold border border-outline-variant px-3 py-1 rounded-full text-on-surface-variant uppercase tracking-wider">
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
