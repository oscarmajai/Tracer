// Login screen for Tracer — conecta con la API real.

function LoginScreen({ onLogin }) {
  const [username, setUsername] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [stage, setStage] = React.useState('idle'); // idle | checking | verifying | granted | error
  const [error, setError] = React.useState('');
  const [showHint, setShowHint] = React.useState(false);

  // Auto-login si hay token válido guardado
  React.useEffect(() => {
    const { apiToken, apiUsername } = tracerGetSettings();
    if (!apiToken) {
      const t = setTimeout(() => setShowHint(true), 1200);
      return () => clearTimeout(t);
    }
    setStage('checking');
    fetch('/api/location/latest', {
      headers: { Authorization: 'Bearer ' + apiToken },
    }).then(res => {
      if (res.status === 401) {
        localStorage.removeItem('tracer_token');
        setStage('idle');
        setTimeout(() => setShowHint(true), 1200);
      } else {
        setStage('granted');
        setTimeout(onLogin, 400);
      }
    }).catch(() => {
      setStage('granted');
      setTimeout(onLogin, 400);
    });
  }, []);

  const clearError = () => {
    if (stage === 'error') { setStage('idle'); setError(''); }
  };

  const submit = async (e) => {
    e.preventDefault();
    if (isBusy) return;
    if (!username || !password) {
      setError('Completa todos los campos.');
      setStage('error');
      return;
    }
    setStage('verifying');
    setError('');
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      if (res.status === 401) {
        setError('Usuario o contraseña incorrectos.');
        setStage('error');
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { token } = await res.json();
      tracerPersistSettings(token, username);
      setStage('granted');
      setTimeout(() => onLogin(), 800);
    } catch (err) {
      setError(`Error de conexión: ${err.message}`);
      setStage('error');
    }
  };

  const isIdle = stage === 'idle' || stage === 'error';
  const isBusy = stage === 'checking' || stage === 'verifying' || stage === 'granted';

  return (
    <div className="login-shell">
      <div className="login-bg-grid" aria-hidden="true">
        <svg width="100%" height="100%" preserveAspectRatio="none" viewBox="0 0 1200 800">
          <defs>
            <pattern id="loginGrid" width="48" height="48" patternUnits="userSpaceOnUse">
              <path d="M 48 0 L 0 0 0 48" fill="none" stroke="var(--border)" strokeWidth="0.5" />
            </pattern>
            <radialGradient id="loginGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.10" />
              <stop offset="60%" stopColor="var(--accent)" stopOpacity="0.02" />
              <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
            </radialGradient>
          </defs>
          <rect width="1200" height="800" fill="url(#loginGrid)" />
          <ellipse cx="600" cy="380" rx="620" ry="320" fill="url(#loginGlow)" />
        </svg>
      </div>

      <div className="login-card">
        <div className="login-brand">
          <TracerWordmark size={26} />
        </div>

        <div className="login-heading">
          <h1>Tracer</h1>
          <p>Localiza y controla tus dispositivos de forma remota.</p>
        </div>

        <form className="login-form" onSubmit={submit}>
          <label className="login-field">
            <span>Usuario</span>
            <input
              type="text"
              value={username}
              onChange={(e) => { setUsername(e.target.value); clearError(); }}
              disabled={isBusy}
              autoComplete="username"
              autoFocus
            />
          </label>
          <label className="login-field">
            <span>Contraseña</span>
            <input
              type="password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); clearError(); }}
              disabled={isBusy}
              autoComplete="current-password"
            />
          </label>

          {error && <div className="login-error">{error}</div>}

          <button
            type="submit"
            className={`login-submit stage-${stage === 'error' ? 'idle' : (stage === 'checking' ? 'verifying' : stage)}`}
            disabled={isBusy}
          >
            <span className="login-submit-label">
              {isIdle && 'Continuar'}
              {stage === 'checking' && 'Conectando…'}
              {stage === 'verifying' && 'Verificando…'}
              {stage === 'granted' && (<><IconCheck width={14} height={14} /> Acceso concedido</>)}
            </span>
            {(stage === 'verifying' || stage === 'checking') && <span className="login-spinner" aria-hidden="true" />}
          </button>
        </form>

        <div className="login-foot">
          <span>Tu cuenta personal de Tracer</span>
          <span className="login-status">
            <span className="status-dot status-dot-on" /> Servicio en línea
          </span>
        </div>

        {showHint && isIdle && (
          <div className="login-hint">
            Ingresa tus credenciales para acceder.
          </div>
        )}
      </div>

      <div className="login-foot-credits">
        <span>Tracer · v2.4.1</span>
      </div>
    </div>
  );
}

function TracerWordmark({ size = 22 }) {
  return (
    <div className="wordmark" style={{ fontSize: size, lineHeight: 1 }}>
      <svg width={size + 4} height={size + 4} viewBox="0 0 28 28" fill="none">
        <circle cx="14" cy="14" r="11" stroke="currentColor" strokeWidth="1.8" />
        <circle cx="14" cy="14" r="4" fill="currentColor" />
        <circle cx="14" cy="14" r="11" stroke="currentColor" strokeWidth="1.8" strokeDasharray="3 5" opacity="0.4" />
      </svg>
      <span>Tracer</span>
    </div>
  );
}

window.LoginScreen = LoginScreen;
window.TracerWordmark = TracerWordmark;
