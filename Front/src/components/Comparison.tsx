export default function Comparison() {
  return (
    <section className="bg-surface py-32">
      <div className="max-w-7xl mx-auto px-8">
        <h2 className="text-4xl md:text-5xl font-bold text-white mb-8 text-center tracking-tight">Current Demo State vs Target Enterprise State</h2>
        <p className="text-center text-on-surface-variant text-lg max-w-3xl mx-auto mb-20">
          This is the concrete product pivot: move from static uploads and operator-triggered demos toward continuous ingestion, governed response, and enterprise access.
        </p>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-outline-variant/30">
                <th className="py-8 px-6 font-bold text-xl text-white">Feature Area</th>
                <th className="py-8 px-6 font-bold text-xl text-primary">Current Demo State</th>
                <th className="py-8 px-6 font-bold text-xl text-slate-400">Target Enterprise State</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/20">
              <Row
                label="Data Ingestion"
                current="Manual file upload (CSV, JSON, PCAP) seeds the simulation and alert flow."
                next="Automated connectors, vendor-aware webhooks, and continuous ingestion buffers feed the product."
              />
              <Row
                label="Execution"
                current="Analysis starts when the operator launches or advances a simulation."
                next="Athernex runs as a continuously fed background service ready for live analyst triage."
              />
              <Row
                label="Remediation"
                current="Analysts get text-based playbooks and proposed next steps."
                next="Approval-gated SOAR actions can drive notifications, tickets, and direct control changes."
              />
              <Row
                label="Identity"
                current="Manual analyst access and local operator state."
                next="SSO-backed operator access with Okta, Azure AD, SAML, or Google federation."
              />
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function Row({ label, current, next }: { label: string; current: string; next: string }) {
  return (
    <tr className="group hover:bg-white/5 transition-colors">
      <td className="py-10 px-6 font-semibold text-white text-lg">{label}</td>
      <td className="py-10 px-6 text-white font-medium leading-relaxed">{current}</td>
      <td className="py-10 px-6 text-on-surface-variant leading-relaxed">{next}</td>
    </tr>
  );
}
