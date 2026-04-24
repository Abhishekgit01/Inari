# SPLINE + LOGIN FLOW PROMPT — CyberGuardian AI (Inari)
## Scope: SURGICAL — touch ONLY the files explicitly listed. Nothing else.

---

## ⚠️ HARD RULES — READ BEFORE TOUCHING ANYTHING

- **DO NOT modify any existing page component** (Live, Simulation, Pipeline, Attack Graph, Playbooks, Training)
- **DO NOT change any existing CSS variables, Tailwind config, or global styles**
- **DO NOT touch any existing WebSocket logic, Zustand store, or API client**
- **DO NOT modify the existing navigation sidebar component**
- **DO NOT change any D3, Recharts, or Framer Motion component**
- **DO NOT install any package other than the ones listed in this prompt**
- You are allowed to CREATE new files and MODIFY only: `App.tsx` (routing only), `main.tsx` (if needed for auth provider), and the 3 new files listed below

---

## INSTALL — Only These Packages

```bash
npm install @splinetool/react-spline @splinetool/runtime
```

If Spline import causes TypeScript errors, add to `vite-env.d.ts`:
```typescript
declare module '@splinetool/react-spline';
```

---

## WHAT TO BUILD — 3 New Files Only

### File 1: `src/components/SplineBackground.tsx`
### File 2: `src/pages/Login.tsx`  
### File 3: `src/pages/Onboarding.tsx`

And one routing change in `src/App.tsx` (add 2 routes, wrap existing routes in auth guard — do not change the existing route components themselves).

---

## FILE 1: `src/components/SplineBackground.tsx`

A reusable wrapper that renders the Spline scene as a fixed full-screen background layer behind all content.

```typescript
import Spline from '@splinetool/react-spline';
import { Suspense } from 'react';

const SPLINE_URL = 'https://prod.spline.design/UyrNXzEDKjCm3S4l/scene.splinecode';

export function SplineBackground() {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 0,
        pointerEvents: 'none', // ← CRITICAL: must not intercept clicks from the app
        overflow: 'hidden',
      }}
    >
      <Suspense fallback={<div style={{ background: '#03050f', width: '100%', height: '100%' }} />}>
        <Spline
          scene={SPLINE_URL}
          style={{
            width: '100%',
            height: '100%',
            // Make the Spline canvas non-interactive so app UI works normally
            pointerEvents: 'none',
          }}
        />
      </Suspense>
      {/* Dark overlay so app text stays readable over the 3D scene */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(135deg, rgba(3,5,15,0.72) 0%, rgba(7,13,26,0.65) 100%)',
          pointerEvents: 'none',
        }}
      />
    </div>
  );
}
```

**Important notes for implementation:**
- The `pointerEvents: 'none'` on both the wrapper and the Spline canvas is non-negotiable. Without this, the 3D scene will swallow all mouse events and the app's buttons/links will stop working.
- The overlay gradient uses the existing `--bg-void` and `--bg-base` color values — adjust opacity if the 3D scene is too bright or too dark.
- If Spline fails to load (network error), the fallback `#03050f` background matches `--bg-void` so the app still looks correct.

---

## FILE 2: `src/pages/Login.tsx`

The login page. The Spline scene is the full background. The login card floats in the center.

**Authentication logic:**
- Store auth state in `localStorage` with key `cg_auth`: `{ token: string, alias: string, onboarded: boolean }`
- For the hackathon demo, accept any non-empty username + any password that is 6+ characters. Generate a fake token: `btoa(username + Date.now())`
- If the team has a real backend auth endpoint (`POST /api/auth/login`), call it. If it returns 401 or is unreachable, fall back to the demo auth above. Never crash.

**Page layout:**
```
[FULL SCREEN — SplineBackground renders here behind everything]

                    ┌───────────────────────────────────┐
                    │  ⬡  CYBERGUARDIAN AI               │  ← Orbitron font, --cyan
                    │     INARI SECURITY PLATFORM        │  ← IBM Plex Mono, --text-secondary
                    │                                    │
                    │  OPERATOR ID                       │
                    │  [________________________]        │  ← input
                    │                                    │
                    │  ACCESS CODE                       │
                    │  [________________________]        │  ← password input
                    │                                    │
                    │  [ AUTHENTICATE ──────────── → ]   │  ← button
                    │                                    │
                    │  ─────────────────────────────     │
                    │  Demo: any ID + 6-char code        │  ← tiny muted hint
                    └───────────────────────────────────┘
```

**Card styles (inline, do NOT modify global CSS):**
- Background: `rgba(13, 22, 40, 0.85)` with `backdropFilter: 'blur(16px)'`
- Border: `1px solid rgba(0, 229, 255, 0.2)`
- Width: `420px`, centered with flexbox
- Border radius: `4px` (sharp — matches existing design language)
- Box shadow: `0 0 40px rgba(0, 229, 255, 0.08)`

**Input styles:**
- Background: `rgba(3, 5, 15, 0.7)`
- Border: `1px solid rgba(0, 229, 255, 0.15)` → on focus: `rgba(0, 229, 255, 0.5)`
- Font: IBM Plex Mono, `--text-primary`
- Label: IBM Plex Mono 10px, letter-spacing 0.15em, `--text-secondary`, ALL CAPS

**Button styles:**
- Background: `transparent`
- Border: `1px solid #00e5ff`
- Color: `#00e5ff`
- Font: Orbitron, 12px
- On hover: `background: rgba(0,229,255,0.1)`, glow `box-shadow: 0 0 20px rgba(0,229,255,0.3)`
- On click: brief scale-down (0.97) with Framer Motion

**Animations:**
- The login card enters with Framer Motion: `initial={{ opacity: 0, y: 24 }}` → `animate={{ opacity: 1, y: 0 }}`, duration 0.6s, ease "easeOut"
- Error state (wrong credentials): card shakes horizontally — `x: [0, -8, 8, -8, 8, 0]` over 0.4s, border turns `--threat-critical`
- Loading state (while authenticating): button text becomes "AUTHENTICATING..." and pulses opacity 1 → 0.4 → 1

**On successful auth:**
- Write to localStorage: `{ token, alias: '', onboarded: false }`
- Navigate to `/onboarding`

---

## FILE 3: `src/pages/Onboarding.tsx`

Two-step onboarding flow after first login. Uses the same SplineBackground. Never show again once `onboarded: true` is set.

**Step 1 — Operator Alias:**

```
[SplineBackground]

  ┌─────────────────────────────────────────────────────┐
  │                                                     │
  │   INITIALIZING OPERATOR PROFILE                     │  ← Orbitron, --cyan
  │   ─────────────────────────────────────────         │
  │                                                     │
  │   Before we begin — what should I call you?         │  ← IBM Plex Mono, --text-primary
  │                                                     │
  │   [____________________________]                    │  ← text input, placeholder: "OPERATOR ALIAS"
  │                                                     │
  │                          [ CONFIRM → ]              │
  │                                                     │
  └─────────────────────────────────────────────────────┘
```

- Save alias to localStorage auth object: `cg_auth.alias = input`
- On confirm (non-empty input): animate card out (opacity 0, x: -40) → animate Step 2 in (opacity 0, x: 40 → 0)

**Step 2 — Mission Briefing:**

```
  ┌─────────────────────────────────────────────────────┐
  │                                                     │
  │   WELCOME, {ALIAS}                                  │  ← Orbitron 28px, --cyan — alias in uppercase
  │   ─────────────────────────────────────────         │
  │                                                     │
  │   CyberGuardian AI gives you:                       │  ← IBM Plex Mono
  │                                                     │
  │   ⬡  Real-time Red vs Blue agent simulation        │  }
  │   ⬡  10-stage predictive threat pipeline           │  } ← fade in with 150ms stagger per item
  │   ⬡  Cross-layer threat detection (3 signals)      │  }
  │   ⬡  MITRE ATT&CK mapped alerts + auto-playbooks   │  }
  │   ⬡  Giskard-powered adversarial blind-spot scans  │  }
  │                                                     │
  │   Your mission: Keep the network alive.             │  ← italic, --text-secondary
  │                                                     │
  │            [ ENTER THE WAR ROOM ──────────── → ]    │  ← full-width button
  │                                                     │
  └─────────────────────────────────────────────────────┘
```

- The `⬡` bullet icons use `--cyan` color, matching the hexagon node shape in the app
- Each list item fades + slides in with 150ms stagger using Framer Motion `variants` + `staggerChildren`
- Button is wider than Step 1 buttons — conveys it's the final action
- On click: write `cg_auth.onboarded = true` to localStorage → navigate to `/live`
- The navigation should feel like launching — button flash to full cyan fill for 300ms before navigating

**Shared card style:** identical to Login card (same blur, border, shadow, border-radius)

---

## APP.TSX — Routing Changes Only

Add 2 new routes and an auth guard. Do not change any existing route, component, or import other than adding these:

```typescript
// Add these imports at the top (new files only):
import { Login } from './pages/Login';
import { Onboarding } from './pages/Onboarding';
import { SplineBackground } from './components/SplineBackground';

// Add this auth guard helper (inline in App.tsx, not a separate file):
function RequireAuth({ children }: { children: React.ReactNode }) {
  const auth = JSON.parse(localStorage.getItem('cg_auth') || 'null');
  if (!auth?.token) return <Navigate to="/login" replace />;
  if (!auth?.onboarded) return <Navigate to="/onboarding" replace />;
  return <>{children}</>;
}

// Add 2 new routes BEFORE existing routes:
<Route path="/login" element={<Login />} />
<Route path="/onboarding" element={<Onboarding />} />

// Wrap the root route (the one that renders the layout with sidebar + all existing pages)
// with RequireAuth. Do NOT touch the layout component itself — just wrap it:
<Route path="/*" element={<RequireAuth><ExistingLayoutComponent /></RequireAuth>} />

// Add SplineBackground INSIDE the existing layout component's JSX
// by adding it as the first child before the sidebar — it must render
// at z-index 0, behind everything. The sidebar and page content
// must have position: relative and z-index >= 1 (they likely already do).
// If modifying the layout component would touch anything else, instead
// render SplineBackground inside RequireAuth before the children:
<Route path="/*" element={
  <RequireAuth>
    <>
      <SplineBackground />
      <ExistingLayoutComponent />
    </>
  </RequireAuth>
} />
```

---

## SPLINE SCENE NOTES

The scene URL `https://prod.spline.design/UyrNXzEDKjCm3S4l/scene.splinecode` is a read-only embed. You cannot edit the 3D objects or camera. Work with it as-is.

**If the Spline scene is not editable or cannot be controlled programmatically:**
Do NOT create an alternative 3D scene. Instead, implement this fallback background using only CSS + SVG:

```css
/* Fallback animated background — cyber network nodes */
.cyber-bg {
  position: fixed;
  inset: 0;
  z-index: 0;
  background: #03050f;
  overflow: hidden;
}
/* Render 20–30 SVG circles at random positions with:
   - random sizes (4px–16px)
   - cyan or dim-cyan stroke
   - connecting lines between nearest neighbors (simulate network graph)
   - slow floating animation (translateY ±20px, 8–15s duration each, randomised)
   - subtle pulse glow on 5–6 random nodes
   This mimics the network topology aesthetic of the app itself.
*/
```

Use the CSS fallback if and only if the Spline import fails to build or the scene URL is inaccessible.

---

## SUMMARY — FILES TOUCHED

| File | Action |
|---|---|
| `src/components/SplineBackground.tsx` | CREATE |
| `src/pages/Login.tsx` | CREATE |
| `src/pages/Onboarding.tsx` | CREATE |
| `src/App.tsx` | MODIFY — add 2 routes + auth guard wrapper only |
| `vite-env.d.ts` | MODIFY — add Spline type declaration if needed |
| **Everything else** | **DO NOT TOUCH** |
