// Tracer — root app con API real

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "accent": "#2563EB",
  "dark": false,
  "density": "regular",
}/*EDITMODE-END*/;

// Mapeo de comandos de la UI a comandos del backend
const KIND_TO_CMD = {
  ring: 'RING',
  lost: 'LOCK',
  wipe: 'WIPE',
  photo: 'PHOTO',
  audio: 'AUDIO',
  screen: 'SCREENSHOT',
  'silent-call': 'SILENT_CALL',
  flash: 'FLASH',
  vibrate: 'VIBRATE',
  gps: 'GPS_HIGH',
  message: 'MESSAGE',
  stealth: 'STEALTH',
  apps: 'BLOCK_APPS',
  key: 'RESET_PIN',
};

const COMMAND_TOASTS = {
  ring: { tone: 'default', title: (d) => `Sonando ${d.name}`, detail: 'Se detendrá automáticamente.' },
  lost: { tone: 'warn', title: () => 'Modo perdido activado', detail: 'El dispositivo se bloqueará.' },
  wipe: { tone: 'danger', title: () => 'Borrado remoto iniciado', detail: 'Se ejecutará al conectarse a internet.' },
  photo: { tone: 'default', title: (d) => `Foto solicitada en ${d.name}`, detail: 'Aparecerá en el mapa.' },
  audio: { tone: 'default', title: (d) => `Audio solicitado de ${d.name}`, detail: 'Disponible en Actividad.' },
  screen: { tone: 'default', title: (d) => `Pantalla solicitada de ${d.name}`, detail: 'Imagen guardada.' },
  'silent-call': { tone: 'default', title: (d) => `Llamada con ${d.name}`, detail: 'Sin registro en el dispositivo.' },
  flash: { tone: 'default', title: (d) => `Linterna encendida en ${d.name}`, detail: 'Parpadeará durante 60 segundos.' },
  vibrate: { tone: 'default', title: (d) => `${d.name} vibrando`, detail: 'Durante 60 segundos.' },
  gps: { tone: 'default', title: (d) => `GPS preciso activado en ${d.name}`, detail: 'Precisión mejorada.' },
  geofence: { tone: 'default', title: () => 'Geocerca creada', detail: 'Te avisaremos al cambio de zona.' },
  message: { tone: 'default', title: (d) => `Mensaje enviado a ${d.name}`, detail: 'Aparecerá en pantalla completa.' },
  stealth: { tone: 'warn', title: () => 'Modo sigilo activado', detail: 'El dispositivo no mostrará rastros.' },
  apps: { tone: 'warn', title: () => 'Apps sensibles bloqueadas', detail: 'Banca, correo y mensajería deshabilitadas.' },
  key: { tone: 'warn', title: (d) => `Contraseña cambiada en ${d.name}`, detail: 'Nueva clave aplicada.' },
};

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [screen, setScreen] = React.useState('loading');
  const [view, setView] = React.useState('map');

  // Single real device from API
  const [device, setDevice] = React.useState(null);
  const [statusOnline, setStatusOnline] = React.useState(null);

  // History items from API
  const [historyItems, setHistoryItems] = React.useState([]);

  // Command log from API (for activity view)
  const [cmdLog, setCmdLog] = React.useState([]);

  // Notifications from WebSocket events
  const [notifications, setNotifications] = React.useState([]);

  // Username
  const [username, setUsername] = React.useState('');

  // Modal state
  const [modal, setModal] = React.useState(null);
  const [ringingId, setRingingId] = React.useState(null);
  const [toast, setToast] = React.useState(null);

  // Refs for stable closures
  const cmdLogRef = React.useRef([]);
  const deviceRef = React.useRef(null);
  const offlineTimerRef = React.useRef(null);
  const prevStatusRef = React.useRef(null);
  const alertTimerRef = React.useRef(null);
  const handleWsMessageRef = React.useRef(null);

  React.useEffect(() => { cmdLogRef.current = cmdLog; }, [cmdLog]);
  React.useEffect(() => { deviceRef.current = device; }, [device]);

  // Theme
  React.useEffect(() => {
    document.documentElement.style.setProperty('--accent', t.accent);
    document.documentElement.dataset.theme = t.dark ? 'dark' : 'light';
    document.documentElement.dataset.density = t.density;
  }, [t.accent, t.dark, t.density]);

  // Derived
  const devices = device ? [device] : [];
  const selectedId = device ? device.id : null;
  const unread = notifications.filter(n => n.unread).length;

  // ── Status ──────────────────────────────────────────────────────────────
  const setStatus = React.useCallback((online) => {
    if (online) {
      clearTimeout(offlineTimerRef.current);
      offlineTimerRef.current = null;
      if (prevStatusRef.current === true) return;
      prevStatusRef.current = true;
      setStatusOnline(true);
    } else {
      if (offlineTimerRef.current) return;
      offlineTimerRef.current = setTimeout(() => {
        offlineTimerRef.current = null;
        if (prevStatusRef.current === true) {
          tracerSendNotification('Dispositivo desconectado', 'Tracer dejó de reportar ubicación');
        }
        prevStatusRef.current = false;
        setStatusOnline(false);
      }, 4000);
    }
  }, []);

  // ── Build device object from API response ───────────────────────────────
  const updateDeviceFromLatest = React.useCallback(async (latest) => {
    if (!latest) return;
    const geocoded = await tracerReverseGeocode(latest.latitude, latest.longitude).catch(() => ({
      name: `${latest.latitude.toFixed(4)}, ${latest.longitude.toFixed(4)}`,
      sub: '',
    }));

    const bat = latest.battery_level ?? 0;
    const name = latest.device_name || latest.device_id || 'Dispositivo';

    setDevice(prev => {
      if (bat <= 15 && (!prev || prev.battery > 15)) {
        tracerSendNotification('Batería baja', `Batería al ${bat}% en ${name}`);
      }
      const lat = latest.latitude;
      const lon = latest.longitude;
      const absLat = Math.abs(lat).toFixed(4);
      const absLon = Math.abs(lon).toFixed(4);
      const coordStr = `${absLat}° ${lat >= 0 ? 'N' : 'S'}, ${absLon}° ${lon >= 0 ? 'E' : 'W'}`;
      return {
        id: latest.device_id || 'device',
        name,
        type: 'phone',
        model: latest.device_id || '—',
        color: '',
        os: '',
        status: 'online',
        battery: bat,
        charging: latest.is_charging || false,
        lastSeen: tracerRelativeTime(latest.timestamp),
        location: {
          address: geocoded.name,
          city: geocoded.sub || geocoded.name,
          coords: coordStr,
          precision: latest.accuracy || 10,
        },
        lat,
        lon,
        accuracy: latest.accuracy || 10,
        isCurrent: true,
      };
    });
  }, []);

  // ── Fetch history ─────────────────────────────────────────────────────
  const fetchHistory = React.useCallback(async () => {
    try {
      const history = await tracerApiFetch('/api/location/history?limit=100');
      if (!history || history.length === 0) { setHistoryItems([]); return; }

      const seen = new Set(), unique = [];
      for (const r of history) {
        const key = `${r.latitude.toFixed(3)},${r.longitude.toFixed(3)}`;
        if (!seen.has(key)) { seen.add(key); unique.push(r); if (unique.length >= 20) break; }
      }

      const geocoded = await Promise.all(unique.map(r =>
        tracerReverseGeocode(r.latitude, r.longitude).catch(() => ({
          name: `${r.latitude.toFixed(4)}, ${r.longitude.toFixed(4)}`, sub: '',
        }))
      ));

      setHistoryItems(unique.map((r, i) => ({
        lat: r.latitude, lon: r.longitude,
        name: geocoded[i].name, sub: geocoded[i].sub,
        ts: tracerFormatHistoryTime(r.timestamp),
        timestamp: r.timestamp,
      })));
    } catch {}
  }, []);

  // ── Fetch command log ─────────────────────────────────────────────────
  const fetchCmdLog = React.useCallback(async () => {
    try {
      const history = await tracerApiFetch('/api/command/history?limit=20');
      if (history) {
        setCmdLog(history.map(cmd => ({
          ...cmd,
          ts: tracerFormatHistoryTime(cmd.created_at),
        })));
      }
    } catch {}
  }, []);

  // ── Fetch photos ──────────────────────────────────────────────────────
  const fetchPhotos = React.useCallback(async () => {
    try {
      const { apiUrl, apiToken } = tracerGetSettings();
      const res = await fetch(`${apiUrl}/api/photo/list?limit=6`, {
        headers: { Authorization: `Bearer ${apiToken}` },
      });
      if (!res.ok) return;
      const list = await res.json();
      if (!list || list.length === 0) return;
      // Photos are available but this UI shows them via the photo command flow
    } catch {}
  }, []);

  // ── Send command to backend ───────────────────────────────────────────
  const sendCmd = React.useCallback(async (command, args = '') => {
    const result = await tracerApiFetch('/api/command', {
      method: 'POST',
      body: JSON.stringify({ command, args }),
    });
    const entry = {
      id: result.id, command, args,
      status: 'pending', result: '',
      created_at: new Date().toISOString(),
      ts: tracerFormatHistoryTime(new Date().toISOString()),
    };
    setCmdLog(prev => [entry, ...prev].slice(0, 20));
    return result;
  }, []);

  // ── Add notification ─────────────────────────────────────────────────
  const addNotification = React.useCallback((notif) => {
    setNotifications(prev => [{
      id: 'n-' + Date.now(),
      deviceId: deviceRef.current?.id || '',
      type: notif.type || 'system',
      title: notif.title,
      detail: notif.detail || '',
      time: new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }),
      unread: true,
    }, ...prev]);
  }, []);

  // ── Handle device alert from WebSocket ───────────────────────────────
  const handleDeviceAlert = React.useCallback((data) => {
    if (data.type === 'pin_fail') {
      tracerSendNotification('Intento de acceso fallido', `Intento #${data.attempt_num ?? 1}`);
      addNotification({
        type: 'security',
        title: 'Intento de acceso fallido',
        detail: `Intento #${data.attempt_num ?? 1} — foto capturada automáticamente`,
      });
      return;
    }
    const labels = { sim_change: 'Alerta: SIM cambiada' };
    const title = labels[data.type] || 'Alerta del dispositivo';
    tracerSendNotification(title, data.message || '');
    addNotification({ type: 'security', title, detail: data.message || '' });
  }, [addNotification]);

  // ── Handle WebSocket messages ─────────────────────────────────────────
  const handleWsMessage = React.useCallback(async (msg) => {
    switch (msg.type) {
      case 'location':
        await updateDeviceFromLatest(msg.data);
        setStatus(true);
        break;
      case 'cmd_result': {
        const found = cmdLogRef.current.some(c => c.id === msg.data.id);
        if (!found) {
          fetchCmdLog();
        } else {
          setCmdLog(prev => prev.map(c =>
            c.id === msg.data.id
              ? { ...c, status: 'executed', result: msg.data.result || '' }
              : c
          ));
        }
        break;
      }
      case 'photo':
        addNotification({
          type: 'system',
          title: 'Nueva foto capturada',
          detail: msg.data?.filename || '',
        });
        break;
      case 'geofence_breach':
        tracerSendNotification(
          'Alerta: zona segura abandonada',
          `El dispositivo salió de la zona (${Math.round(msg.data.distance)}m del centro)`
        );
        addNotification({
          type: 'security',
          title: 'Dispositivo salió de la zona segura',
          detail: `Distancia al centro: ${Math.round(msg.data.distance)}m`,
        });
        break;
      case 'alert':
        handleDeviceAlert(msg.data);
        break;
    }
  }, [updateDeviceFromLatest, setStatus, fetchCmdLog, addNotification, handleDeviceAlert]);

  // Keep WS handler ref current every render
  React.useEffect(() => {
    handleWsMessageRef.current = handleWsMessage;
  });

  // ── Refresh location + history ────────────────────────────────────────
  const refresh = React.useCallback(async () => {
    try {
      const [latest, history] = await Promise.all([
        tracerApiFetch('/api/location/latest'),
        tracerApiFetch('/api/location/history?limit=100'),
      ]);
      setStatus(true);
      if (latest) await updateDeviceFromLatest(latest);
      else setDevice(prev => prev ? { ...prev, status: 'offline' } : null);

      if (history && history.length > 0) {
        const seen = new Set(), unique = [];
        for (const r of history) {
          const key = `${r.latitude.toFixed(3)},${r.longitude.toFixed(3)}`;
          if (!seen.has(key)) { seen.add(key); unique.push(r); if (unique.length >= 20) break; }
        }
        const geocoded = await Promise.all(unique.map(r =>
          tracerReverseGeocode(r.latitude, r.longitude).catch(() => ({
            name: `${r.latitude.toFixed(4)}, ${r.longitude.toFixed(4)}`, sub: '',
          }))
        ));
        setHistoryItems(unique.map((r, i) => ({
          lat: r.latitude, lon: r.longitude,
          name: geocoded[i].name, sub: geocoded[i].sub,
          ts: tracerFormatHistoryTime(r.timestamp),
          timestamp: r.timestamp,
        })));
      }
    } catch {
      setStatus(false);
    }
  }, [setStatus, updateDeviceFromLatest]);

  const refreshRef = React.useRef(refresh);
  React.useEffect(() => { refreshRef.current = refresh; }, [refresh]);

  // ── Auth check on mount ───────────────────────────────────────────────
  React.useEffect(() => {
    async function checkAuth() {
      const { apiToken, apiUsername } = tracerGetSettings();
      if (!apiToken) { setScreen('login'); return; }
      setUsername(apiUsername || '');
      try {
        const res = await fetch('/api/location/latest', {
          headers: { Authorization: `Bearer ${apiToken}` },
        });
        if (res.status === 401) {
          localStorage.removeItem('tracer_token');
          setScreen('login');
        } else {
          setScreen('app');
        }
      } catch {
        setScreen('app');
      }
    }
    checkAuth();
  }, []);

  // ── Start data fetching after login ───────────────────────────────────
  React.useEffect(() => {
    if (screen !== 'app') return;

    const { apiUsername } = tracerGetSettings();
    setUsername(apiUsername || '');

    refreshRef.current();
    fetchCmdLog();

    const refreshId = setInterval(() => refreshRef.current(), 30_000);
    const cmdId = setInterval(fetchCmdLog, 120_000);

    // WebSocket
    const { apiUrl, apiToken } = tracerGetSettings();
    let stopped = false, ws = null, reconnectDelay = 1000, reconnectTimer = null;

    const connect = () => {
      if (stopped || !apiToken) return;
      const wsUrl = apiUrl.replace(/^https/, 'wss').replace(/^http/, 'ws').replace(/\/$/, '') +
        '/ws?token=' + encodeURIComponent(apiToken);
      ws = new WebSocket(wsUrl);
      ws.onopen = () => { reconnectDelay = 1000; setStatus(true); };
      ws.onerror = () => {};
      ws.onclose = () => {
        setStatus(false);
        ws = null;
        if (stopped) return;
        reconnectDelay = Math.min(reconnectDelay * 2, 30_000);
        reconnectTimer = setTimeout(connect, reconnectDelay);
      };
      ws.onmessage = async (e) => {
        try { await handleWsMessageRef.current?.(JSON.parse(e.data)); } catch {}
      };
    };
    connect();

    return () => {
      stopped = true;
      clearInterval(refreshId);
      clearInterval(cmdId);
      clearTimeout(reconnectTimer);
      ws?.close();
    };
  }, [screen, fetchCmdLog, setStatus]);

  // ── Logout ────────────────────────────────────────────────────────────
  const doLogout = React.useCallback(() => {
    localStorage.removeItem('tracer_token');
    localStorage.removeItem('tracer_username');
    setDevice(null);
    setStatusOnline(null);
    setCmdLog([]);
    setNotifications([]);
    setHistoryItems([]);
    setScreen('login');
  }, []);

  // ── Toast helper ──────────────────────────────────────────────────────
  const fireToast = React.useCallback((kind, dev) => {
    const cfg = COMMAND_TOASTS[kind];
    if (!cfg || !dev) return;
    setToast({ tone: cfg.tone, title: cfg.title(dev), detail: cfg.detail });
  }, []);

  // ── Modal helpers ─────────────────────────────────────────────────────
  const closeModal = () => setModal(null);
  const modalDevice = modal ? (devices.find(d => d.id === modal.deviceId) || devices[0] || null) : null;

  const onAction = React.useCallback((kind, deviceId) => {
    setModal({ kind, deviceId });
  }, []);

  // ── Command confirmations ─────────────────────────────────────────────
  const confirmRing = React.useCallback(async () => {
    const dev = modalDevice;
    setRingingId(dev?.id || null);
    setTimeout(() => {
      setRingingId(null);
      sendCmd('RING_STOP').catch(() => {});
    }, 6000);
    setTimeout(() => setModal(null), 6000);
    try {
      await sendCmd('RING');
      fireToast('ring', dev);
      fetchCmdLog();
    } catch {}
  }, [modalDevice, sendCmd, fireToast, fetchCmdLog]);

  const confirmLost = React.useCallback(async (message, phone) => {
    const dev = modalDevice;
    setModal(null);
    const args = [message, phone].filter(Boolean).join('|');
    try {
      await sendCmd('LOCK', args);
      fireToast('lost', dev);
      fetchCmdLog();
      addNotification({
        type: 'security',
        title: `Modo perdido activado en ${dev?.name || 'dispositivo'}`,
        detail: 'El dispositivo se bloqueará al conectarse.',
      });
    } catch {}
  }, [modalDevice, sendCmd, fireToast, fetchCmdLog, addNotification]);

  const confirmWipe = React.useCallback(async () => {
    const dev = modalDevice;
    setModal(null);
    try {
      await sendCmd('WIPE', 'CONFIRM');
      fireToast('wipe', dev);
      fetchCmdLog();
    } catch {}
  }, [modalDevice, sendCmd, fireToast, fetchCmdLog]);

  const confirmGeneric = React.useCallback(async (kind, detail) => {
    const dev = modalDevice;
    setModal(null);
    const command = KIND_TO_CMD[kind];
    if (command) {
      try {
        await sendCmd(command, detail || '');
        fireToast(kind, dev);
        fetchCmdLog();
      } catch {}
    } else {
      fireToast(kind, dev);
    }
  }, [modalDevice, sendCmd, fireToast, fetchCmdLog]);

  // ── Render ────────────────────────────────────────────────────────────
  if (screen === 'loading') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: 'var(--text-muted)', fontSize: 13 }}>
        Cargando…
      </div>
    );
  }

  if (screen === 'login') {
    return (
      <>
        <LoginScreen onLogin={() => setScreen('app')} />
        <TweakControls t={t} setTweak={setTweak} />
      </>
    );
  }

  return (
    <div className="app-shell">
      <TracerSidebar
        view={view} setView={setView} unread={unread}
        devices={devices}
        username={username}
        onLogout={doLogout}
      />

      <main className="app-main">
        {view === 'map' && (
          <MapView
            devices={devices}
            selectedId={selectedId}
            setSelectedId={() => {}}
            ringing={ringingId}
            onAction={onAction}
            statusOnline={statusOnline}
          />
        )}
        {view === 'devices' && (
          <DevicesView devices={devices} setSelectedId={() => {}} setView={setView} onAction={onAction} />
        )}
        {view === 'activity' && (
          <ActivityView cmdLog={cmdLog} devices={devices} />
        )}
        {view === 'history' && (
          <HistoryView
            devices={devices}
            selectedId={selectedId}
            setSelectedId={() => {}}
            historyItems={historyItems}
          />
        )}
        {view === 'notifications' && (
          <NotificationsView
            notifications={notifications}
            devices={devices}
            onMarkRead={(id) => setNotifications(p => p.map(n => n.id === id ? { ...n, unread: false } : n))}
            onClearAll={() => setNotifications(p => p.map(n => ({ ...n, unread: false })))}
          />
        )}
        {view === 'settings' && <SettingsView username={username} />}
      </main>

      <RingModal open={modal?.kind === 'ring'} device={modalDevice} ringing={ringingId === modalDevice?.id}
        onClose={closeModal} onConfirm={confirmRing} />
      <LostModal open={modal?.kind === 'lost'} device={modalDevice}
        onClose={closeModal} onConfirm={confirmLost} />
      <WipeModal open={modal?.kind === 'wipe'} device={modalDevice}
        onClose={closeModal} onConfirm={confirmWipe} />

      <PhotoModal open={modal?.kind === 'photo'} device={modalDevice}
        onClose={closeModal} onConfirm={() => confirmGeneric('photo', '')} />
      <AudioModal open={modal?.kind === 'audio'} device={modalDevice}
        onClose={closeModal} onConfirm={() => confirmGeneric('audio', '')} />
      <ScreenshotModal open={modal?.kind === 'screen'} device={modalDevice}
        onClose={closeModal} onConfirm={() => confirmGeneric('screen', '')} />
      <SilentCallModal open={modal?.kind === 'silent-call'} device={modalDevice}
        onClose={closeModal} onConfirm={() => confirmGeneric('silent-call', '')} />
      <MessageModal open={modal?.kind === 'message'} device={modalDevice}
        onClose={closeModal} onConfirm={(text) => confirmGeneric('message', text)} />
      <GeofenceModal open={modal?.kind === 'geofence'} device={modalDevice}
        onClose={closeModal} onConfirm={(name, radius) => confirmGeneric('geofence', `${name}|${radius}`)} />

      <SimpleConfirmModal kind="flash" open={modal?.kind === 'flash'} device={modalDevice}
        onClose={closeModal} onConfirm={() => confirmGeneric('flash', '')} />
      <SimpleConfirmModal kind="vibrate" open={modal?.kind === 'vibrate'} device={modalDevice}
        onClose={closeModal} onConfirm={() => confirmGeneric('vibrate', '')} />
      <SimpleConfirmModal kind="gps" open={modal?.kind === 'gps'} device={modalDevice}
        onClose={closeModal} onConfirm={() => confirmGeneric('gps', '')} />
      <SimpleConfirmModal kind="stealth" open={modal?.kind === 'stealth'} device={modalDevice}
        onClose={closeModal} onConfirm={() => confirmGeneric('stealth', '')} />
      <SimpleConfirmModal kind="apps" open={modal?.kind === 'apps'} device={modalDevice}
        onClose={closeModal} onConfirm={() => confirmGeneric('apps', '')} />
      <SimpleConfirmModal kind="key" open={modal?.kind === 'key'} device={modalDevice}
        onClose={closeModal} onConfirm={() => {
          const pin = Math.random().toString(36).slice(2, 8).toUpperCase();
          confirmGeneric('key', pin);
        }} />

      <Toast toast={toast} onDismiss={() => setToast(null)} />
      <TweakControls t={t} setTweak={setTweak} />
    </div>
  );
}

function TweakControls({ t, setTweak }) {
  return (
    <TweaksPanel>
      <TweakSection label="Apariencia" />
      <TweakToggle label="Modo oscuro" value={t.dark} onChange={(v) => setTweak('dark', v)} />
      <TweakColor label="Color de acento" value={t.accent}
        options={['#2563EB', '#0F62FE', '#3E63DD', '#7C3AED', '#16A34A', '#EA580C']}
        onChange={(v) => setTweak('accent', v)} />
      <TweakRadio label="Densidad" value={t.density}
        options={['compact', 'regular', 'comfy']}
        onChange={(v) => setTweak('density', v)} />
    </TweaksPanel>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
