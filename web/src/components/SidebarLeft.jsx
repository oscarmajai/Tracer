import { useTracer } from '../TracerContext';

function BellIcon({ size = 14 }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

function PinIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

const COMMANDS = [
  {
    key: 'BATTERY', label: 'Batería', desc: 'Ver nivel actual',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24"
        fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="1" y="6" width="18" height="12" rx="2" />
        <line x1="23" y1="13" x2="23" y2="11" />
      </svg>
    ),
  },
  {
    key: 'STATUS', label: 'Estado', desc: 'Resumen del sistema',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24"
        fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="16" x2="12" y2="12" />
        <line x1="12" y1="8" x2="12.01" y2="8" />
      </svg>
    ),
  },
  {
    key: 'ALERT', label: 'Alerta', desc: 'Activar modo alerta', toggle: 'alertActive',
    activeLabel: 'Alerta activa', activeDesc: 'Desactivar alerta',
    icon: <BellIcon size={20} />,
  },
  {
    key: 'RING', label: 'Sonar', desc: 'Activar timbre 30s', toggle: 'ringActive',
    activeLabel: 'Sonando', activeDesc: 'Detener timbre',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24"
        fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
        <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
      </svg>
    ),
  },
  {
    key: 'PHOTO', label: 'Foto', desc: 'Capturar con cámara',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24"
        fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
        <circle cx="12" cy="13" r="4" />
      </svg>
    ),
  },
  {
    key: 'lock', label: 'Bloquear', desc: 'Bloquear + mensaje', modal: true,
    toggle: 'lockActive', activeLabel: 'Bloqueado', activeDesc: 'Establecer PIN y desbloquear',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24"
        fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </svg>
    ),
  },
  {
    key: 'callback', label: 'Llamada', desc: 'Llamada de retorno', modal: true,
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24"
        fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.38 2 2 0 0 1 3.58 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.56a16 16 0 0 0 6 6l.92-.92a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
      </svg>
    ),
  },
  {
    key: 'ENABLE_WIFI', label: 'Forzar WiFi', desc: 'Activar WiFi', confirm: true,
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24"
        fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 12.55a11 11 0 0 1 14.08 0" />
        <path d="M1.42 9a16 16 0 0 1 21.16 0" />
        <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
        <line x1="12" y1="20" x2="12.01" y2="20" />
      </svg>
    ),
  },
  {
    key: 'ENABLE_DATA', label: 'Forzar Datos', desc: 'Activar datos móviles', confirm: true,
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24"
        fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <line x1="12" y1="2" x2="12" y2="22" />
        <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
      </svg>
    ),
  },
  {
    key: 'resetPin', label: 'Cambiar PIN', desc: 'Resetear PIN/patrón', modal: true,
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24"
        fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        <line x1="12" y1="15" x2="12" y2="17" />
      </svg>
    ),
  },
  {
    key: 'KEYGUARD', label: 'Restricción', desc: 'Deshabilitar accesos en bloqueo', toggle: 'keyguardActive',
    activeLabel: 'Restringido', activeDesc: 'Restaurar accesos',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24"
        fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      </svg>
    ),
  },
];

export default function SidebarLeft() {
  const {
    notifGranted, requestNotifications,
    sendCmd, sendCmdConfirm, openModal,
    alertActive, toggleAlert,
    ringActive, toggleRing,
    keyguardActive, toggleKeyguard,
    lockActive,
    feedbackText, feedbackMod,
  } = useTracer();

  function handleCmd(cmd) {
    if (cmd.key === 'lock') {
      openModal(lockActive ? 'unlock' : 'lock');
      return;
    }
    if (cmd.modal) { openModal(cmd.key); return; }
    if (cmd.confirm) { sendCmdConfirm(cmd.key); return; }
    if (cmd.toggle === 'alertActive') { toggleAlert(); return; }
    if (cmd.toggle === 'ringActive') { toggleRing(); return; }
    if (cmd.toggle === 'keyguardActive') { toggleKeyguard(); return; }
    sendCmd(cmd.key);
  }

  function isActive(cmd) {
    if (cmd.toggle === 'lockActive') return lockActive;
    if (cmd.toggle === 'alertActive') return alertActive;
    if (cmd.toggle === 'ringActive') return ringActive;
    if (cmd.toggle === 'keyguardActive') return keyguardActive;
    return false;
  }

  function getLabel(cmd) {
    if (cmd.toggle && isActive(cmd)) return cmd.activeLabel;
    return cmd.label;
  }

  function getDesc(cmd) {
    if (cmd.toggle && isActive(cmd)) return cmd.activeDesc;
    return cmd.desc;
  }

  return (
    <aside className="sidebar-left">
      <div className="sidebar-top">
        <div className="sidebar-top-row">
          <span className="brand">Tracer</span>
          <button
            className={`btn-notif${notifGranted ? ' active' : ''}`}
            title={notifGranted ? 'Notificaciones activas' : 'Activar notificaciones'}
            onClick={requestNotifications}
          >
            <BellIcon />
          </button>
        </div>
      </div>

      <button className="btn-locate" onClick={() => sendCmd('LOCATE')}>
        <PinIcon />
        Localizar
      </button>

      <div className="cmd-grid">
        {COMMANDS.map((cmd) => (
          <button
            key={cmd.key}
            className={`cmd-btn${isActive(cmd) ? ' active' : ''}`}
            onClick={() => handleCmd(cmd)}
          >
            {cmd.icon}
            <span>{getLabel(cmd)}</span>
            <small className="cmd-desc">{getDesc(cmd)}</small>
          </button>
        ))}
      </div>

      <button className="btn-wipe" onClick={() => openModal('wipe')}>
        <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24"
          fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <line x1="15" y1="9" x2="9" y2="15" />
          <line x1="9" y1="9" x2="15" y2="15" />
        </svg>
        Borrar datos
      </button>

      <p className={`feedback${feedbackMod ? ' ' + feedbackMod : ''}`}>{feedbackText}</p>
    </aside>
  );
}
