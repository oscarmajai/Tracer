import { useTracer } from '../TracerContext';

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

export default function Modals() {
  return (
    <>
      <CallbackModal />
      <LockModal />
      <UnlockModal />
      <ResetPinModal />
      <WipeModal />
    </>
  );
}
