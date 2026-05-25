export function getSettings() {
  return {
    apiUrl: window.location.origin,
    apiToken: localStorage.getItem('tracer_token') || '',
    apiUsername: localStorage.getItem('tracer_username') || '',
  };
}

export function persistSettings(token, username) {
  localStorage.setItem('tracer_token', token);
  if (username !== undefined) localStorage.setItem('tracer_username', username);
}

export async function apiFetch(path, options = {}) {
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

export async function reverseGeocode(lat, lon) {
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

export async function loadBlobUrl(filename) {
  const { apiUrl, apiToken } = getSettings();
  const res = await fetch(`${apiUrl}/api/photo/file/${encodeURIComponent(filename)}`, {
    headers: { Authorization: `Bearer ${apiToken}` },
  });
  if (!res.ok) return null;
  return URL.createObjectURL(await res.blob());
}
