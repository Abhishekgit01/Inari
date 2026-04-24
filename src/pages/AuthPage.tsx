import { useState, type FormEvent } from 'react';

interface AuthPageProps {
  onAuthenticated: (identity: { name: string; email: string }) => void;
  onBack: () => void;
}

export function AuthPage({ onAuthenticated, onBack }: AuthPageProps) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [workspace, setWorkspace] = useState('SOC-01');

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedName = name.trim() || 'Demo Analyst';
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      return;
    }
    onAuthenticated({ name: trimmedName, email: trimmedEmail });
  };

  return (
    <div className="auth-page">
      <div className="auth-backdrop-grid" />

      <section className="auth-panel auth-panel-brand">
        <div className="ops-display text-[0.7rem] text-secondary/70">Secure Demo Access</div>
        <h1>Authenticate before entering the command deck.</h1>
        <p>
          This gate keeps the website flow intact while making the live product feel like a protected analyst surface.
          Sign in with a work email and we&apos;ll unlock the full CyberGuardian runtime.
        </p>

        <div className="auth-feature-list">
          <div className="auth-feature-card">
            <span className="ops-label text-[0.5rem]">Decision Transparency</span>
            <strong>Live heatmaps of what Red and Blue are considering on every node.</strong>
          </div>
          <div className="auth-feature-card">
            <span className="ops-label text-[0.5rem]">Cross-layer Detection</span>
            <strong>Network, endpoint, and application signals correlated into one incident stream.</strong>
          </div>
          <div className="auth-feature-card">
            <span className="ops-label text-[0.5rem]">Simulation + Playbooks</span>
            <strong>Understand the threat, why it was flagged, and what action wins next.</strong>
          </div>
        </div>
      </section>

      <section className="auth-panel auth-panel-form">
        <div className="auth-card">
          <div className="ops-display text-[0.62rem] text-secondary/70">Demo Authentication</div>
          <h2>Access the live product</h2>
          <p className="auth-copy">Use any work email to unlock the guided demo environment.</p>

          <form className="auth-form" onSubmit={handleSubmit}>
            <label>
              <span className="ops-label text-[0.52rem]">Analyst Name</span>
              <input className="ops-input" onChange={(event) => setName(event.target.value)} placeholder="Abhishek" type="text" value={name} />
            </label>

            <label>
              <span className="ops-label text-[0.52rem]">Work Email</span>
              <input className="ops-input" onChange={(event) => setEmail(event.target.value)} placeholder="analyst@company.com" type="email" value={email} />
            </label>

            <label>
              <span className="ops-label text-[0.52rem]">Workspace</span>
              <select className="ops-input" onChange={(event) => setWorkspace(event.target.value)} value={workspace}>
                <option value="SOC-01">SOC-01</option>
                <option value="SOC-Blue">SOC-BLUE</option>
                <option value="HackMalenadu">HACK MALENADU DEMO</option>
              </select>
            </label>

            <button className="ops-button ops-button-primary auth-submit" type="submit">
              Authenticate and open /live
            </button>
          </form>

          <button className="auth-back-link" onClick={onBack} type="button">
            Return to website
          </button>
        </div>
      </section>
    </div>
  );
}
