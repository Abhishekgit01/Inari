import { useMemo, useState, type CSSProperties, type FormEvent } from 'react';
import { motion } from 'framer-motion';
import { apiClient } from '../api/client';
import { SplineBackground } from '../components/SplineBackground';

export interface StoredAuth {
  token: string;
  alias: string;
  onboarded: boolean;
  operatorId?: string;
}

interface LoginProps {
  onAuthenticated: (auth: StoredAuth) => void;
  onBack: () => void;
}

const cardStyle: CSSProperties = {
  width: 420,
  maxWidth: 'calc(100vw - 32px)',
  padding: '32px 28px 28px',
  borderRadius: 16,
  borderWidth: 1,
  borderStyle: 'solid',
  borderColor: 'rgba(0, 229, 255, 0.4)',
  background: 'linear-gradient(135deg, rgba(255,255,255,0.08) 0%, rgba(0,229,255,0.18) 100%)',
  backdropFilter: 'blur(54px)',
  boxShadow: '0 8px 48px rgba(0, 0, 0, 0.55), inset 0 1px 0 rgba(255,255,255,0.08)',
};

const labelStyle: CSSProperties = {
  display: 'block',
  marginBottom: 8,
  color: '#ffffff',
  fontFamily: '"IBM Plex Mono", monospace',
  fontSize: 12,
  fontWeight: 600,
  letterSpacing: '0.15em',
  textTransform: 'uppercase',
  textShadow: '0 2px 8px rgba(0,0,0,0.8)',
};

const inputStyle: CSSProperties = {
  width: '100%',
  height: 48,
  padding: '0 14px',
  borderRadius: 10,
  border: '1px solid rgba(0, 229, 255, 0.3)',
  background: 'rgba(10, 15, 20, 0.7)',
  color: '#ffffff',
  fontFamily: '"IBM Plex Mono", monospace',
  fontSize: 14,
  outline: 'none',
  transition: 'border-color 180ms ease, box-shadow 180ms ease',
};

const focusStyle = (hasError: boolean): CSSProperties => ({
  borderColor: hasError ? 'rgba(255, 0, 68, 0.8)' : 'rgba(0, 229, 255, 0.5)',
  boxShadow: hasError ? '0 0 0 3px rgba(255, 0, 68, 0.12)' : '0 0 0 3px rgba(0, 229, 255, 0.12)',
});

async function attemptBackendLogin(operatorId: string, password: string) {
  try {
    const response = await apiClient.post(
      '/api/auth/login',
      { username: operatorId, password },
      { timeout: 2500, validateStatus: () => true },
    );

    if (response.status >= 200 && response.status < 300 && typeof response.data?.token === 'string') {
      return {
        token: response.data.token,
        alias: typeof response.data?.alias === 'string' ? response.data.alias : '',
        onboarded: Boolean(response.data?.onboarded),
        operatorId,
      } satisfies StoredAuth;
    }
  } catch {
    return null;
  }

  return null;
}

export function Login({ onAuthenticated, onBack }: LoginProps) {
  const [operatorId, setOperatorId] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isFocused, setIsFocused] = useState<'operator' | 'password' | null>(null);
  const [hasError, setHasError] = useState(false);
  const [errorText, setErrorText] = useState('');

  const shakeAnimation = useMemo(
    () => (hasError ? { x: [0, -8, 8, -8, 8, 0] } : { x: 0 }),
    [hasError],
  );

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const trimmedOperatorId = operatorId.trim();
    if (!trimmedOperatorId || password.length < 6) {
      setErrorText('Use any operator ID and a 6-character access code.');
      setHasError(true);
      window.setTimeout(() => setHasError(false), 450);
      return;
    }

    setHasError(false);
    setErrorText('');
    setIsLoading(true);

    const backendAuth = await attemptBackendLogin(trimmedOperatorId, password);
    const auth =
      backendAuth ||
      ({
        token: window.btoa(`${trimmedOperatorId}${Date.now()}`),
        alias: '',
        onboarded: false,
        operatorId: trimmedOperatorId,
      } satisfies StoredAuth);

    window.localStorage.setItem('cg_auth', JSON.stringify(auth));
    onAuthenticated(auth);
    setIsLoading(false);
  };

  return (
    <>
      <SplineBackground
        scene="https://prod.spline.design/jLzBfmhFeHun-l9A/scene.splinecode"
        overlay="linear-gradient(135deg, rgba(3,5,15,0.15) 0%, rgba(6,11,20,0.1) 100%)"
      />
      <div
        style={{
          position: 'relative',
          zIndex: 10,
          display: 'flex',
          minHeight: '100vh',
          alignItems: 'center',
          justifyContent: 'flex-end',
          padding: '24px 48px 24px 24px',
          pointerEvents: 'none',
        }}
      >
        <motion.div
          animate={{ opacity: 1, y: 0, ...shakeAnimation }}
          initial={{ opacity: 0, y: 24 }}
          style={{
            ...cardStyle,
            borderColor: hasError ? 'rgba(255, 0, 68, 0.85)' : 'rgba(255, 255, 255, 0.25)',
            pointerEvents: 'auto',
          }}
          transition={{
            duration: hasError ? 0.4 : 0.6,
            ease: hasError ? 'easeInOut' : 'easeOut',
          }}
        >
          <div
            style={{
              color: '#00e5ff',
              fontFamily: '"Orbitron", monospace',
              fontSize: 20,
              fontWeight: 700,
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
              textShadow: '0 2px 8px rgba(0,0,0,0.8)',
            }}
          >
            {'<> '}Inari
          </div>
          <div
            style={{
              marginTop: 10,
              color: 'rgba(255, 255, 255, 0.95)',
              fontFamily: '"IBM Plex Mono", monospace',
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              textShadow: '0 2px 6px rgba(0,0,0,0.8)',
            }}
          >
            Inari Security Platform
          </div>

          <form onSubmit={handleSubmit} style={{ marginTop: 28 }}>
            <div style={{ marginBottom: 18 }}>
              <label htmlFor="operator-id" style={labelStyle}>
                Operator ID
              </label>
              <input
                id="operator-id"
                onBlur={() => setIsFocused((current) => (current === 'operator' ? null : current))}
                onChange={(event) => setOperatorId(event.target.value)}
                onFocus={() => setIsFocused('operator')}
                placeholder="OPERATOR-ID"
                style={{
                  ...inputStyle,
                  ...(isFocused === 'operator' ? focusStyle(hasError) : null),
                }}
                type="text"
                value={operatorId}
              />
            </div>

            <div style={{ marginBottom: 20 }}>
              <label htmlFor="access-code" style={labelStyle}>
                Access Code
              </label>
              <input
                id="access-code"
                onBlur={() => setIsFocused((current) => (current === 'password' ? null : current))}
                onChange={(event) => setPassword(event.target.value)}
                onFocus={() => setIsFocused('password')}
                placeholder="••••••"
                style={{
                  ...inputStyle,
                  ...(isFocused === 'password' ? focusStyle(hasError) : null),
                }}
                type="password"
                value={password}
              />
            </div>

            <motion.button
              animate={isLoading ? { opacity: [1, 0.4, 1] } : { opacity: 1 }}
              style={{
                width: '100%',
                height: 48,
                borderRadius: 10,
                border: '1px solid rgba(0, 229, 255, 0.5)',
                background: 'rgba(0, 229, 255, 0.08)',
                color: '#00e5ff',
                cursor: 'pointer',
                fontFamily: '"Orbitron", monospace',
                fontSize: 12,
                fontWeight: 600,
                letterSpacing: '0.16em',
                textTransform: 'uppercase',
                textShadow: '0 2px 6px rgba(0,0,0,0.85)',
                boxShadow: isLoading ? '0 0 20px rgba(0, 229, 255, 0.18)' : 'none',
              }}
              transition={{ duration: 1.1, repeat: isLoading ? Number.POSITIVE_INFINITY : 0 }}
              type="submit"
              whileHover={
                isLoading
                  ? undefined
                  : {
                      backgroundColor: 'rgba(0, 229, 255, 0.15)',
                      boxShadow: '0 0 24px rgba(0, 229, 255, 0.35)',
                    }
              }
              whileTap={isLoading ? undefined : { scale: 0.97 }}
            >
              {isLoading ? 'Authenticating...' : 'Authenticate ------------> '}
            </motion.button>

            <div
              style={{
                marginTop: 18,
                borderTop: '1px solid rgba(255, 255, 255, 0.2)',
                paddingTop: 14,
                color: errorText ? '#ff6f91' : 'rgba(255, 255, 255, 0.9)',
                fontFamily: '"IBM Plex Mono", monospace',
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: '0.08em',
                textShadow: '0 2px 6px rgba(0,0,0,0.8)',
              }}
            >
              {errorText || 'Demo: any ID + 6-char code'}
            </div>
          </form>

          <button
            onClick={onBack}
            style={{
              marginTop: 14,
              border: 0,
              background: 'transparent',
              color: 'rgba(255, 255, 255, 0.8)',
              cursor: 'pointer',
              fontFamily: '"IBM Plex Mono", monospace',
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              textShadow: '0 2px 6px rgba(0,0,0,0.8)',
            }}
            type="button"
          >
            Back to website
          </button>
        </motion.div>
      </div>
    </>
  );
}
