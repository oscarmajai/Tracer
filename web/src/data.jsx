// API helpers and utilities for Tracer

const SIGNAL_LABELS = ['Sin señal', 'Débil', 'Moderada', 'Buena', 'Excelente'];

function getSettings() {
  return {
    apiUrl: window.location.origin,
    apiToken: localStorage.getItem('tracer_token') || '',
    apiUsername: localStorage.getItem('tracer_username') || '',
  };
}

function persistSettings(token, username) {
  localStorage.setItem('tracer_token', token);
  if (username !== undefined) localStorage.setItem('tracer_username', username);
}

async function apiFetch(path, options = {}) {
  const { apiUrl, apiToken } = getSettings();
  const res = await fetch(`${apiUrl}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${apiToken}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  if (res.status === 204) return null;
  return res.json();
}

const geocodeCache = new Map();

async function reverseGeocode(lat, lon) {
  const key = `${lat.toFixed(3)},${lon.toFixed(3)}`;
  if (geocodeCache.has(key)) return geocodeCache.get(key);
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`,
      { headers: { 'User-Agent': 'Tracer/1.0 (phone-tracker-app)' } }
    );
    if (!res.ok) throw new Error('geocode failed');
    const data = await res.json();
    const addr = data.address || {};
    const name =
      addr.road || addr.neighbourhood || addr.suburb ||
      addr.city_district || addr.city ||
      (data.display_name || '').split(',')[0] ||
      `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
    const sub = addr.city || addr.town || addr.village || addr.state || '';
    const result = { name, sub };
    geocodeCache.set(key, result);
    return result;
  } catch {
    const result = { name: `${lat.toFixed(4)}, ${lon.toFixed(4)}`, sub: '' };
    geocodeCache.set(key, result);
    return result;
  }
}

async function loadBlobUrl(filename) {
  const { apiUrl, apiToken } = getSettings();
  const res = await fetch(`${apiUrl}/api/photo/file/${encodeURIComponent(filename)}`, {
    headers: { Authorization: `Bearer ${apiToken}` },
  });
  if (!res.ok) return null;
  return URL.createObjectURL(await res.blob());
}

function relativeTime(iso) {
  const diff = (Date.now() - new Date(iso)) / 1000;
  if (diff < 60) return `hace ${Math.round(diff)}s`;
  if (diff < 3600) return `hace ${Math.round(diff / 60)}m`;
  if (diff < 86400) return `hace ${Math.round(diff / 3600)}h`;
  return new Date(iso).toLocaleDateString('es-MX');
}

function formatHistoryTime(iso) {
  const d = new Date(iso);
  const now = new Date();
  const time = d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
  return d.toDateString() === now.toDateString()
    ? `Hoy, ${time}`
    : d.toLocaleDateString('es-MX');
}

function sendNotification(title, body) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  new Notification(title, { body, tag: title });
}

window.tracerGetSettings = getSettings;
window.tracerPersistSettings = persistSettings;
window.tracerApiFetch = apiFetch;
window.tracerReverseGeocode = reverseGeocode;
window.tracerLoadBlobUrl = loadBlobUrl;
window.tracerRelativeTime = relativeTime;
window.tracerFormatHistoryTime = formatHistoryTime;
window.tracerSendNotification = sendNotification;
window.SIGNAL_LABELS = SIGNAL_LABELS;
