import { useTracer } from '../TracerContext';
import { relativeTime, SIGNAL_LABELS } from '../helpers';

function ModalOverlay({ name, title, desc, children, onClose }) {
  const { modal, setModal } = useTracer();
  if (modal !== name) return null;
  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setModal(null); }}>
      <div className="modal-card">
        <p className="modal-title">{title}</p>
        <p className="modal-desc">{desc}</p>
        {children}
      </div>
    </div>
  );
}

function CallbackModal() {
  const { setModal, callbackNumber, setCallbackNumber, confirmCallback } = useTracer();
  const onKey = (e) => {
    if (e.key === 'Enter') confirmCallback();
    if (e.key === 'Escape') setModal(null);
  };
  return (
    <ModalOverlay name="callback" title="Llamada de retorno" desc="El dispositivo llamará al número que indiques.">
      <label>Número de teléfono</label>
      <input
        type="tel"
        value={callbackNumber}
        onChange={(e) => setCallbackNumber(e.target.value)}
        placeholder="+52 55 1234 5678"
        autoComplete="off"
        onKeyDown={onKey}
        autoFocus
      />
      <div className="modal-actions">
        <button className="modal-btn-cancel" onClick={() => setModal(null)}>Cancelar</button>
        <button className="modal-btn-confirm" onClick={confirmCallback}>Llamar</button>
      </div>
    </ModalOverlay>
  );
}

function LockModal() {
  const { setModal, lockMessage, setLockMessage, confirmLock } = useTracer();
  const onKey = (e) => {
    if (e.key === 'Enter') confirmLock();
    if (e.key === 'Escape') setModal(null);
  };
  return (
    <ModalOverlay
      name="lock"
      title="Bloquear pantalla"
      desc="Escribe el mensaje que aparecerá en la pantalla de bloqueo. Puedes dejarlo vacío."
    >
      <label>Mensaje (opcional)</label>
      <input
        type="text"
        value={lockMessage}
        onChange={(e) => setLockMessage(e.target.value)}
        placeholder="Este dispositivo ha sido reportado"
        autoComplete="off"
        onKeyDown={onKey}
        autoFocus
      />
      <div className="modal-actions">
        <button className="modal-btn-cancel" onClick={() => setModal(null)}>Cancelar</button>
        <button className="modal-btn-confirm danger" onClick={confirmLock}>Bloquear</button>
      </div>
    </ModalOverlay>
  );
}

function ResetPinModal() {
  const { setModal, newPin, setNewPin, confirmResetPin } = useTracer();
  const onKey = (e) => {
    if (e.key === 'Enter') confirmResetPin();
    if (e.key === 'Escape') setModal(null);
  };
  return (
    <ModalOverlay
      name="resetPin"
      title="Cambiar PIN de pantalla"
      desc="El dispositivo cambiará su PIN de desbloqueo al valor indicado. Funciona sin PIN previo o en Android ≤6."
    >
      <label>Nuevo PIN (mín. 4 dígitos)</label>
      <input
        type="password"
        value={newPin}
        onChange={(e) => setNewPin(e.target.value)}
        inputMode="numeric"
        placeholder="••••"
        maxLength={16}
        autoComplete="new-password"
        onKeyDown={onKey}
        autoFocus
      />
      <div className="modal-actions">
        <button className="modal-btn-cancel" onClick={() => setModal(null)}>Cancelar</button>
        <button className="modal-btn-confirm danger" onClick={confirmResetPin}>Cambiar PIN</button>
      </div>
    </ModalOverlay>
  );
}

function UnlockModal() {
  const { setModal, newPin, setNewPin, confirmUnlock } = useTracer();
  const onKey = (e) => {
    if (e.key === 'Enter') confirmUnlock();
    if (e.key === 'Escape') setModal(null);
  };
  return (
    <ModalOverlay
      name="unlock"
      title="Desbloquear dispositivo"
      desc="Establece un PIN temporal para poder desbloquear el dispositivo. Luego úsalo en la pantalla de bloqueo."
    >
      <label>Nuevo PIN (mín. 4 dígitos)</label>
      <input
        type="password"
        value={newPin}
        onChange={(e) => setNewPin(e.target.value)}
        inputMode="numeric"
        placeholder="••••"
        maxLength={16}
        autoComplete="new-password"
        onKeyDown={onKey}
        autoFocus
      />
      <div className="modal-actions">
        <button className="modal-btn-cancel" onClick={() => setModal(null)}>Cancelar</button>
        <button className="modal-btn-confirm" onClick={confirmUnlock}>Desbloquear</button>
      </div>
    </ModalOverlay>
  );
}

function WipeModal() {
  const { setModal, wipePassword, setWipePassword, wipeError, wipeLoading, confirmWipe } = useTracer();
  const onKey = (e) => {
    if (e.key === 'Enter') confirmWipe();
    if (e.key === 'Escape') setModal(null);
  };
  return (
    <ModalOverlay
      name="wipe"
      title="⚠️ Borrar todos los datos"
      desc="Esta acción es IRREVERSIBLE. El dispositivo volverá a configuración de fábrica. Confirma tu contraseña para continuar."
    >
      <label>Contraseña</label>
      <input
        type="password"
        value={wipePassword}
        onChange={(e) => setWipePassword(e.target.value)}
        placeholder="••••••••"
        autoComplete="current-password"
        onKeyDown={onKey}
        autoFocus
      />
      <p className="login-error">{wipeError}</p>
      <div className="modal-actions">
        <button className="modal-btn-cancel" onClick={() => setModal(null)}>Cancelar</button>
        <button
          className="modal-btn-confirm danger"
          disabled={wipeLoading}
          onClick={confirmWipe}
        >
          {wipeLoading ? 'Verificando…' : 'Borrar datos'}
        </button>
      </div>
    </ModalOverlay>
  );
}

function IntruderAlertModal() {
  const { intruderAlert, setIntruderAlert, photos } = useTracer();
  if (!intruderAlert) return null;

  const d = intruderAlert;
  const photo = photos[0];
  const hasLoc = d.lat != null && d.lon != null;
  const mapsUrl = hasLoc
    ? `https://maps.google.com/?q=${d.lat},${d.lon}`
    : null;
  const signalLabel = d.signal != null
    ? (SIGNAL_LABELS[d.signal] ?? `${d.signal}`)
    : null;

  return (
    <div
      className="intruder-overlay"
      onClick={(e) => { if (e.target === e.currentTarget) setIntruderAlert(null); }}
    >
      <div className="intruder-modal">
        <div className="intruder-header">
          <div className="intruder-header-left">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"
              fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/>
              <line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            <span>Intento de acceso fallido</span>
          </div>
          <button className="intruder-close" onClick={() => setIntruderAlert(null)}>
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24"
              fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <div className="intruder-photo-wrap">
          {photo
            ? <img className="intruder-photo" src={photo.blobUrl} alt="Captura del intruso" />
            : <div className="intruder-photo-placeholder">
                <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24"
                  fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                  <circle cx="12" cy="13" r="4"/>
                </svg>
                <p>Cargando foto…</p>
              </div>
          }
        </div>

        <div className="intruder-data">
          <div className="intruder-row">
            <span>Intento</span>
            <strong className="intruder-attempt">#{d.attempt_num ?? 1}</strong>
          </div>
          {d.timestamp && (
            <div className="intruder-row">
              <span>Fecha</span>
              <strong>{relativeTime(d.timestamp)}</strong>
            </div>
          )}
          {d.battery != null && (
            <div className="intruder-row">
              <span>Batería</span>
              <strong>{d.battery}%</strong>
            </div>
          )}
          {signalLabel && (
            <div className="intruder-row">
              <span>Señal</span>
              <strong>{signalLabel}</strong>
            </div>
          )}
          {d.device_id && (
            <div className="intruder-row">
              <span>Dispositivo</span>
              <strong>{d.device_id}</strong>
            </div>
          )}
          {hasLoc && (
            <div className="intruder-row">
              <span>Ubicación</span>
              <a className="intruder-map-link" href={mapsUrl} target="_blank" rel="noopener noreferrer">
                {d.lat.toFixed(5)}, {d.lon.toFixed(5)}
              </a>
            </div>
          )}
          <p className="intruder-note">
            El PIN ingresado no puede obtenerse (restricción del sistema Android)
          </p>
        </div>

        <button className="intruder-dismiss" onClick={() => setIntruderAlert(null)}>
          Cerrar
        </button>
      </div>
    </div>
  );
}

export default function Modals() {
  return (
    <>
      <IntruderAlertModal />
      <CallbackModal />
      <LockModal />
      <UnlockModal />
      <ResetPinModal />
      <WipeModal />
    </>
  );
}
