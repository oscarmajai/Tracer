// Sidebar and TopBar for Tracer's main app shell.

function Sidebar({ view, setView, unread, devices, username, onLogout }) {
  const items = [
    { id: 'map', label: 'Mapa', icon: IconMap },
    { id: 'devices', label: 'Dispositivos', icon: IconDevices },
    { id: 'activity', label: 'Actividad', icon: IconActivity },
    { id: 'history', label: 'Historial', icon: IconHistory },
    { id: 'notifications', label: 'Notificaciones', icon: IconBell, badge: unread },
    { id: 'settings', label: 'Configuración', icon: IconSettings },
  ];

  const displayName = username || 'Usuario';
  const avatarLetter = displayName[0]?.toUpperCase() || 'U';

  return (
    <aside className="sidebar">
      <div className="sidebar-top">
        <div className="sidebar-brand">
          <TracerWordmark size={16} />
        </div>

        <nav className="sidebar-nav">
          {items.map((item) => {
            const Icon = item.icon;
            const active = view === item.id;
            return (
              <button
                key={item.id}
                className={`sidebar-item ${active ? 'is-active' : ''}`}
                onClick={() => setView(item.id)}
              >
                <Icon width={15} height={15} />
                <span>{item.label}</span>
                {item.badge ? <span className="sidebar-badge">{item.badge}</span> : null}
              </button>
            );
          })}
        </nav>

        {devices.length > 0 && (
          <>
            <div className="sidebar-divider" />
            <div className="sidebar-section-label">Mis dispositivos</div>
            <div className="sidebar-devices">
              {devices.map((d) => {
                const Icon = window.tracerDeviceIcon(d.type);
                return (
                  <button
                    key={d.id}
                    className="sidebar-device"
                    onClick={() => setView('map')}
                    title={d.name}
                  >
                    <Icon width={14} height={14} />
                    <span className="sidebar-device-name">{d.name}</span>
                    <span className={`status-dot ${d.status === 'online' ? 'status-dot-on' : 'status-dot-off'}`} />
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>

      <div className="sidebar-foot">
        <button className="sidebar-account" onClick={onLogout} title="Cerrar sesión">
          <div className="avatar">{avatarLetter}</div>
          <div className="sidebar-account-info">
            <div className="sidebar-account-name">{displayName}</div>
            <div className="sidebar-account-mail">Cerrar sesión</div>
          </div>
          <IconLogout width={14} height={14} />
        </button>
      </div>
    </aside>
  );
}

function TopBar({ title, subtitle, right }) {
  return (
    <header className="topbar">
      <div className="topbar-titles">
        <h2>{title}</h2>
        {subtitle && <p>{subtitle}</p>}
      </div>
      <div className="topbar-right">{right}</div>
    </header>
  );
}

window.TracerSidebar = Sidebar;
window.TracerTopBar = TopBar;
