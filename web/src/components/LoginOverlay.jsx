import { useTracer } from '../TracerContext';

export default function LoginOverlay() {
  const {
    loginUsername, setLoginUsername,
    loginPassword, setLoginPassword,
    loginError, loginLoading, doLogin,
  } = useTracer();

  const onKey = (e) => {
    if (e.key === 'Enter') doLogin();
  };

  return (
    <div className="login-overlay">
      <div className="login-card">
        <p className="login-brand">Tracer</p>
        <p className="login-sub">Panel de control</p>
        <div className="login-form">
          <label>Usuario</label>
          <input
            type="text"
            value={loginUsername}
            onChange={(e) => setLoginUsername(e.target.value)}
            placeholder="admin"
            autoComplete="username"
            onKeyDown={onKey}
          />
          <label>Contraseña</label>
          <input
            type="password"
            value={loginPassword}
            onChange={(e) => setLoginPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete="current-password"
            onKeyDown={onKey}
          />
          <p className="login-error">{loginError}</p>
          <button
            className="btn-login"
            disabled={loginLoading}
            onClick={doLogin}
          >
            {loginLoading ? 'Conectando…' : 'Entrar'}
          </button>
        </div>
      </div>
    </div>
  );
}
