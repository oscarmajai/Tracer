import { useState, useRef, useCallback, useEffect } from 'react';
import { TracerContext } from './TracerContext';
import { useMap } from './useMap';
import { useWebSocket } from './useWebSocket';
import { apiFetch, loadBlobUrl, reverseGeocode, getSettings, persistSettings } from './api';
import { relativeTime, formatHistoryTime, sendNotification, SIGNAL_LABELS } from './helpers';
import LoginOverlay from './components/LoginOverlay';
import SidebarLeft from './components/SidebarLeft';
import SidebarRight from './components/SidebarRight';
import MapView from './components/MapView';
import Modals from './components/Modals';

export default function App() {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const [loggedIn, setLoggedIn] = useState(false);
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);

  // ── Device ────────────────────────────────────────────────────────────────
  const [deviceName, setDeviceName] = useState('—');
  const [deviceModel, setDeviceModel] = useState('—');
  const [statusOnline, setStatusOnline] = useState(null);
  const [lastSeen, setLastSeen] = useState('');
  const [battery, setBattery] = useState('—');
  const [batteryColor, setBatteryColor] = useState('var(--text)');
  const [signal, setSignal] = useState('—');

  // ── Feedback ──────────────────────────────────────────────────────────────
  const [feedbackText, setFeedbackText] = useState('');
  const [feedbackMod, setFeedbackMod] = useState('');

  // ── History ───────────────────────────────────────────────────────────────
  const [historyItems, setHistoryItems] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyOpen, setHistoryOpen] = useState(true);

  // ── Command log ───────────────────────────────────────────────────────────
  const [cmdLog, setCmdLog] = useState([]);
  const [cmdLogOpen, setCmdLogOpen] = useState(true);

  // ── Geofence ──────────────────────────────────────────────────────────────
  const [geofenceOpen, setGeofenceOpen] = useState(false);
  const [geofenceStatus, setGeofenceStatus] = useState('Sin zona configurada');
  const [geofenceStatusClass, setGeofenceStatusClass] = useState('');
  const [geofenceRadius, setGeofenceRadius] = useState(500);
  const [geofenceSaveDisabled, setGeofenceSaveDisabled] = useState(true);
  const [geofenceDeleteVisible, setGeofenceDeleteVisible] = useState(false);
  const [geofenceDrawMode, setGeofenceDrawMode] = useState(false);

  // ── Modals ────────────────────────────────────────────────────────────────
  const [modal, setModal] = useState(null);
  const [callbackNumber, setCallbackNumber] = useState('');
  const [lockMessage, setLockMessage] = useState('');
  const [newPin, setNewPin] = useState('');
  const [wipePassword, setWipePassword] = useState('');
  const [wipeError, setWipeError] = useState('');
  const [wipeLoading, setWipeLoading] = useState(false);

  // ── Alert banner ──────────────────────────────────────────────────────────
  const [alertBannerText, setAlertBannerText] = useState('');
  const [alertBannerVisible, setAlertBannerVisible] = useState(false);

  // ── Photos ────────────────────────────────────────────────────────────────
  const [photos, setPhotos] = useState([]);
  const [showOldPhotos, setShowOldPhotos] = useState(false);

  // ── Toggles ───────────────────────────────────────────────────────────────
  const [alertActive, setAlertActive] = useState(false);
  const [ringActive, setRingActive] = useState(false);
  const [keyguardActive, setKeyguardActive] = useState(false);

  // ── Notifications ─────────────────────────────────────────────────────────
  const [notifGranted, setNotifGranted] = useState(
    typeof Notification !== 'undefined' && Notification.permission === 'granted'
  );

  // ── Refs ──────────────────────────────────────────────────────────────────
  const lowBatNotifiedRef = useRef(false);
  const prevStatusOnlineRef = useRef(null);
  const alertTimerRef = useRef(null);
  const geofencePendingRef = useRef(null);
  const geofenceRadiusRef = useRef(500);
  const cmdLogRef = useRef([]);

  useEffect(() => { geofenceRadiusRef.current = geofenceRadius; }, [geofenceRadius]);
  useEffect(() => { cmdLogRef.current = cmdLog; }, [cmdLog]);

  // ── Map ───────────────────────────────────────────────────────────────────
  const mapAPI = useMap();

  // ── Helpers ───────────────────────────────────────────────────────────────
  const showFeedback = useCallback((text, mod = '') => {
    setFeedbackText(text);
    setFeedbackMod(mod);
    setTimeout(() => { setFeedbackText(''); setFeedbackMod(''); }, 4000);
  }, []);

  const setStatus = useCallback((online) => {
    if (prevStatusOnlineRef.current === true && !online) {
      sendNotification('Dispositivo desconectado', 'Tracer dejó de reportar ubicación');
    }
    prevStatusOnlineRef.current = online;
    setStatusOnline(online);
  }, []);

  const updateDeviceInfo = useCallback((latest) => {
    const name = latest.device_name || latest.device_id || 'Unknown';
    mapAPI.setDeviceName(name);
    setDeviceName(name);
    setDeviceModel(latest.device_id || '—');
    setLastSeen(relativeTime(latest.timestamp));

    const bat = latest.battery_level;
    setBattery(`${bat}%${latest.is_charging ? ' ⚡' : ''}`);
    setBatteryColor(bat > 50 ? 'var(--success)' : bat > 20 ? 'var(--warning)' : 'var(--danger)');
    setSignal(
      latest.signal_level != null
        ? (SIGNAL_LABELS[latest.signal_level] ?? `${latest.signal_level}`)
        : '—'
    );

    if (bat <= 15 && !lowBatNotifiedRef.current) {
      sendNotification('Batería baja', `Batería al ${bat}% en ${name}`);
      lowBatNotifiedRef.current = true;
    } else if (bat > 15) {
      lowBatNotifiedRef.current = false;
    }
  }, [mapAPI]);

  const renderHistory = useCallback(async (history) => {
    setHistoryLoading(false);
    if (!history || history.length === 0) { setHistoryItems([]); return; }

    const seen = new Set(), unique = [];
    for (const r of history) {
      const key = `${r.latitude.toFixed(3)},${r.longitude.toFixed(3)}`;
      if (!seen.has(key)) { seen.add(key); unique.push(r); if (unique.length >= 5) break; }
    }

    const geocoded = await Promise.all(unique.map((r) => reverseGeocode(r.latitude, r.longitude)));
    setHistoryItems(
      unique.map((r, i) => ({
        lat: r.latitude, lon: r.longitude,
        name: geocoded[i].name, sub: geocoded[i].sub,
        ts: formatHistoryTime(r.timestamp),
      }))
    );
  }, []);

  // ── Photos ────────────────────────────────────────────────────────────────
  const fetchPhotos = useCallback(async () => {
    try {
      const { apiUrl, apiToken } = getSettings();
      const res = await fetch(`${apiUrl}/api/photo/list?limit=6`, {
        headers: { Authorization: `Bearer ${apiToken}` },
      });
      if (!res.ok) return;
      const list = await res.json();
      if (!list || list.length === 0) return;

      const loaded = await Promise.all(
        list.map(async (photo) => {
          const blobUrl = await loadBlobUrl(photo.filename).catch(() => null);
          return { filename: photo.filename, timestamp: photo.timestamp, blobUrl };
        })
      );

      setPhotos((prev) => {
        prev.forEach((p) => { if (p.blobUrl) URL.revokeObjectURL(p.blobUrl); });
        return loaded.filter((p) => p.blobUrl);
      });
      setShowOldPhotos(false);
    } catch {}
  }, []);

  const loadPhotoFromEvent = useCallback(async (filename, timestamp) => {
    const blobUrl = await loadBlobUrl(filename).catch(() => null);
    if (!blobUrl) return;
    setPhotos((prev) => [{ filename, timestamp, blobUrl }, ...prev].slice(0, 6));
    setShowOldPhotos(false);
  }, []);

  // ── Geofence ──────────────────────────────────────────────────────────────
  const loadGeofence = useCallback(async () => {
    try {
      const gf = await apiFetch('/api/geofence');
      if (!gf) return;
      geofencePendingRef.current = { lat: gf.lat, lon: gf.lon };
      setGeofenceRadius(gf.radius);
      setGeofenceStatus(gf.enabled ? `Zona activa · ${gf.radius}m` : `Zona inactiva · ${gf.radius}m`);
      setGeofenceStatusClass(gf.enabled ? 'active' : '');
      setGeofenceDeleteVisible(true);
      setGeofenceSaveDisabled(false);
      mapAPI.drawGeofenceCircle(gf.lat, gf.lon, gf.radius);
    } catch {}
  }, [mapAPI]);

  const handleGeofencePick = useCallback(() => {
    const entering = !geofenceDrawMode;
    setGeofenceDrawMode(entering);
    if (entering) {
      setGeofenceStatus('Haz click en el mapa para centrar la zona');
      setGeofenceStatusClass('drawing');
      mapAPI.enableGeofencePick(true, (lat, lon) => {
        const radius = geofenceRadiusRef.current;
        geofencePendingRef.current = { lat, lon };
        setGeofenceDrawMode(false);
        setGeofenceSaveDisabled(false);
        mapAPI.drawGeofenceCircle(lat, lon, radius);
        setGeofenceStatus(`Centro: ${lat.toFixed(4)}, ${lon.toFixed(4)}`);
        setGeofenceStatusClass('drawing');
      });
    } else {
      mapAPI.enableGeofencePick(false, null);
      setGeofenceStatus(geofencePendingRef.current ? 'Listo · click Guardar para activar' : 'Sin zona configurada');
      setGeofenceStatusClass(geofencePendingRef.current ? 'drawing' : '');
    }
  }, [geofenceDrawMode, mapAPI]);

  const handleGeofenceRadiusChange = useCallback((radius) => {
    setGeofenceRadius(radius);
    if (geofencePendingRef.current) mapAPI.updateGeofenceRadius(radius);
  }, [mapAPI]);

  const handleGeofenceSave = useCallback(async () => {
    if (!geofencePendingRef.current) return;
    const radius = geofenceRadiusRef.current || 500;
    try {
      await apiFetch('/api/geofence', {
        method: 'POST',
        body: JSON.stringify({ ...geofencePendingRef.current, radius, enabled: true }),
      });
      setGeofenceStatus(`Zona activa · ${radius}m`);
      setGeofenceStatusClass('active');
      setGeofenceDeleteVisible(true);
      mapAPI.drawGeofenceCircle(geofencePendingRef.current.lat, geofencePendingRef.current.lon, radius);
    } catch {
      setGeofenceStatus('Error al guardar');
    }
  }, [mapAPI]);

  const handleGeofenceDelete = useCallback(async () => {
    if (!confirm('¿Eliminar la zona segura?')) return;
    try {
      const { apiUrl, apiToken } = getSettings();
      await fetch(`${apiUrl}/api/geofence`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${apiToken}` },
      });
      mapAPI.clearGeofenceCircle();
      geofencePendingRef.current = null;
      setGeofenceStatus('Sin zona configurada');
      setGeofenceStatusClass('');
      setGeofenceDeleteVisible(false);
      setGeofenceSaveDisabled(true);
    } catch {}
  }, [mapAPI]);

  // ── Commands ──────────────────────────────────────────────────────────────
  const sendCmd = useCallback(async (command, args = '') => {
    showFeedback(`Enviando ${command}…`, '');
    try {
      const result = await apiFetch('/api/command', {
        method: 'POST',
        body: JSON.stringify({ command, args }),
      });
      const entry = {
        id: result.id, command, args, status: 'pending', result: '',
        created_at: new Date().toISOString(), ts: formatHistoryTime(new Date().toISOString()),
      };
      setCmdLog((prev) => [entry, ...prev].slice(0, 8));
      showFeedback(`✓ ${command} en cola (id ${result.id})`, 'ok');
    } catch (err) {
      showFeedback(`✗ Error: ${err.message}`, 'err');
    }
  }, [showFeedback]);

  const sendCmdConfirm = useCallback((command) => {
    if (!confirm(`¿Ejecutar ${command}?\nEsta acción no se puede deshacer.`)) return;
    sendCmd(command);
  }, [sendCmd]);

  const loadCommandHistory = useCallback(async () => {
    try {
      const history = await apiFetch('/api/command/history?limit=8');
      if (history) {
        setCmdLog(history.map((cmd) => ({ ...cmd, ts: formatHistoryTime(cmd.created_at) })));
      }
    } catch {}
  }, []);

  // ── Modals ────────────────────────────────────────────────────────────────
  const openModal = useCallback((name) => {
    setCallbackNumber(''); setLockMessage(''); setNewPin('');
    setWipePassword(''); setWipeError(''); setWipeLoading(false);
    setModal(name);
  }, []);

  const confirmCallback = useCallback(() => {
    const num = callbackNumber.trim();
    if (!num) return;
    setModal(null);
    sendCmd('CALLBACK', num);
  }, [callbackNumber, sendCmd]);

  const confirmLock = useCallback(() => {
    setModal(null);
    sendCmd('LOCK', lockMessage.trim());
  }, [lockMessage, sendCmd]);

  const confirmResetPin = useCallback(() => {
    if (newPin.trim().length < 4) return;
    setModal(null);
    sendCmd('RESET_PIN', newPin.trim());
  }, [newPin, sendCmd]);

  const confirmWipe = useCallback(async () => {
    if (!wipePassword) return;
    setWipeLoading(true); setWipeError('');
    try {
      const { apiUsername } = getSettings();
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: apiUsername, password: wipePassword }),
      });
      if (res.status === 401) { setWipeError('Contraseña incorrecta.'); setWipeLoading(false); return; }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setModal(null); setWipeLoading(false);
      sendCmd('WIPE', 'CONFIRM');
    } catch (err) {
      setWipeError(`Error: ${err.message}`); setWipeLoading(false);
    }
  }, [wipePassword, sendCmd]);

  // ── Toggles ───────────────────────────────────────────────────────────────
  const toggleAlert = useCallback(() => {
    setAlertActive((prev) => { sendCmd(prev ? 'ALERT_OFF' : 'ALERT_ON'); return !prev; });
  }, [sendCmd]);

  const toggleRing = useCallback(() => {
    setRingActive((prev) => { sendCmd(prev ? 'RING_STOP' : 'RING'); return !prev; });
  }, [sendCmd]);

  const toggleKeyguard = useCallback(() => {
    setKeyguardActive((prev) => { sendCmd(prev ? 'KEYGUARD_OFF' : 'KEYGUARD_ON'); return !prev; });
  }, [sendCmd]);

  // ── Login ─────────────────────────────────────────────────────────────────
  const doLogin = useCallback(async () => {
    if (!loginUsername || !loginPassword) {
      setLoginError('Completa todos los campos.'); return;
    }
    setLoginLoading(true); setLoginError('');
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: loginUsername, password: loginPassword }),
      });
      if (res.status === 401) { setLoginError('Usuario o contraseña incorrectos.'); setLoginLoading(false); return; }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { token } = await res.json();
      persistSettings(token, loginUsername);
      mapAPI.resetCentered();
      setLoggedIn(true);
      setLoginLoading(false);
    } catch (err) {
      setLoginError(`Error de conexión: ${err.message}`); setLoginLoading(false);
    }
  }, [loginUsername, loginPassword, mapAPI]);

  // ── Device alert ──────────────────────────────────────────────────────────
  const handleDeviceAlert = useCallback((data) => {
    const labels = { sim_change: 'Alerta: SIM cambiada', pin_fail: 'Alerta: intento de desbloqueo' };
    const title = labels[data.type] || 'Alerta del dispositivo';
    const icon = data.type === 'sim_change' ? '⚠️' : data.type === 'pin_fail' ? '📷' : '🔔';
    sendNotification(title, data.message || '');
    setAlertBannerText(`${icon} ${title}${data.message ? ': ' + data.message : ''}`);
    setAlertBannerVisible(true);
    clearTimeout(alertTimerRef.current);
    alertTimerRef.current = setTimeout(() => setAlertBannerVisible(false), 8000);
  }, []);

  // ── WebSocket messages ────────────────────────────────────────────────────
  const handleWsMessage = useCallback((msg) => {
    switch (msg.type) {
      case 'location':
        updateDeviceInfo(msg.data);
        mapAPI.updateMap(msg.data, null);
        setStatus(true);
        break;
      case 'cmd_result': {
        const found = cmdLogRef.current.some((c) => c.id === msg.data.id);
        if (!found) {
          loadCommandHistory();
        } else {
          setCmdLog((prev) =>
            prev.map((c) =>
              c.id === msg.data.id
                ? { ...c, status: 'executed', result: msg.data.result, executed_at: msg.data.executed_at }
                : c
            )
          );
        }
        break;
      }
      case 'photo':
        msg.data?.filename
          ? loadPhotoFromEvent(msg.data.filename, msg.data.timestamp || new Date().toISOString())
          : fetchPhotos();
        break;
      case 'geofence_breach':
        sendNotification(
          'Alerta: zona segura abandonada',
          `El dispositivo salió de la zona (${Math.round(msg.data.distance)}m del centro)`
        );
        break;
      case 'alert':
        handleDeviceAlert(msg.data);
        break;
    }
  }, [updateDeviceInfo, mapAPI, setStatus, loadCommandHistory, loadPhotoFromEvent, fetchPhotos, handleDeviceAlert]);

  // ── WebSocket ─────────────────────────────────────────────────────────────
  useWebSocket({
    enabled: loggedIn,
    onMessage: handleWsMessage,
    onOpen: () => setStatus(true),
    onClose: () => setStatus(false),
  });

  // ── Refresh loop ──────────────────────────────────────────────────────────
  const refresh = useCallback(async () => {
    try {
      const [latest, history] = await Promise.all([
        apiFetch('/api/location/latest'),
        apiFetch('/api/location/history?limit=100'),
      ]);
      setStatus(true);
      if (latest) { updateDeviceInfo(latest); mapAPI.updateMap(latest, history || []); }
      if (history) renderHistory(history);
    } catch {
      setStatus(false);
    }
    await fetchPhotos();
  }, [setStatus, updateDeviceInfo, mapAPI, renderHistory, fetchPhotos]);

  // Using a ref so the interval always calls the latest refresh without re-subscribing
  const refreshRef = useRef(refresh);
  useEffect(() => { refreshRef.current = refresh; }, [refresh]);

  useEffect(() => {
    if (!loggedIn) return;
    refreshRef.current();
    loadCommandHistory();
    loadGeofence();
    const refreshId = setInterval(() => refreshRef.current(), 30_000);
    const cmdId = setInterval(loadCommandHistory, 120_000);
    return () => { clearInterval(refreshId); clearInterval(cmdId); };
  }, [loggedIn, loadCommandHistory, loadGeofence]);

  // ── Auth check on mount ───────────────────────────────────────────────────
  useEffect(() => {
    async function checkAuth() {
      const { apiToken, apiUrl } = getSettings();
      if (!apiToken) return;
      try {
        const res = await fetch(`${apiUrl}/api/location/latest`, {
          headers: { Authorization: `Bearer ${apiToken}` },
        });
        if (res.status === 401) {
          localStorage.removeItem('tracer_token');
        } else {
          setLoggedIn(true);
        }
      } catch {
        setLoggedIn(true);
      }
    }
    checkAuth();
  }, []);

  // ── Notifications ─────────────────────────────────────────────────────────
  const requestNotifications = useCallback(async () => {
    if (!('Notification' in window)) return;
    await Notification.requestPermission();
    setNotifGranted(Notification.permission === 'granted');
  }, []);

  // ── Derived values ────────────────────────────────────────────────────────
  const statusDotClass = statusOnline === true ? 'online' : statusOnline === false ? 'offline' : '';
  const statusLabel = statusOnline === true ? 'EN LÍNEA' : statusOnline === false ? 'DESCONECTADO' : 'Conectando…';
  const statusTextClass = statusOnline === true ? '' : statusOnline === false ? 'offline' : 'connecting';

  // ── Context value ─────────────────────────────────────────────────────────
  const ctx = {
    loggedIn,
    loginUsername, setLoginUsername,
    loginPassword, setLoginPassword,
    loginError, loginLoading, doLogin,

    deviceName, deviceModel,
    statusDotClass, statusLabel, statusTextClass,
    lastSeen, battery, batteryColor, signal,

    feedbackText, feedbackMod,

    historyItems, historyLoading, historyOpen, setHistoryOpen,
    flyTo: mapAPI.flyTo,

    cmdLog, cmdLogOpen, setCmdLogOpen,

    geofenceOpen, setGeofenceOpen,
    geofenceStatus, geofenceStatusClass,
    geofenceRadius, geofenceSaveDisabled, geofenceDeleteVisible, geofenceDrawMode,
    handleGeofencePick, handleGeofenceRadiusChange, handleGeofenceSave, handleGeofenceDelete,

    modal, setModal, openModal,
    callbackNumber, setCallbackNumber, confirmCallback,
    lockMessage, setLockMessage, confirmLock,
    newPin, setNewPin, confirmResetPin,
    wipePassword, setWipePassword, wipeError, wipeLoading, confirmWipe,

    alertBannerText, alertBannerVisible,

    photos, showOldPhotos, setShowOldPhotos,

    alertActive, ringActive, keyguardActive,
    toggleAlert, toggleRing, toggleKeyguard,

    notifGranted, requestNotifications,

    sendCmd, sendCmdConfirm,
  };

  return (
    <TracerContext.Provider value={ctx}>
      <div className="layout">
        <SidebarLeft />
        <MapView containerRef={mapAPI.containerRef} />
        <SidebarRight />
      </div>
      <Modals />
      {!loggedIn && <LoginOverlay />}
    </TracerContext.Provider>
  );
}
