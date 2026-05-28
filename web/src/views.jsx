// Secondary views: Devices list, History, Notifications, Share, Settings.

function DevicesView({ devices, setSelectedId, setView, onAction }) {
  return (
    <div className="view-pad">
      <TracerTopBar
        title="Dispositivos"
        subtitle={`${devices.length} dispositivo${devices.length !== 1 ? 's' : ''} vinculado${devices.length !== 1 ? 's' : ''}`}
      />

      {devices.length === 0 ? (
        <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
          Sin dispositivos conectados
        </div>
      ) : (
        <div className="devices-grid">
          {devices.map((d) => {
            const Icon = window.tracerDeviceIcon(d.type);
            return (
              <div key={d.id} className="device-card" onClick={() => { setSelectedId(d.id); setView('map'); }}>
                <div className="device-card-head">
                  <div className="device-icon-wrap"><Icon width={18} height={18} /></div>
                  <div className={`status-pill status-pill-${d.status}`}>
                    <span className={`status-dot ${d.status === 'online' ? 'status-dot-on' : 'status-dot-off'}`} />
                    {d.status === 'online' ? 'En línea' : 'Fuera de línea'}
                  </div>
                </div>
                <div className="device-card-body">
                  <div className="device-card-name">{d.name}</div>
                  <div className="device-card-model">{d.model}</div>
                </div>
                <div className="device-card-meta">
                  <div className="device-card-meta-row">
                    <span className="device-card-meta-k">Ubicación</span>
                    <span className="device-card-meta-v">{d.location.address}</span>
                  </div>
                  <div className="device-card-meta-row">
                    <span className="device-card-meta-k">Visto</span>
                    <span className="device-card-meta-v">{d.lastSeen}</span>
                  </div>
                  <div className="device-card-meta-row">
                    <span className="device-card-meta-k">Batería</span>
                    <span className="device-card-meta-v">
                      <span className="inline-battery">
                        <span className="inline-battery-bar" style={{ width: `${d.battery}%` }} />
                      </span>
                      {d.battery}%{d.charging ? ' ⚡' : ''}
                    </span>
                  </div>
                </div>
                <div className="device-card-foot">
                  <button className="btn btn-sm btn-ghost" onClick={(e) => { e.stopPropagation(); onAction('ring', d.id); }}>
                    <IconRing width={12} height={12} /> Sonar
                  </button>
                  <button className="btn btn-sm btn-ghost" onClick={(e) => { e.stopPropagation(); onAction('lost', d.id); }}>
                    <IconLock width={12} height={12} /> Perdido
                  </button>
                  <button className="btn btn-sm btn-primary-ghost" onClick={(e) => { e.stopPropagation(); setSelectedId(d.id); setView('map'); }}>
                    Ver en mapa <IconChevronRight width={12} height={12} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function latlonToSvg(lat, lon, bounds) {
  const padding = 120;
  const latSpan = Math.max(bounds.maxLat - bounds.minLat, 0.001);
  const lonSpan = Math.max(bounds.maxLon - bounds.minLon, 0.001);
  const x = ((lon - bounds.minLon) / lonSpan) * (1000 - 2 * padding) + padding;
  const y = ((bounds.maxLat - lat) / latSpan) * (1000 - 2 * padding) + padding;
  return { x: Math.round(x), y: Math.round(y) };
}

function HistoryView({ devices, selectedId, setSelectedId, historyItems }) {
  const device = devices.find((d) => d.id === selectedId) || devices[0] || null;
  const [hoverIdx, setHoverIdx] = React.useState(null);

  const bounds = historyItems.length > 0 ? {
    minLat: Math.min(...historyItems.map(h => h.lat)),
    maxLat: Math.max(...historyItems.map(h => h.lat)),
    minLon: Math.min(...historyItems.map(h => h.lon)),
    maxLon: Math.max(...historyItems.map(h => h.lon)),
  } : { minLat: 0, maxLat: 1, minLon: 0, maxLon: 1 };

  const history = historyItems.map(h => ({
    ...h,
    time: h.ts,
    label: h.name,
    address: h.sub || h.name,
    pos: latlonToSvg(h.lat, h.lon, bounds),
  }));

  const totalKm = historyItems.length > 1
    ? historyItems.reduce((sum, h, i) =>
        i === 0 ? 0 : sum + haversineKm(historyItems[i - 1].lat, historyItems[i - 1].lon, h.lat, h.lon), 0)
    : 0;

  const firstTs = historyItems.length > 0 ? new Date(historyItems[historyItems.length - 1].timestamp) : null;
  const lastTs = historyItems.length > 0 ? new Date(historyItems[0].timestamp) : null;
  const hoursActive = firstTs && lastTs
    ? ((lastTs - firstTs) / 1000 / 3600).toFixed(1)
    : '—';
  const activeSince = firstTs
    ? firstTs.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
    : '—';

  return (
    <div className="view-pad history-view">
      <TracerTopBar
        title="Historial"
        subtitle="Lugares y rutas registradas"
        right={
          <div className="seg">
            <button className="seg-btn is-on">Hoy</button>
          </div>
        }
      />

      <div className="history-grid">
        <div className="history-side">
          {devices.length > 1 && (
            <div className="history-device-selector">
              <div className="form-label">Dispositivo</div>
              <div className="history-device-list">
                {devices.map((d) => {
                  const Icon = window.tracerDeviceIcon(d.type);
                  return (
                    <button
                      key={d.id}
                      className={`history-device ${d.id === (device?.id) ? 'is-active' : ''}`}
                      onClick={() => setSelectedId(d.id)}
                    >
                      <Icon width={14} height={14} />
                      <span>{d.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="history-summary">
            <div className="form-label">Resumen</div>
            <div className="summary-grid">
              <div className="summary-cell">
                <div className="summary-k">Lugares</div>
                <div className="summary-v">{history.length}</div>
              </div>
              <div className="summary-cell">
                <div className="summary-k">Distancia</div>
                <div className="summary-v">{totalKm > 0 ? totalKm.toFixed(1) : '—'} <span className="summary-unit">{totalKm > 0 ? 'km' : ''}</span></div>
              </div>
              <div className="summary-cell">
                <div className="summary-k">Tiempo</div>
                <div className="summary-v">{hoursActive !== '—' ? `${hoursActive}h` : '—'}</div>
              </div>
              <div className="summary-cell">
                <div className="summary-k">Activo desde</div>
                <div className="summary-v">{activeSince}</div>
              </div>
            </div>
          </div>

          <div className="history-timeline">
            <div className="form-label">Línea de tiempo</div>
            {history.length === 0 ? (
              <div style={{ color: 'var(--text-muted)', fontSize: 12, padding: '8px 0' }}>Sin historial disponible</div>
            ) : (
              <div className="timeline">
                {history.map((h, i) => (
                  <div
                    key={i}
                    className={`timeline-row ${hoverIdx === i ? 'is-hover' : ''} ${i === 0 ? 'is-current' : ''}`}
                    onMouseEnter={() => setHoverIdx(i)}
                    onMouseLeave={() => setHoverIdx(null)}
                  >
                    <div className="timeline-time mono">{h.time}</div>
                    <div className="timeline-dot-wrap">
                      <div className="timeline-dot" />
                      {i < history.length - 1 && <div className="timeline-line" />}
                    </div>
                    <div className="timeline-body">
                      <div className="timeline-label">{h.label}</div>
                      <div className="timeline-addr">{h.address}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="history-map">
          <div className="history-map-frame">
            <TracerMap />
            {history.length > 1 && (
              <svg className="history-trail-overlay" viewBox="0 0 1000 1000" preserveAspectRatio="xMidYMid slice">
                <path
                  d={history.map((h, i) => `${i === 0 ? 'M' : 'L'} ${h.pos.x} ${h.pos.y}`).join(' ')}
                  fill="none" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
                />
                {history.map((h, i) => (
                  <g key={i} transform={`translate(${h.pos.x} ${h.pos.y})`}>
                    <circle r={hoverIdx === i ? 11 : 7} fill="#fff" stroke="var(--accent)" strokeWidth="2" />
                    <circle r="3" fill="var(--accent)" />
                  </g>
                ))}
              </svg>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function NotificationsView({ notifications, devices, onMarkRead, onClearAll }) {
  return (
    <div className="view-pad">
      <TracerTopBar
        title="Notificaciones"
        subtitle={`${notifications.filter(n => n.unread).length} sin leer · ${notifications.length} totales`}
        right={
          <div className="topbar-actions">
            <button className="btn btn-ghost btn-sm" onClick={onClearAll}>Marcar todas como leídas</button>
          </div>
        }
      />

      <div className="notif-list">
        {notifications.length === 0 ? (
          <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
            Sin notificaciones
          </div>
        ) : notifications.map((n) => {
          const device = devices.find((d) => d.id === n.deviceId);
          const Icon = device ? window.tracerDeviceIcon(device.type) : IconBell;
          return (
            <div
              key={n.id}
              className={`notif-row ${n.unread ? 'is-unread' : ''}`}
              onClick={() => onMarkRead(n.id)}
            >
              <div className="notif-marker">
                {n.unread && <span className="notif-dot" />}
              </div>
              <div className={`notif-type-icon notif-type-${n.type}`}>
                <Icon width={14} height={14} />
              </div>
              <div className="notif-body">
                <div className="notif-title">{n.title}</div>
                <div className="notif-detail">{n.detail}</div>
              </div>
              <div className="notif-time mono">{n.time}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ShareView({ contacts, onToggle }) {
  return (
    <div className="view-pad">
      <TracerTopBar
        title="Compartir ubicación"
        subtitle="Personas que pueden ver dónde están tus dispositivos"
      />
      <div className="share-grid">
        <div className="share-side" style={{ gridColumn: '1 / -1' }}>
          <div className="info-card">
            <div className="info-card-title">Función no disponible</div>
            <p>La función de compartir ubicación con contactos no está disponible en esta versión.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function SettingsView({ username }) {
  const [notifs, setNotifs] = React.useState(
    typeof Notification !== 'undefined' && Notification.permission === 'granted'
  );

  const requestNotifs = async () => {
    if (!('Notification' in window)) return;
    const perm = await Notification.requestPermission();
    setNotifs(perm === 'granted');
  };

  return (
    <div className="view-pad">
      <TracerTopBar title="Configuración" subtitle="Cuenta y notificaciones" />

      <div className="settings-list">
        <SettingsSection title="Cuenta">
          <SettingsRow label="Usuario" value={username || '—'} />
        </SettingsSection>

        <SettingsSection title="Notificaciones">
          <SettingsToggleRow
            label="Alertas en el navegador"
            help="Recibe notificaciones cuando el dispositivo envía alertas"
            on={notifs} onChange={requestNotifs}
          />
        </SettingsSection>
      </div>
    </div>
  );
}

function SettingsSection({ title, children }) {
  return (
    <section className="settings-section">
      <h3 className="settings-section-title">{title}</h3>
      <div className="settings-section-body">{children}</div>
    </section>
  );
}

function SettingsRow({ label, value, rightLink }) {
  return (
    <div className="settings-row">
      <div className="settings-row-main">
        <div className="settings-row-label">{label}</div>
        <div className="settings-row-value">{value}</div>
      </div>
      {rightLink && <a href="#" className="settings-row-link" onClick={(e) => e.preventDefault()}>{rightLink}</a>}
    </div>
  );
}

function SettingsToggleRow({ label, help, on, onChange }) {
  return (
    <div className="settings-row">
      <div className="settings-row-main">
        <div className="settings-row-label">{label}</div>
        <div className="settings-row-help">{help}</div>
      </div>
      <Toggle on={on} onChange={() => onChange(!on)} />
    </div>
  );
}

function Toggle({ on, onChange }) {
  return (
    <button className={`toggle ${on ? 'is-on' : ''}`} onClick={onChange} aria-pressed={on}>
      <span className="toggle-thumb" />
    </button>
  );
}

window.DevicesView = DevicesView;
window.HistoryView = HistoryView;
window.NotificationsView = NotificationsView;
window.ShareView = ShareView;
window.SettingsView = SettingsView;
window.TracerToggle = Toggle;
