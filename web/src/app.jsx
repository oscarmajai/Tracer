// Tracer — root app con API real

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "accent": "#2563EB",
  "dark": false,
  "density": "regular",
}/*EDITMODE-END*/;

// Mapeo de comandos de la UI a comandos del backend
const KIND_TO_CMD = {
  ring:          'RING',
  lost:          'LOCK',
  wipe:          'WIPE',
  photo:         'PHOTO',
  audio:         'AUDIO',
  screen:        'SCREENSHOT',
  'silent-call': 'SILENT_CALL',
  flash:         'FLASH',
  vibrate:       'VIBRATE',
  gps:           'GPS_HIGH',
  locate:        'LOCATE',
  message:       'MESSAGE',
  callback:      'CALLBACK',
  stealth:       'STEALTH',
  apps:          'BLOCK_APPS',
  key:           'RESET_PIN',
  // alert y keyguard se envían directamente desde onAction (son toggles)
};

const COMMAND_TOASTS = {
  ring:          { tone: 'default', title: (d) => `Sonando ${d.name}`, detail: 'Se detendrá automáticamente.' },
  lost:          { tone: 'warn',    title: () => 'Modo perdido activado', detail: 'El dispositivo se bloqueará.' },
  wipe:          { tone: 'danger',  title: () => 'Borrado remoto iniciado', detail: 'Se ejecutará al conectarse a internet.' },
  photo:         { tone: 'default', title: (d) => `Foto solicitada en ${d.name}`, detail: 'Aparecerá en Actividad.' },
  audio:         { tone: 'default', title: (d) => `Audio solicitado de ${d.name}`, detail: 'Disponible en Actividad.' },
  screen:        { tone: 'default', title: (d) => `Pantalla solicitada de ${d.name}`, detail: 'Imagen guardada.' },
  'silent-call': { tone: 'default', title: (d) => `Llamada silenciosa desde ${d.name}`, detail: 'Sin registro en el dispositivo.' },
  flash:         { tone: 'default', title: (d) => `Linterna encendida en ${d.name}`, detail: '60 segundos · toca de nuevo para apagar.' },
  vibrate:       { tone: 'default', title: (d) => `${d.name} vibrando`, detail: '60 segundos · toca de nuevo para detener.' },
  gps:           { tone: 'default', title: (d) => `GPS preciso activado en ${d.name}`, detail: 'Polling cada 10s.' },
  locate:        { tone: 'default', title: (d) => `Ubicación forzada en ${d.name}`, detail: 'El mapa se actualizará.' },
  geofence:      { tone: 'default', title: () => 'Geocerca creada', detail: 'Te avisaremos al cambio de zona.' },
  message:       { tone: 'default', title: (d) => `Mensaje enviado a ${d.name}`, detail: 'Aparecerá en pantalla completa.' },
  callback:      { tone: 'default', title: (d) => `Llamada iniciada desde ${d.name}`, detail: 'Sin registro en el dispositivo.' },
  stealth:       { tone: 'warn',    title: () => 'Modo sigilo activado', detail: 'El dispositivo no mostrará rastros.' },
  apps:          { tone: 'warn',    title: () => 'Apps sensibles bloqueadas', detail: 'Banca, correo y mensajería deshabilitadas.' },
  key:           { tone: 'warn',    title: (d) => `Contraseña cambiada en ${d.name}`, detail: 'Nueva clave aplicada.' },
  alert_on:      { tone: 'warn',    title: () => 'Modo alerta activado', detail: 'Polling cada 10 segundos.' },
  alert_off:     { tone: 'default', title: () => 'Modo alerta desactivado', detail: 'Polling normal restaurado.' },
  keyguard_on:   { tone: 'warn',    title: () => 'Teclado seguro activado', detail: 'Cámara y notificaciones ocultadas en bloqueo.' },
  keyguard_off:  { tone: 'default', title: () => 'Teclado seguro desactivado', detail: 'Funciones de bloqueo restauradas.' },
};

const NOTIF_STORAGE_KEY = 'tracer_notifications';
const NOTIF_MAX = 60;

const ALERT_TITLES = {
  pin_fail: 'Intento de acceso fallido',
  sim_change: 'Alerta: SIM cambiada',
};

// Mapea una alerta del backend (evento WS o fila de /api/alert/history) a la
// forma de notificación que usa la UI. `id` es estable para poder deduplicar.
function tracerAlertToNotif(a) {
  const title = ALERT_TITLES[a.type] || 'Alerta del dispositivo';
  const detail = a.type === 'pin_fail'
    ? `Intento #${a.attempt_num ?? 1} — foto capturada automáticamente`
    : (a.message || '');
  const when = a.timestamp ? new Date(a.timestamp) : new Date();
  return {
    id: a.id != null ? 'alert-' + a.id : 'n-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
    deviceId: a.device_id || '',
    type: 'security',
    title,
    detail,
    time: when.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }),
    ts: when.toISOString(),
    unread: true,
  };
}

function tracerLoadStoredNotifs() {
  try {
    const raw = localStorage.getItem(NOTIF_STORAGE_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [screen, setScreen] = React.useState('login');
  const [view, setView] = React.useState('map');

  // Single real device from API
  const [device, setDevice] = React.useState(null);
  const [statusOnline, setStatusOnline] = React.useState(null);

  // History items from API
  const [historyItems, setHistoryItems] = React.useState([]);

  // Command log from API (for activity view)
  const [cmdLog, setCmdLog] = React.useState([]);

  // Notifications: eventos WS en vivo + historial persistido de /api/alert/history
  const [notifications, setNotifications] = React.useState(tracerLoadStoredNotifs);

  // Username
  const [username, setUsername] = React.useState('');

  // Modal state
  const [modal, setModal] = React.useState(null);
  const [ringingId, setRingingId] = React.useState(null);
  const [toast, setToast] = React.useState(null);

  // Estados de comandos toggle (flash, vibrate, alert, keyguard)
  const [flashActive, setFlashActive] = React.useState(false);
  const [vibrateActive, setVibrateActive] = React.useState(false);
  const [alertActive, setAlertActive] = React.useState(false);
  const [keyguardActive, setKeyguardActive] = React.useState(false);

  // Refs for stable closures
  const cmdLogRef = React.useRef([]);
  const deviceRef = React.useRef(null);
  const offlineTimerRef = React.useRef(null);
  const prevStatusRef = React.useRef(null);
  const alertTimerRef = React.useRef(null);
  const handleWsMessageRef = React.useRef(null);
  // Refs de toggles para onAction sin dependencias de estado
  const flashActiveRef = React.useRef(false);
  const vibrateActiveRef = React.useRef(false);
  const alertActiveRef = React.useRef(false);
  const keyguardActiveRef = React.useRef(false);

  React.useEffect(() => { cmdLogRef.current = cmdLog; }, [cmdLog]);
  React.useEffect(() => { deviceRef.current = device; }, [device]);
  React.useEffect(() => { flashActiveRef.current = flashActive; }, [flashActive]);
  React.useEffect(() => { vibrateActiveRef.current = vibrateActive; }, [vibrateActive]);
  React.useEffect(() => { alertActiveRef.current = alertActive; }, [alertActive]);
  React.useEffect(() => { keyguardActiveRef.current = keyguardActive; }, [keyguardActive]);

  // Theme
  React.useEffect(() => {
    document.documentElement.style.setProperty('--accent', t.accent);
    document.documentElement.dataset.theme = t.dark ? 'dark' : 'light';
    document.documentElement.dataset.density = t.density;
  }, [t.accent, t.dark, t.density]);

  // Derived
  const devices = device ? [device] : [];
  const activeCommands = { flash: flashActive, vibrate: vibrateActive, alert: alertActive, keyguard: keyguardActive };
  const selectedId = device ? device.id : null;
  const unread = notifications.filter(n => n.unread).length;

  // Estado de conectividad del dispositivo basado en last_poll_at
  const deviceConnStatus = React.useMemo(() => {
    const pollAt = device?.lastPollAt;
    if (!pollAt) return 'unknown';
    const secAgo = (Date.now() - new Date(pollAt)) / 1000;
    if (secAgo < 35) return 'online';
    if (secAgo < 300) return 'idle';
    return 'offline';
  }, [device?.lastPollAt]);

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
        lastPollAt: latest.last_poll_at || null,
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
    const id = notif.id || 'n-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
    setNotifications(prev => {
      if (prev.some(n => n.id === id)) return prev;
      const entry = {
        id,
        deviceId: notif.deviceId || deviceRef.current?.id || '',
        type: notif.type || 'system',
        title: notif.title,
        detail: notif.detail || '',
        time: notif.time || new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }),
        ts: notif.ts || new Date().toISOString(),
        unread: notif.unread !== false,
      };
      return [entry, ...prev].slice(0, NOTIF_MAX);
    });
  }, []);

  // Persistir notificaciones para que sobrevivan a un recarga del panel
  React.useEffect(() => {
    try { localStorage.setItem(NOTIF_STORAGE_KEY, JSON.stringify(notifications)); } catch {}
  }, [notifications]);

  // ── Hidratar historial de alertas desde el backend ──────────────────
  const hydrateAlerts = React.useCallback(async () => {
    try {
      const rows = await tracerApiFetch('/api/alert/history?limit=50');
      if (!Array.isArray(rows) || rows.length === 0) return;
      setNotifications(prev => {
        const known = new Set(prev.map(n => n.id));
        const fresh = rows
          .map(tracerAlertToNotif)
          .filter(n => !known.has(n.id))
          .map(n => ({ ...n, unread: false })); // el historial no cuenta como no leído
        if (fresh.length === 0) return prev;
        return [...prev, ...fresh]
          .sort((a, b) => (b.ts || '').localeCompare(a.ts || ''))
          .slice(0, NOTIF_MAX);
      });
    } catch {}
  }, []);

  // ── Handle device alert from WebSocket ───────────────────────────────
  const handleDeviceAlert = React.useCallback((data) => {
    const notif = tracerAlertToNotif(data);
    tracerSendNotification(notif.title, notif.detail);
    addNotification(notif);
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
      case 'audio':
        addNotification({
          type: 'system',
          title: 'Grabación de audio lista',
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
      default:
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

  // El auth check lo maneja LoginScreen directamente

  // ── Start data fetching after login ───────────────────────────────────
  React.useEffect(() => {
    if (screen !== 'app') return;

    const { apiUsername } = tracerGetSettings();
    setUsername(apiUsername || '');

    refreshRef.current();
    fetchCmdLog();
    hydrateAlerts();

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
  }, [screen, fetchCmdLog, setStatus, hydrateAlerts]);

  // ── Logout ────────────────────────────────────────────────────────────
  const doLogout = React.useCallback(() => {
    localStorage.removeItem('tracer_token');
    localStorage.removeItem('tracer_username');
    localStorage.removeItem(NOTIF_STORAGE_KEY);
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
    const dev = deviceRef.current;

    switch (kind) {
      case 'locate':
        sendCmd('LOCATE').then(() => fetchCmdLog()).catch(() => {});
        if (dev) fireToast('locate', dev);
        return;

      case 'alert': {
        const next = !alertActiveRef.current;
        setAlertActive(next);
        alertActiveRef.current = next;
        sendCmd(next ? 'ALERT_ON' : 'ALERT_OFF').then(() => fetchCmdLog()).catch(() => {
          setAlertActive(!next);
          alertActiveRef.current = !next;
        });
        if (dev) fireToast(next ? 'alert_on' : 'alert_off', dev);
        return;
      }

      case 'keyguard': {
        const next = !keyguardActiveRef.current;
        setKeyguardActive(next);
        keyguardActiveRef.current = next;
        sendCmd(next ? 'KEYGUARD_ON' : 'KEYGUARD_OFF').then(() => fetchCmdLog()).catch(() => {
          setKeyguardActive(!next);
          keyguardActiveRef.current = !next;
        });
        if (dev) fireToast(next ? 'keyguard_on' : 'keyguard_off', dev);
        return;
      }

      case 'flash':
        if (flashActiveRef.current) {
          setFlashActive(false);
          flashActiveRef.current = false;
          sendCmd('FLASH_STOP').then(() => fetchCmdLog()).catch(() => {});
          return;
        }
        break;

      case 'vibrate':
        if (vibrateActiveRef.current) {
          setVibrateActive(false);
          vibrateActiveRef.current = false;
          sendCmd('VIBRATE_STOP').then(() => fetchCmdLog()).catch(() => {});
          return;
        }
        break;

      default:
        break;
    }
    setModal({ kind, deviceId });
  }, [sendCmd, fetchCmdLog, fireToast]);

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
        // Activar estado visual para comandos con duración y auto-reset a los 65s
        if (kind === 'flash') {
          setFlashActive(true);
          flashActiveRef.current = true;
          setTimeout(() => { setFlashActive(false); flashActiveRef.current = false; }, 65_000);
        }
        if (kind === 'vibrate') {
          setVibrateActive(true);
          vibrateActiveRef.current = true;
          setTimeout(() => { setVibrateActive(false); vibrateActiveRef.current = false; }, 65_000);
        }
      } catch {}
    } else {
      fireToast(kind, dev);
    }
  }, [modalDevice, sendCmd, fireToast, fetchCmdLog]);

  // Comandos de captura (foto/audio/pantalla/llamada): envían el comando y
  // dejan el modal abierto para mostrar el resultado real cuando llega.
  const sendCaptureCmd = React.useCallback(async (command, args = '') => {
    await sendCmd(command, args);
    fetchCmdLog();
  }, [sendCmd, fetchCmdLog]);

  // Geocerca: va a los endpoints REST /api/geofence, no al flujo de comandos.
  const confirmGeofence = React.useCallback(async (geo) => {
    await tracerApiFetch('/api/geofence', { method: 'POST', body: JSON.stringify(geo) });
    fireToast('geofence', modalDevice);
    addNotification({
      type: 'security',
      title: 'Geocerca configurada',
      detail: `Centro ${geo.lat.toFixed(4)}, ${geo.lon.toFixed(4)} · radio ${geo.radius} m`,
    });
    setModal(null);
  }, [modalDevice, fireToast, addNotification]);

  const deleteGeofence = React.useCallback(async () => {
    await tracerApiFetch('/api/geofence', { method: 'DELETE' });
    addNotification({ type: 'system', title: 'Geocerca eliminada', detail: '' });
    setModal(null);
  }, [addNotification]);

  const confirmCallback = React.useCallback(async (phone) => {
    const dev = modalDevice;
    setModal(null);
    try {
      await sendCmd('CALLBACK', phone || '');
      fireToast('callback', dev);
      fetchCmdLog();
    } catch {}
  }, [modalDevice, sendCmd, fireToast, fetchCmdLog]);

  // ── Render ────────────────────────────────────────────────────────────
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
            activeCommands={activeCommands}
            deviceConnStatus={deviceConnStatus}
            lastPollAt={device?.lastPollAt || null}
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
      <CallbackModal open={modal?.kind === 'callback'} device={modalDevice}
        onClose={closeModal} onConfirm={confirmCallback} />

      <PhotoModal open={modal?.kind === 'photo'} device={modalDevice}
        onClose={closeModal} onConfirm={() => sendCaptureCmd('PHOTO')} />
      <AudioModal open={modal?.kind === 'audio'} device={modalDevice}
        onClose={closeModal} onConfirm={(secs) => sendCaptureCmd('AUDIO', secs)} />
      <ScreenshotModal open={modal?.kind === 'screen'} device={modalDevice}
        onClose={closeModal} onConfirm={() => sendCaptureCmd('SCREENSHOT')} />
      <SilentCallModal open={modal?.kind === 'silent-call'} device={modalDevice}
        onClose={closeModal} onConfirm={() => sendCaptureCmd('SILENT_CALL')} />
      <MessageModal open={modal?.kind === 'message'} device={modalDevice}
        onClose={closeModal} onConfirm={(text) => confirmGeneric('message', text)} />
      <GeofenceModal open={modal?.kind === 'geofence'} device={modalDevice}
        onClose={closeModal} onConfirm={confirmGeofence} onDelete={deleteGeofence} />

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

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(err) {
    return { error: err };
  }
  componentDidCatch(err) {
    console.error('[Tracer] Error de renderizado:', err);
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{
          position: 'fixed', inset: 0, display: 'flex', alignItems: 'center',
          justifyContent: 'center', background: '#fff', padding: 24, zIndex: 9999
        }}>
          <div style={{
            background: '#fee2e2', border: '1px solid #dc2626', padding: 20,
            borderRadius: 8, fontFamily: 'monospace', fontSize: 12,
            maxWidth: 700, maxHeight: '80vh', overflow: 'auto', whiteSpace: 'pre-wrap'
          }}>
            <strong>Error de renderizado:</strong>{'\n\n'}
            {String(this.state.error)}{'\n\n'}
            {this.state.error?.stack || ''}
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<ErrorBoundary><App /></ErrorBoundary>);
