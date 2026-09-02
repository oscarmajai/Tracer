// Main map view: Leaflet map real, panel de detalle del dispositivo.

function LiveClock() {
  const [time, setTime] = React.useState(() =>
    new Date().toLocaleTimeString('es-MX')
  );
  React.useEffect(() => {
    const i = setInterval(() => setTime(new Date().toLocaleTimeString('es-MX')), 1000);
    return () => clearInterval(i);
  }, []);
  return time;
}

function MapView({ devices, selectedId, setSelectedId, ringing, onAction, statusOnline, activeCommands = {}, deviceConnStatus = 'unknown', lastPollAt = null }) {
  const mapDivRef = React.useRef(null);
  const mapInstanceRef = React.useRef(null);
  const markerRef = React.useRef(null);
  const accuracyCircleRef = React.useRef(null);
  const ringingRef = React.useRef(ringing);

  const device = devices.find((d) => d.id === selectedId) || devices[0] || null;

  // Init Leaflet map
  React.useEffect(() => {
    if (!mapDivRef.current || mapInstanceRef.current) return;
    if (typeof L === 'undefined') {
      console.error('Leaflet (L) no está disponible. Verifica que el script de Leaflet cargó correctamente.');
      return;
    }

    const map = L.map(mapDivRef.current, {
      zoomControl: false,
      attributionControl: true,
    }).setView([19.4284, -99.1660], 14);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://www.openstreetmap.org">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);

    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
      markerRef.current = null;
      accuracyCircleRef.current = null;
    };
  }, []);

  // Update marker when device location changes
  React.useEffect(() => {
    if (!mapInstanceRef.current || !device || !device.lat || !device.lon) return;
    if (typeof L === 'undefined') return;

    const map = mapInstanceRef.current;
    const { lat, lon, accuracy, status } = device;
    const isRinging = ringing === device.id;
    ringingRef.current = ringing;

    const markerHtml = `
      <div class="tracer-pin ${status === 'offline' ? 'is-offline' : ''} ${isRinging ? 'is-ringing' : ''}">
        <div class="tracer-pin-inner"></div>
      </div>
    `;

    if (!markerRef.current) {
      const icon = L.divIcon({
        className: '',
        html: markerHtml,
        iconSize: [26, 26],
        iconAnchor: [13, 13],
        popupAnchor: [0, -16],
      });
      markerRef.current = L.marker([lat, lon], { icon }).addTo(map);
      map.setView([lat, lon], 16);
    } else {
      markerRef.current.setLatLng([lat, lon]);
      const icon = L.divIcon({
        className: '',
        html: markerHtml,
        iconSize: [26, 26],
        iconAnchor: [13, 13],
        popupAnchor: [0, -16],
      });
      markerRef.current.setIcon(icon);
    }

    const radius = accuracy || 10;
    if (!accuracyCircleRef.current) {
      accuracyCircleRef.current = L.circle([lat, lon], {
        radius,
        color: 'var(--accent)',
        fillColor: 'var(--accent)',
        fillOpacity: 0.07,
        weight: 1,
        opacity: 0.3,
      }).addTo(map);
    } else {
      accuracyCircleRef.current.setLatLng([lat, lon]);
      accuracyCircleRef.current.setRadius(radius);
    }
  }, [device, ringing]);

  const flyToDevice = () => {
    if (!mapInstanceRef.current || !device?.lat || !device?.lon) return;
    mapInstanceRef.current.flyTo([device.lat, device.lon], 17, { duration: 1.2 });
  };

  return (
    <div className="map-view">
      <div className="map-canvas">
        <div ref={mapDivRef} className="map-inner" />

        {/* Top overlay: indicador de conectividad del dispositivo */}
        <div className="map-overlay-top">
          <ConnPill status={deviceConnStatus} lastPollAt={lastPollAt} />
        </div>

        {/* Bottom overlay: coordinates */}
        <div className="map-overlay-bottom">
          {device?.location?.coords && (
            <div className="map-coords mono">
              {device.location.coords}
              <span className="map-precision">±{device.location.precision}m</span>
            </div>
          )}
        </div>

        {/* Map controls */}
        <div className="map-controls">
          <div className="map-control-group">
            <button className="map-control" onClick={() => mapInstanceRef.current?.zoomIn()} aria-label="Acercar">
              <IconZoomIn width={14} height={14} />
            </button>
            <button className="map-control" onClick={() => mapInstanceRef.current?.zoomOut()} aria-label="Alejar">
              <IconZoomOut width={14} height={14} />
            </button>
          </div>
          <div className="map-control-group">
            <button className="map-control" onClick={flyToDevice} aria-label="Centrar en dispositivo">
              <IconTarget width={14} height={14} />
            </button>
          </div>
        </div>
      </div>

      {device ? (
        <DeviceDetailPanel
          device={device}
          ringing={ringing === device.id}
          onAction={onAction}
          activeCommands={activeCommands}
          deviceConnStatus={deviceConnStatus}
          lastPollAt={lastPollAt}
        />
      ) : (
        <div className="device-panel" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
          Sin dispositivos conectados
        </div>
      )}
    </div>
  );
}

function DeviceDetailPanel({ device, ringing, onAction, activeCommands = {}, deviceConnStatus = 'unknown', lastPollAt = null }) {
  const Icon = window.tracerDeviceIcon(device.type);
  const [tab, setTab] = React.useState('commands');

  const commandGroups = [
    {
      label: 'Vigilancia',
      hint: 'Captura datos del entorno sin alertar',
      items: [
        { id: 'photo',        icon: IconCamera,  label: 'Foto remota' },
        { id: 'audio',        icon: IconMic,     label: 'Audio ambiente' },
        { id: 'screen',       icon: IconScreen,  label: 'Pantalla' },
        { id: 'silent-call',  icon: IconRing,    label: 'Llamada silenciosa' },
        { id: 'callback',     icon: IconPhone,   label: 'Llamada retorno' },
      ],
    },
    {
      label: 'Localización',
      hint: 'Hacer notar el dispositivo o mejorar su posición',
      items: [
        { id: 'ring',     icon: IconRing,     label: 'Sonar',       active: ringing },
        { id: 'flash',    icon: IconFlash,    label: 'Linterna',    active: activeCommands.flash },
        { id: 'vibrate',  icon: IconVibrate,  label: 'Vibrar',      active: activeCommands.vibrate },
        { id: 'gps',      icon: IconBoltGPS, label: 'GPS preciso' },
        { id: 'locate',   icon: IconTarget,   label: 'Ubicar ahora' },
        { id: 'message',  icon: IconMessage,  label: 'Mensaje' },
        { id: 'geofence', icon: IconGeofence, label: 'Geocerca' },
      ],
    },
    {
      label: 'Seguridad',
      hint: 'Bloquear, ocultar y proteger remotamente',
      items: [
        { id: 'lost',     icon: IconLock,     label: 'Modo perdido' },
        { id: 'alert',    icon: IconBell,     label: 'Modo alerta',     active: activeCommands.alert },
        { id: 'keyguard', icon: IconShield,   label: 'Teclado seguro',  active: activeCommands.keyguard },
        { id: 'stealth',  icon: IconStealth,  label: 'Modo sigilo' },
        { id: 'apps',     icon: IconAppBlock, label: 'Bloquear apps' },
        { id: 'key',      icon: IconKey,      label: 'Nueva contraseña' },
      ],
    },
  ];

  return (
    <aside className="device-panel">
      <div className="device-panel-head">
        <div className="device-icon-wrap">
          <Icon width={18} height={18} />
        </div>
        <div className="device-panel-titles">
          <div className="device-panel-name">{device.name}</div>
          <div className="device-panel-model">{device.model}</div>
        </div>
        <div className={`status-pill status-pill-${device.status}`}>
          <span className={`status-dot ${device.status === 'online' ? 'status-dot-on' : 'status-dot-off'}`} />
          {device.status === 'online' ? 'En línea' : 'Fuera de línea'}
        </div>
      </div>

      <div className="device-panel-tabs">
        <button className={`panel-tab ${tab === 'commands' ? 'is-on' : ''}`} onClick={() => setTab('commands')}>Comandos</button>
        <button className={`panel-tab ${tab === 'info' ? 'is-on' : ''}`} onClick={() => setTab('info')}>Información</button>
      </div>

      {tab === 'info' && (
        <>
          <div className="device-panel-location">
            <div className="loc-row">
              <div className="loc-label">Ubicación</div>
              <div className="loc-value">{device.location.address}</div>
            </div>
            <div className="loc-row">
              <div className="loc-label">Ciudad</div>
              <div className="loc-value">{device.location.city}</div>
            </div>
            <div className="loc-row">
              <div className="loc-label">Coordenadas</div>
              <div className="loc-value mono">{device.location.coords}</div>
            </div>
            <div className="loc-row">
              <div className="loc-label">Visto</div>
              <div className="loc-value">{device.lastSeen}</div>
            </div>
          </div>

          <div className="device-panel-stats">
            <BatteryStat battery={device.battery} charging={device.charging} />
            <div className="stat-card">
              <div className="stat-card-label">Precisión</div>
              <div className="stat-card-value">±{device.location.precision} <span style={{ fontSize: 14 }}>m</span></div>
              <div className="stat-card-foot mono">GPS</div>
            </div>
          </div>
        </>
      )}

      {tab === 'commands' && (
        <>
          <div className="device-panel-location compact">
            <div className="loc-summary">
              <div>
                <div className="loc-summary-addr">{device.location.address}</div>
                <div className="loc-summary-meta">
                  <span className="mono">{device.location.coords}</span>
                  <span className="loc-summary-dot">·</span>
                  <span>±{device.location.precision}m</span>
                  <span className="loc-summary-dot">·</span>
                  <span>{device.lastSeen}</span>
                </div>
              </div>
              <div className="loc-summary-batt">
                <div className="mini-batt">
                  <span style={{
                    width: `${device.battery}%`,
                    background: device.battery < 20 ? 'var(--warning)' : device.battery < 50 ? 'var(--text)' : 'var(--success)'
                  }} />
                </div>
                <span className="mono">{device.battery}%{device.charging ? ' ⚡' : ''}</span>
              </div>
            </div>
          </div>

          <div className="cmd-groups">
            {commandGroups.map((g) => (
              <div key={g.label} className="cmd-group">
                <div className="cmd-group-head">
                  <div className="cmd-group-label">{g.label}</div>
                  <div className="cmd-group-hint">{g.hint}</div>
                </div>
                <div className="cmd-grid">
                  {g.items.map((it) => {
                    const ItemIcon = it.icon;
                    return (
                      <button
                        key={it.id}
                        className={`cmd-tile ${it.active ? 'is-active' : ''}`}
                        onClick={() => onAction(it.id, device.id)}
                      >
                        <div className="cmd-tile-icon"><ItemIcon width={16} height={16} /></div>
                        <div className="cmd-tile-label">{it.label}</div>
                        {it.active && <span className="cmd-tile-pulse" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}

            <div className="cmd-group">
              <div className="cmd-group-head">
                <div className="cmd-group-label cmd-group-label-danger">Crítico</div>
                <div className="cmd-group-hint">Acción irreversible · requiere confirmación tipada</div>
              </div>
              <button
                className="cmd-wipe-btn"
                onClick={() => onAction('wipe', device.id)}
              >
                <IconErase width={15} height={15} />
                <span>Borrar dispositivo</span>
                <IconChevronRight width={12} height={12} />
              </button>
            </div>
          </div>

          {deviceConnStatus === 'offline' && (
            <SmsFallbackPanel lastPollAt={lastPollAt} />
          )}
        </>
      )}
    </aside>
  );
}

// ── ConnPill: indicador de conectividad del dispositivo ───────────────────────

function ConnPill({ status, lastPollAt }) {
  const [, tick] = React.useReducer(n => n + 1, 0);
  React.useEffect(() => {
    const i = setInterval(() => tick(), 10_000);
    return () => clearInterval(i);
  }, []);

  const secAgo = lastPollAt ? Math.round((Date.now() - new Date(lastPollAt)) / 1000) : null;

  const label = {
    online:  'En vivo',
    idle:    'Conectado',
    offline: 'Sin datos',
    unknown: 'Esperando…',
  }[status] || 'Esperando…';

  const dotClass = {
    online:  'live-dot',
    idle:    'live-dot live-dot-idle',
    offline: 'live-dot live-dot-off',
    unknown: 'live-dot live-dot-off',
  }[status] || 'live-dot live-dot-off';

  const timeLabel = secAgo !== null ? (
    secAgo < 60  ? `${secAgo}s` :
    secAgo < 3600 ? `${Math.floor(secAgo / 60)}m` :
    `${Math.floor(secAgo / 3600)}h`
  ) : null;

  return (
    <div className="live-pill">
      <span className={dotClass} />
      <span>{label}</span>
      {timeLabel && status !== 'unknown' && (
        <span className="mono live-time">{timeLabel}</span>
      )}
      {status === 'online' && <span className="mono live-time"><LiveClock /></span>}
    </div>
  );
}

// ── SmsFallbackPanel: fallback SMS cuando el dispositivo está offline ─────────

function SmsFallbackPanel({ lastPollAt }) {
  const [open, setOpen] = React.useState(false);
  const [phone, setPhone] = React.useState(() => localStorage.getItem('tracer_device_phone') || '');
  const [pin, setPin] = React.useState(() => localStorage.getItem('tracer_command_pin') || '');
  const [copied, setCopied] = React.useState('');

  const savePhone = (v) => { setPhone(v); localStorage.setItem('tracer_device_phone', v); };
  const savePin = (v) => { setPin(v); localStorage.setItem('tracer_command_pin', v); };

  const copy = (cmd) => {
    const text = `${pin} ${cmd}`;
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(cmd);
      setTimeout(() => setCopied(''), 2000);
    });
  };

  const smsHref = (cmd) => {
    const body = encodeURIComponent(`${pin} ${cmd}`);
    return phone ? `sms:${phone}?body=${body}` : null;
  };

  const quickCmds = ['LOCATE', 'RING', 'ALERT_ON', 'LOCK Dispositivo perdido', 'PHOTO', 'STATUS'];

  const secAgo = lastPollAt ? Math.round((Date.now() - new Date(lastPollAt)) / 1000) : null;
  const lastContactLabel = secAgo === null ? '—' :
    secAgo < 3600 ? `hace ${Math.floor(secAgo / 60)} min` :
    `hace ${Math.floor(secAgo / 3600)} h`;

  return (
    <div className="sms-fallback">
      <button className="sms-fallback-header" onClick={() => setOpen(o => !o)}>
        <span className="sms-fallback-dot" />
        <span>Sin internet · {lastContactLabel}</span>
        <span className="sms-fallback-caret">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="sms-fallback-body">
          <p className="sms-fallback-hint">
            Envía comandos por SMS desde tu teléfono al dispositivo.
          </p>

          <div className="sms-fallback-fields">
            <label className="sms-field">
              <span>Número del dispositivo</span>
              <input type="tel" value={phone} onChange={e => savePhone(e.target.value)} placeholder="+521234567890" />
            </label>
            <label className="sms-field">
              <span>PIN de comandos</span>
              <input type="text" value={pin} onChange={e => savePin(e.target.value)} placeholder="1234" maxLength={8} />
            </label>
          </div>

          <div className="sms-cmd-list">
            {quickCmds.map(cmd => {
              const href = smsHref(cmd);
              return (
                <div key={cmd} className="sms-cmd-row">
                  <span className="sms-cmd-text mono">{pin} {cmd}</span>
                  <div className="sms-cmd-actions">
                    <button
                      className={`btn btn-sm btn-ghost ${copied === cmd ? 'sms-copied' : ''}`}
                      onClick={() => copy(cmd)}
                    >
                      {copied === cmd ? '✓ Copiado' : 'Copiar'}
                    </button>
                    {href && (
                      <a href={href} className="btn btn-sm btn-primary">SMS</a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function BatteryStat({ battery, charging }) {
  const color = battery < 20 ? 'var(--warning)' : battery < 50 ? 'var(--text)' : 'var(--success)';
  return (
    <div className="stat-card">
      <div className="stat-card-label">Batería</div>
      <div className="stat-card-value">
        {battery}%
        {charging && <span className="charging-bolt">⚡</span>}
      </div>
      <div className="battery-bar">
        <div className="battery-bar-fill" style={{ width: `${battery}%`, background: color }} />
      </div>
    </div>
  );
}

window.MapView = MapView;
