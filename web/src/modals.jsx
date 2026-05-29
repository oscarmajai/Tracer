// Action modals: Ring, Lost Mode, Wipe

function Modal({ open, onClose, children, size = 'md' }) {
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className={`modal modal-${size}`} onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

function RingModal({ open, device, onClose, onConfirm, ringing }) {
  if (!device) return null;
  const Icon = window.tracerDeviceIcon(device.type);
  return (
    <Modal open={open} onClose={onClose}>
      <header className="modal-head">
        <div className="modal-eyebrow">Acción</div>
        <h3>Hacer sonar {device.name}</h3>
        <button className="modal-close" onClick={onClose}><IconClose width={14} height={14} /></button>
      </header>

      <div className="modal-body">
        {!ringing ? (
          <>
            <p className="modal-lead">
              Reproducirá un sonido fuerte durante 2 minutos, aún si está en silencio.
              Útil cuando crees que está cerca pero no lo encuentras.
            </p>
            <div className="modal-info-row">
              <div className="modal-info-cell">
                <div className="modal-info-label">Dispositivo</div>
                <div className="modal-info-value"><Icon width={14} height={14} /> {device.name}</div>
              </div>
              <div className="modal-info-cell">
                <div className="modal-info-label">Última ubicación</div>
                <div className="modal-info-value">{device.location.city}</div>
              </div>
              <div className="modal-info-cell">
                <div className="modal-info-label">Estado</div>
                <div className="modal-info-value">{device.status === 'online' ? 'En línea' : 'Fuera de línea'}</div>
              </div>
            </div>
          </>
        ) : (
          <div className="ring-active">
            <RingWaves />
            <div className="ring-active-label">Sonando ahora…</div>
            <div className="ring-active-help">El sonido se detendrá automáticamente cuando desbloquees el dispositivo.</div>
            <div className="ring-active-timer mono">02:00</div>
          </div>
        )}
      </div>

      <footer className="modal-foot">
        {!ringing ? (
          <>
            <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
            <button className="btn btn-primary" onClick={onConfirm}>
              <IconRing width={14} height={14} /> Hacer sonar ahora
            </button>
          </>
        ) : (
          <button className="btn btn-primary" onClick={onClose}>Detener y cerrar</button>
        )}
      </footer>
    </Modal>
  );
}

function RingWaves() {
  return (
    <div className="ring-waves">
      <div className="ring-wave ring-wave-1" />
      <div className="ring-wave ring-wave-2" />
      <div className="ring-wave ring-wave-3" />
      <div className="ring-wave-core">
        <IconRing width={22} height={22} />
      </div>
    </div>
  );
}

function LostModal({ open, device, onClose, onConfirm }) {
  const [step, setStep] = React.useState(1);
  const [phone, setPhone] = React.useState('+52 55 1234 5678');
  const [message, setMessage] = React.useState('Este dispositivo se perdió. Por favor, llámame al número de abajo. Gracias.');

  React.useEffect(() => {
    if (open) setStep(1);
  }, [open]);

  if (!device) return null;

  return (
    <Modal open={open} onClose={onClose} size="lg">
      <header className="modal-head">
        <div className="modal-eyebrow">
          Paso {step} de 2 · Modo perdido
        </div>
        <h3>Activar modo perdido en {device.name}</h3>
        <button className="modal-close" onClick={onClose}><IconClose width={14} height={14} /></button>
      </header>

      <div className="modal-body">
        {step === 1 && (
          <>
            <p className="modal-lead">
              El dispositivo se bloqueará de inmediato y mostrará tu mensaje en la pantalla.
              También podrás rastrearlo con mayor precisión y desactivar Google Pay.
            </p>

            <div className="form-grid">
              <label className="form-field">
                <span>Número de contacto</span>
                <input value={phone} onChange={(e) => setPhone(e.target.value)} />
                <small>Aparecerá como botón "Llamar" en la pantalla bloqueada.</small>
              </label>
              <label className="form-field">
                <span>Mensaje en pantalla</span>
                <textarea rows={3} value={message} onChange={(e) => setMessage(e.target.value)} />
                <small>{message.length} / 240 caracteres</small>
              </label>
            </div>

            <div className="checkbox-row">
              <label className="checkbox">
                <input type="checkbox" defaultChecked />
                <span>Notificarme cuando se conecte a una red</span>
              </label>
              <label className="checkbox">
                <input type="checkbox" defaultChecked />
                <span>Desactivar Google Pay y tarjetas guardadas</span>
              </label>
              <label className="checkbox">
                <input type="checkbox" defaultChecked />
                <span>Activar Factory Reset Protection (anti-reseteo)</span>
              </label>
            </div>
          </>
        )}

        {step === 2 && (
          <div className="lost-preview">
            <div className="lost-preview-label">Así se verá en la pantalla del dispositivo:</div>
            <div className="lost-phone-mock">
              <div className="lost-phone-camera" />
              <div className="lost-phone-screen">
                <div className="lost-phone-statusbar">
                  <span className="mono">12:48</span>
                  <span className="statusbar-icons mono">··· 5G ▰</span>
                </div>
                <div className="lost-phone-time mono">12:48</div>
                <div className="lost-phone-date">jueves, 27 de mayo</div>
                <div className="lost-phone-lock">
                  <IconLock width={14} height={14} />
                </div>
                <div className="lost-phone-label">DISPOSITIVO PERDIDO</div>
                <div className="lost-phone-msg">{message}</div>
                <button className="lost-phone-call">
                  <IconRing width={12} height={12} /> Llamar a {phone}
                </button>
                <div className="lost-phone-nav">
                  <span className="lost-phone-nav-bar" />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <footer className="modal-foot">
        <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
        {step === 1 ? (
          <button className="btn btn-primary" onClick={() => setStep(2)}>Continuar</button>
        ) : (
          <>
            <button className="btn btn-ghost" onClick={() => setStep(1)}>Atrás</button>
            <button className="btn btn-primary" onClick={() => onConfirm(message, phone)}>
              <IconLock width={14} height={14} /> Activar modo perdido
            </button>
          </>
        )}
      </footer>
    </Modal>
  );
}

function WipeModal({ open, device, onClose, onConfirm }) {
  const [confirm, setConfirm] = React.useState('');
  React.useEffect(() => { if (open) setConfirm(''); }, [open]);
  if (!device) return null;

  const canConfirm = confirm.trim().toUpperCase() === 'BORRAR';

  return (
    <Modal open={open} onClose={onClose}>
      <header className="modal-head modal-head-danger">
        <div className="modal-eyebrow modal-eyebrow-danger">Acción irreversible</div>
        <h3>Borrar {device.name}</h3>
        <button className="modal-close" onClick={onClose}><IconClose width={14} height={14} /></button>
      </header>

      <div className="modal-body">
        <p className="modal-lead">
          Todos los datos serán eliminados de este dispositivo de forma remota.
          Una vez iniciado, no podrá detenerse. Después del borrado, no podrás rastrearlo.
        </p>

        <ul className="danger-list">
          <li><IconCheck width={12} height={12} /> Fotos, mensajes y archivos locales</li>
          <li><IconCheck width={12} height={12} /> Cuentas de Google y tokens de sesión</li>
          <li><IconCheck width={12} height={12} /> Tarjetas en Google Pay / Samsung Wallet</li>
          <li><IconCheck width={12} height={12} /> Apps instaladas y configuraciones</li>
        </ul>

        <label className="form-field">
          <span>Para confirmar, escribe <code>BORRAR</code></span>
          <input value={confirm} onChange={(e) => setConfirm(e.target.value)} autoFocus />
        </label>
      </div>

      <footer className="modal-foot">
        <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
        <button
          className={`btn btn-danger ${!canConfirm ? 'is-disabled' : ''}`}
          disabled={!canConfirm}
          onClick={onConfirm}
        >
          <IconErase width={14} height={14} /> Borrar permanentemente
        </button>
      </footer>
    </Modal>
  );
}

function Toast({ toast, onDismiss }) {
  React.useEffect(() => {
    if (!toast) return;
    const t = setTimeout(onDismiss, 3800);
    return () => clearTimeout(t);
  }, [toast, onDismiss]);
  if (!toast) return null;
  return (
    <div className={`toast toast-${toast.tone || 'default'}`}>
      <div className="toast-icon">
        {toast.tone === 'danger' ? <IconErase width={14} height={14} />
          : toast.tone === 'warn' ? <IconLock width={14} height={14} />
          : <IconCheck width={14} height={14} />}
      </div>
      <div className="toast-body">
        <div className="toast-title">{toast.title}</div>
        {toast.detail && <div className="toast-detail">{toast.detail}</div>}
      </div>
      <button className="toast-close" onClick={onDismiss}>
        <IconClose width={12} height={12} />
      </button>
    </div>
  );
}

function CallbackModal({ open, device, onClose, onConfirm }) {
  const [phone, setPhone] = React.useState('');
  React.useEffect(() => { if (open) setPhone(''); }, [open]);
  if (!device) return null;
  return (
    <Modal open={open} onClose={onClose}>
      <header className="modal-head">
        <div className="modal-eyebrow">Vigilancia · Llamada de retorno</div>
        <h3>Llamar desde {device.name}</h3>
        <button className="modal-close" onClick={onClose}><IconClose width={14} height={14} /></button>
      </header>
      <div className="modal-body">
        <p className="modal-lead">
          El dispositivo iniciará una llamada al número indicado.
          Sin registro en el historial del dispositivo.
        </p>
        <label className="form-field">
          <span>Número de teléfono</span>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+521234567890"
            autoFocus
          />
          <small>Deja vacío para usar el número de confianza configurado en el dispositivo.</small>
        </label>
      </div>
      <footer className="modal-foot">
        <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
        <button className="btn btn-primary" onClick={() => onConfirm(phone.trim())}>
          <IconRing width={14} height={14} /> Iniciar llamada
        </button>
      </footer>
    </Modal>
  );
}

window.RingModal = RingModal;
window.LostModal = LostModal;
window.WipeModal = WipeModal;
window.CallbackModal = CallbackModal;
window.Toast = Toast;
