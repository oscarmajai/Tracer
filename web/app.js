'use strict';

// ── Settings ──────────────────────────────────────────────────────────────────

const DEFAULTS = {
    apiUrl:   window.location.origin,
    apiToken: '',
};

function getSettings() {
    return {
        apiUrl:      localStorage.getItem('tracer_url')      || DEFAULTS.apiUrl,
        apiToken:    localStorage.getItem('tracer_token')    || DEFAULTS.apiToken,
        apiUsername: localStorage.getItem('tracer_username') || '',
    };
}

function persistSettings(url, token, username) {
    localStorage.setItem('tracer_url',   url.replace(/\/$/, ''));
    localStorage.setItem('tracer_token', token);
    if (username !== undefined) localStorage.setItem('tracer_username', username);
}

// ── API ───────────────────────────────────────────────────────────────────────

async function apiFetch(path, options = {}) {
    const { apiUrl, apiToken } = getSettings();
    const res = await fetch(`${apiUrl}${path}`, {
        ...options,
        headers: {
            'Authorization': `Bearer ${apiToken}`,
            'Content-Type':  'application/json',
            ...(options.headers || {}),
        },
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    if (res.status === 204) return null;
    return res.json();
}

// ── Geocoding ─────────────────────────────────────────────────────────────────

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
        const name = addr.road || addr.neighbourhood || addr.suburb ||
                     addr.city_district || addr.city ||
                     (data.display_name || '').split(',')[0] ||
                     `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
        const sub  = addr.city || addr.town || addr.village || addr.state || '';
        const result = { name, sub };
        geocodeCache.set(key, result);
        return result;
    } catch {
        const result = { name: `${lat.toFixed(4)}, ${lon.toFixed(4)}`, sub: '' };
        geocodeCache.set(key, result);
        return result;
    }
}

// ── Map ───────────────────────────────────────────────────────────────────────

const mapState = {
    instance:   null,
    marker:     null,
    trail:      null,
    centered:   false,
    deviceName: 'Device',
};

function initMap() {
    mapState.instance = L.map('map', { zoomControl: false })
        .setView([23.6345, -102.5528], 5);

    L.tileLayer(
        'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
        {
            attribution:
                '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' +
                ' &copy; <a href="https://carto.com/">CARTO</a>',
            maxZoom: 19,
        }
    ).addTo(mapState.instance);

    L.control.zoom({ position: 'bottomright' }).addTo(mapState.instance);
}

function makeDeviceIcon(initial) {
    return L.divIcon({
        className:     '',
        html:          `<div class="device-marker">${initial}</div>`,
        iconSize:      [36, 36],
        iconAnchor:    [18, 18],
        tooltipAnchor: [0, -22],
    });
}

function updateMap(latest, history) {
    const latlng  = [latest.latitude, latest.longitude];
    const initial = (mapState.deviceName || 'D').charAt(0).toUpperCase();

    if (!mapState.marker) {
        mapState.marker = L.marker(latlng, { icon: makeDeviceIcon(initial) })
            .addTo(mapState.instance);
        mapState.marker.bindTooltip(mapState.deviceName, {
            permanent: true, direction: 'bottom', offset: [0, 10], className: 'device-label',
        });
    } else {
        mapState.marker.setLatLng(latlng);
        mapState.marker.setIcon(makeDeviceIcon(initial));
        const tt = mapState.marker.getTooltip();
        if (tt) tt.setContent(mapState.deviceName);
    }

    const ts  = new Date(latest.timestamp).toLocaleString('es-MX');
    const bat = latest.battery_level;
    mapState.marker.bindPopup(`<b>Batería: ${bat}%</b><br><small>${ts}</small>`);

    if (history && history.length > 1) {
        const points = [...history].reverse().map(r => [r.latitude, r.longitude]);
        if (!mapState.trail) {
            mapState.trail = L.polyline(points, { color: '#2563eb', weight: 2.5, opacity: 0.5 })
                .addTo(mapState.instance);
        } else {
            mapState.trail.setLatLngs(points);
        }
    }

    if (!mapState.centered) {
        mapState.instance.setView(latlng, 15);
        mapState.centered = true;
    }
}

// ── Device info ───────────────────────────────────────────────────────────────

const SIGNAL_LABELS = ['Sin señal', 'Débil', 'Moderada', 'Buena', 'Excelente'];

function updateDeviceInfo(latest) {
    const name = latest.device_name || latest.device_id || 'Unknown';
    mapState.deviceName = name;

    document.getElementById('deviceName').textContent = name;
    document.getElementById('deviceModel').textContent = latest.device_id || '—';
    document.getElementById('lastSeen').textContent    = relativeTime(latest.timestamp);

    const bat   = latest.battery_level;
    const batEl = document.getElementById('batteryValue');
    const charging = latest.is_charging;
    batEl.textContent  = `${bat}%${charging ? ' ⚡' : ''}`;
    batEl.style.color  = bat > 50 ? 'var(--success)'
                       : bat > 20 ? 'var(--warning)'
                       :            'var(--danger)';
    if (bat <= 15 && !lowBatNotified) {
        sendNotification('Batería baja', `Batería al ${bat}% en ${name}`);
        lowBatNotified = true;
    } else if (bat > 15) {
        lowBatNotified = false;
    }

    const sigEl = document.getElementById('signalValue');
    if (latest.signal_level != null) {
        sigEl.textContent = SIGNAL_LABELS[latest.signal_level] ?? `${latest.signal_level}`;
    } else {
        sigEl.textContent = '—';
    }
}

function relativeTime(iso) {
    const diff = (Date.now() - new Date(iso)) / 1000;
    if (diff < 60)    return `hace ${Math.round(diff)}s`;
    if (diff < 3600)  return `hace ${Math.round(diff / 60)}m`;
    if (diff < 86400) return `hace ${Math.round(diff / 3600)}h`;
    return new Date(iso).toLocaleDateString('es-MX');
}

// ── Status ────────────────────────────────────────────────────────────────────

function setStatus(online) {
    if (_statusOnline === true && !online) {
        sendNotification('Dispositivo desconectado', 'Tracer dejó de reportar ubicación');
    }
    _statusOnline = online;
    const dot  = document.getElementById('statusDot');
    const text = document.getElementById('statusText');
    dot.className    = `status-dot ${online ? 'online' : 'offline'}`;
    text.textContent = online ? 'EN LÍNEA' : 'DESCONECTADO';
    text.className   = `status-text ${online ? '' : 'offline'}`;
}

// ── Location History ──────────────────────────────────────────────────────────

async function renderHistory(history) {
    const list = document.getElementById('historyList');

    if (!history || history.length === 0) {
        list.innerHTML = '<li class="history-empty">Sin ubicaciones aún</li>';
        return;
    }

    const seen   = new Set();
    const unique = [];
    for (const r of history) {
        const key = `${r.latitude.toFixed(3)},${r.longitude.toFixed(3)}`;
        if (!seen.has(key)) {
            seen.add(key);
            unique.push(r);
            if (unique.length >= 5) break;
        }
    }

    const geocoded = await Promise.all(
        unique.map(r => reverseGeocode(r.latitude, r.longitude))
    );

    list.innerHTML = unique.map((r, i) => {
        const geo       = geocoded[i];
        const ts        = formatHistoryTime(r.timestamp);
        const connector = i < unique.length - 1
            ? `<div class="history-connector"></div>` : '';
        return `
        <li class="history-item" data-lat="${r.latitude}" data-lon="${r.longitude}">
            <div class="history-dot-wrap">
                <div class="history-dot ${i === 0 ? 'current' : ''}"></div>
                ${connector}
            </div>
            <div class="history-text">
                <strong title="${geo.name}">${geo.name}</strong>
                <small>${geo.sub ? geo.sub + ' · ' : ''}${ts}</small>
            </div>
        </li>`;
    }).join('');

    list.querySelectorAll('.history-item').forEach(li => {
        li.addEventListener('click', () => {
            mapState.instance.flyTo([parseFloat(li.dataset.lat), parseFloat(li.dataset.lon)], 16, { duration: 1 });
        });
    });
}

function formatHistoryTime(iso) {
    const d   = new Date(iso);
    const now = new Date();
    const time = d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
    return d.toDateString() === now.toDateString() ? `Hoy, ${time}` : d.toLocaleDateString('es-MX');
}

// ── Command Log ───────────────────────────────────────────────────────────────

let cmdLog        = [];   // [{id, command, status, result, created_at}]
let lowBatNotified = false;
let _statusOnline  = null;

async function loadCommandHistory() {
    try {
        const history = await apiFetch('/api/command/history?limit=8');
        if (history) {
            cmdLog = history;
            renderCmdLog();
        }
    } catch {}
}

function updateCommandLog(data) {
    // data = {id, result, executed_at}
    const entry = cmdLog.find(e => e.id === data.id);
    if (entry) {
        entry.status     = 'executed';
        entry.result     = data.result;
        entry.executed_at = data.executed_at;
    }
    renderCmdLog();
}

function renderCmdLog() {
    const list = document.getElementById('cmdLogList');
    if (!cmdLog || cmdLog.length === 0) {
        list.innerHTML = '<li class="history-empty">Sin comandos</li>';
        return;
    }

    list.innerHTML = cmdLog.map(cmd => {
        const ts     = formatHistoryTime(cmd.created_at);
        const status = cmd.status === 'executed' ? 'executed' : 'pending';
        return `
        <li class="cmd-log-item">
            <span class="cmd-badge ${status}">${cmd.command}</span>
            <div class="cmd-log-text">
                <small>${ts}${cmd.args ? ' · ' + cmd.args : ''}</small>
                ${cmd.result
                    ? `<p class="cmd-log-result">${escHtml(cmd.result)}</p>`
                    : (status === 'pending' ? '<p class="cmd-log-result" style="color:var(--subtext-lt)">Esperando…</p>' : '')}
            </div>
        </li>`;
    }).join('');
}

function escHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── Notifications ─────────────────────────────────────────────────────────────

async function requestNotifications() {
    if (!('Notification' in window)) return;
    await Notification.requestPermission();
    syncNotifBtn();
}

function syncNotifBtn() {
    if (!('Notification' in window)) return;
    const btn = document.getElementById('btnNotif');
    btn.classList.toggle('active', Notification.permission === 'granted');
    btn.title = Notification.permission === 'granted' ? 'Notificaciones activas' : 'Activar notificaciones';
}

function sendNotification(title, body) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    new Notification(title, { body, tag: title });
}

// ── Photo gallery ─────────────────────────────────────────────────────────────

async function loadBlobUrl(filename) {
    const { apiUrl, apiToken } = getSettings();
    const res = await fetch(`${apiUrl}/api/photo/file/${encodeURIComponent(filename)}`, {
        headers: { 'Authorization': `Bearer ${apiToken}` },
    });
    if (!res.ok) return null;
    return URL.createObjectURL(await res.blob());
}

function renderPhotoItem(container, photo) {
    const item = document.createElement('div');
    item.className = 'photo-gallery-old-item';
    const img = document.createElement('img');
    img.alt = 'Foto capturada';
    const tsEl = document.createElement('p');
    tsEl.className = 'photo-gallery-ts';
    tsEl.textContent = relativeTime(photo.timestamp);
    item.append(img, tsEl);
    container.appendChild(item);
    loadBlobUrl(photo.filename).then(url => {
        if (url) { img._objUrl = url; img.src = url; }
    }).catch(() => {});
}

async function fetchPhotos() {
    try {
        const { apiUrl, apiToken } = getSettings();
        const res = await fetch(`${apiUrl}/api/photo/list?limit=6`, {
            headers: { 'Authorization': `Bearer ${apiToken}` },
        });
        if (!res.ok) return;
        const photos = await res.json();
        if (!photos || photos.length === 0) return;

        document.querySelectorAll('#latestPhotoWrap img, .photo-gallery-old-item img').forEach(img => {
            if (img._objUrl) URL.revokeObjectURL(img._objUrl);
        });

        const latestWrap = document.getElementById('latestPhotoWrap');
        const galleryOld = document.getElementById('photoGalleryOld');
        const btnGallery = document.getElementById('btnPhotoGallery');
        latestWrap.innerHTML = '';
        galleryOld.innerHTML = '';

        const latest = photos[0];
        const latestImg = document.createElement('img');
        latestImg.alt = 'Foto capturada';
        const latestTs = document.createElement('p');
        latestTs.className = 'photo-gallery-ts';
        latestTs.textContent = relativeTime(latest.timestamp);
        latestWrap.append(latestImg, latestTs);
        loadBlobUrl(latest.filename).then(url => {
            if (url) { latestImg._objUrl = url; latestImg.src = url; }
        }).catch(() => {});

        if (photos.length > 1) {
            for (const photo of photos.slice(1)) renderPhotoItem(galleryOld, photo);
            btnGallery.style.display = '';
            btnGallery.textContent = 'Ver más';
            galleryOld.classList.add('hidden');
        } else {
            btnGallery.style.display = 'none';
        }

        document.getElementById('photoSection').style.display = 'block';
    } catch {}
}

async function loadPhotoFromEvent(filename, timestamp) {
    const section    = document.getElementById('photoSection');
    const latestWrap = document.getElementById('latestPhotoWrap');
    const galleryOld = document.getElementById('photoGalleryOld');
    const btnGallery = document.getElementById('btnPhotoGallery');

    if (latestWrap.hasChildNodes()) {
        const oldItem = document.createElement('div');
        oldItem.className = 'photo-gallery-old-item';
        while (latestWrap.firstChild) oldItem.appendChild(latestWrap.firstChild);
        galleryOld.insertBefore(oldItem, galleryOld.firstChild);
        btnGallery.style.display = '';
        btnGallery.textContent = 'Ver más';
        galleryOld.classList.add('hidden');
    }

    const img = document.createElement('img');
    img.alt = 'Foto capturada';
    const tsEl = document.createElement('p');
    tsEl.className = 'photo-gallery-ts';
    tsEl.textContent = relativeTime(timestamp);
    latestWrap.append(img, tsEl);
    try {
        const url = await loadBlobUrl(filename);
        if (url) { img._objUrl = url; img.src = url; }
    } catch {}

    section.style.display = 'block';
}

function bindPhotoGallery() {
    document.getElementById('btnPhotoGallery').addEventListener('click', () => {
        const galleryOld = document.getElementById('photoGalleryOld');
        const btn = document.getElementById('btnPhotoGallery');
        const nowHidden = galleryOld.classList.toggle('hidden');
        btn.textContent = nowHidden ? 'Ver más' : 'Ver menos';
    });
}

// ── Device alerts (SIM change, PIN fail) ─────────────────────────────────────

function handleDeviceAlert(data) {
    const alerts = { sim_change: 'Alerta: SIM cambiada', pin_fail: 'Alerta: intento de desbloqueo' };
    const title = alerts[data.type] || 'Alerta del dispositivo';
    sendNotification(title, data.message || '');
    addAlertBanner(title, data.message || '', data.type);
}

let alertBannerTimer = null;

function addAlertBanner(title, message, type) {
    let banner = document.getElementById('alertBanner');
    if (!banner) return;
    const icon = type === 'sim_change' ? '⚠️' : type === 'pin_fail' ? '📷' : '🔔';
    banner.textContent = `${icon} ${title}${message ? ': ' + message : ''}`;
    banner.className = 'alert-banner visible';
    clearTimeout(alertBannerTimer);
    alertBannerTimer = setTimeout(() => { banner.className = 'alert-banner'; }, 8000);
}

// ── Toggle buttons (Alerta / Sonar) ──────────────────────────────────────────

const toggleState = { alert: false, ring: false };

function bindToggleButtons() {
    const btnAlert = document.getElementById('btnAlert');
    const btnRing  = document.getElementById('btnRing');

    btnAlert.addEventListener('click', () => {
        toggleState.alert = !toggleState.alert;
        if (toggleState.alert) {
            sendCommand('ALERT_ON');
            btnAlert.classList.add('active');
            btnAlert.querySelector('span').textContent = 'Alerta activa';
            btnAlert.querySelector('.cmd-desc').textContent = 'Desactivar alerta';
        } else {
            sendCommand('ALERT_OFF');
            btnAlert.classList.remove('active');
            btnAlert.querySelector('span').textContent = 'Alerta';
            btnAlert.querySelector('.cmd-desc').textContent = 'Activar modo alerta';
        }
    });

    btnRing.addEventListener('click', () => {
        toggleState.ring = !toggleState.ring;
        if (toggleState.ring) {
            sendCommand('RING');
            btnRing.classList.add('active');
            btnRing.querySelector('span').textContent = 'Sonando';
            btnRing.querySelector('.cmd-desc').textContent = 'Detener timbre';
        } else {
            sendCommand('RING_STOP');
            btnRing.classList.remove('active');
            btnRing.querySelector('span').textContent = 'Sonar';
            btnRing.querySelector('.cmd-desc').textContent = 'Activar timbre 30s';
        }
    });
}

// ── Geofence ──────────────────────────────────────────────────────────────────

const geofenceState = { circle: null, drawMode: false, pending: null };

function drawGeofenceCircle(lat, lon, radius) {
    if (geofenceState.circle) {
        geofenceState.circle.setLatLng([lat, lon]);
        geofenceState.circle.setRadius(radius);
    } else {
        geofenceState.circle = L.circle([lat, lon], {
            radius,
            color:       '#2563eb',
            fillColor:   '#2563eb',
            fillOpacity: 0.08,
            weight:      2,
        }).addTo(mapState.instance);
    }
}

function clearGeofenceCircle() {
    if (geofenceState.circle) {
        mapState.instance.removeLayer(geofenceState.circle);
        geofenceState.circle = null;
    }
}

async function loadGeofence() {
    try {
        const gf = await apiFetch('/api/geofence');
        if (gf) {
            geofenceState.pending = { lat: gf.lat, lon: gf.lon };
            drawGeofenceCircle(gf.lat, gf.lon, gf.radius);
            document.getElementById('geofenceRadius').value = gf.radius;
            document.getElementById('geofenceStatus').textContent =
                gf.enabled ? `Zona activa · ${gf.radius}m` : `Zona inactiva · ${gf.radius}m`;
            document.getElementById('geofenceStatus').className =
                `geofence-status${gf.enabled ? ' active' : ''}`;
            document.getElementById('btnGeofenceDelete').style.display = '';
            document.getElementById('btnGeofenceSave').disabled = false;
        }
    } catch {}
}

function bindGeofenceEvents() {
    const btnPick   = document.getElementById('btnGeofencePick');
    const btnSave   = document.getElementById('btnGeofenceSave');
    const btnDelete = document.getElementById('btnGeofenceDelete');
    const statusEl  = document.getElementById('geofenceStatus');

    btnPick.addEventListener('click', () => {
        if (geofenceState.drawMode) {
            geofenceState.drawMode = false;
            mapState.instance.getContainer().style.cursor = '';
            btnPick.textContent = 'Marcar en mapa';
            btnPick.classList.remove('active');
            statusEl.textContent = geofenceState.pending
                ? 'Listo · click Guardar para activar'
                : 'Sin zona configurada';
            statusEl.className = 'geofence-status' + (geofenceState.pending ? ' drawing' : '');
        } else {
            geofenceState.drawMode = true;
            mapState.instance.getContainer().style.cursor = 'crosshair';
            btnPick.textContent = 'Cancelar';
            btnPick.classList.add('active');
            statusEl.textContent = 'Haz click en el mapa para centrar la zona';
            statusEl.className = 'geofence-status drawing';
        }
    });

    mapState.instance.on('click', (e) => {
        if (!geofenceState.drawMode) return;
        const { lat, lng } = e.latlng;
        const radius = parseInt(document.getElementById('geofenceRadius').value, 10) || 500;
        geofenceState.pending = { lat, lon: lng };
        geofenceState.drawMode = false;
        mapState.instance.getContainer().style.cursor = '';
        btnPick.textContent = 'Marcar en mapa';
        btnPick.classList.remove('active');
        btnSave.disabled = false;
        drawGeofenceCircle(lat, lng, radius);
        statusEl.textContent = `Centro: ${lat.toFixed(4)}, ${lng.toFixed(4)}`;
        statusEl.className = 'geofence-status drawing';
    });

    document.getElementById('geofenceRadius').addEventListener('input', () => {
        if (geofenceState.circle && geofenceState.pending) {
            const r = parseInt(document.getElementById('geofenceRadius').value, 10) || 500;
            geofenceState.circle.setRadius(r);
        }
    });

    btnSave.addEventListener('click', async () => {
        if (!geofenceState.pending) return;
        const radius = parseInt(document.getElementById('geofenceRadius').value, 10) || 500;
        try {
            await apiFetch('/api/geofence', {
                method: 'POST',
                body:   JSON.stringify({
                    lat:     geofenceState.pending.lat,
                    lon:     geofenceState.pending.lon,
                    radius,
                    enabled: true,
                }),
            });
            statusEl.textContent = `Zona activa · ${radius}m`;
            statusEl.className   = 'geofence-status active';
            btnDelete.style.display = '';
            drawGeofenceCircle(geofenceState.pending.lat, geofenceState.pending.lon, radius);
        } catch {
            statusEl.textContent = 'Error al guardar';
        }
    });

    btnDelete.addEventListener('click', async () => {
        if (!confirm('¿Eliminar la zona segura?')) return;
        try {
            const { apiUrl, apiToken } = getSettings();
            await fetch(`${apiUrl}/api/geofence`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${apiToken}` },
            });
            clearGeofenceCircle();
            geofenceState.pending = null;
            statusEl.textContent    = 'Sin zona configurada';
            statusEl.className      = 'geofence-status';
            btnDelete.style.display = 'none';
            btnSave.disabled        = true;
        } catch {}
    });
}

// ── WebSocket ─────────────────────────────────────────────────────────────────

let ws                = null;
let wsReconnectDelay  = 1_000;
let wsConnected       = false;

function connectWS() {
    const { apiUrl, apiToken } = getSettings();
    if (!apiToken) return;

    const wsUrl = apiUrl
        .replace(/^https/, 'wss')
        .replace(/^http/, 'ws')
        .replace(/\/$/, '') + '/ws?token=' + encodeURIComponent(apiToken);

    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
        wsConnected      = true;
        wsReconnectDelay = 1_000;
        setStatus(true);
    };

    ws.onmessage = (event) => {
        try {
            const msg = JSON.parse(event.data);
            switch (msg.type) {
                case 'location':
                    updateDeviceInfo(msg.data);
                    updateMap(msg.data, null);
                    setStatus(true);
                    break;
                case 'cmd_result':
                    updateCommandLog(msg.data);
                    if (!cmdLog.find(e => e.id === msg.data.id)) {
                        loadCommandHistory();
                    }
                    break;
                case 'photo':
                    if (msg.data && msg.data.filename) {
                        loadPhotoFromEvent(msg.data.filename, msg.data.timestamp || new Date().toISOString());
                    } else {
                        fetchPhotos();
                    }
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
        } catch {}
    };

    ws.onerror = () => {};

    ws.onclose = () => {
        wsConnected      = false;
        wsReconnectDelay = Math.min(wsReconnectDelay * 2, 30_000);
        setStatus(false);
        setTimeout(connectWS, wsReconnectDelay);
    };
}

// ── Refresh (HTTP fallback) ───────────────────────────────────────────────────

async function refresh() {
    try {
        const [latest, history] = await Promise.all([
            apiFetch('/api/location/latest'),
            apiFetch('/api/location/history?limit=100'),
        ]);
        if (!wsConnected) setStatus(true);
        if (latest) {
            updateDeviceInfo(latest);
            updateMap(latest, history || []);
        } else if (!wsConnected) {
            document.getElementById('statusText').textContent = 'ESPERANDO';
        }
        if (history) renderHistory(history);
    } catch (err) {
        if (!wsConnected) setStatus(false);
        console.warn('Refresh error:', err.message);
    }
    await fetchPhotos();
}

// ── Commands ──────────────────────────────────────────────────────────────────

async function sendCommand(command, args) {
    const feedback = document.getElementById('cmdFeedback');
    feedback.textContent = `Enviando ${command}…`;
    feedback.className   = 'feedback';

    try {
        const body   = JSON.stringify({ command, args: args || '' });
        const result = await apiFetch('/api/command', { method: 'POST', body });

        cmdLog.unshift({ id: result.id, command, args: args || '', status: 'pending', created_at: new Date().toISOString() });
        if (cmdLog.length > 8) cmdLog.pop();
        renderCmdLog();

        feedback.textContent = `✓ ${command} en cola (id ${result.id})`;
        feedback.className   = 'feedback ok';
    } catch (err) {
        feedback.textContent = `✗ Error: ${err.message}`;
        feedback.className   = 'feedback err';
    }

    setTimeout(() => { feedback.textContent = ''; feedback.className = 'feedback'; }, 4000);
}

// ── Events ────────────────────────────────────────────────────────────────────

function bindEvents() {
    document.querySelectorAll('[data-cmd]').forEach(btn => {
        btn.addEventListener('click', () => {
            const cmd  = btn.dataset.cmd;
            const args = btn.dataset.args || '';
            if (btn.dataset.confirm === 'true') {
                if (!confirm(`¿Ejecutar ${cmd}?\nEsta acción no se puede deshacer.`)) return;
            }
            sendCommand(cmd, args);
        });
    });

    // Modal: Llamada de retorno
    document.getElementById('btnCallback').addEventListener('click', () => {
        document.getElementById('callbackNumber').value = '';
        document.getElementById('modalCallback').classList.remove('hidden');
        setTimeout(() => document.getElementById('callbackNumber').focus(), 50);
    });
    document.getElementById('modalCallbackCancel').addEventListener('click', () => {
        document.getElementById('modalCallback').classList.add('hidden');
    });
    document.getElementById('modalCallbackConfirm').addEventListener('click', () => {
        const num = document.getElementById('callbackNumber').value.trim();
        if (!num) { document.getElementById('callbackNumber').focus(); return; }
        document.getElementById('modalCallback').classList.add('hidden');
        sendCommand('CALLBACK', num);
    });
    document.getElementById('callbackNumber').addEventListener('keydown', e => {
        if (e.key === 'Enter')  document.getElementById('modalCallbackConfirm').click();
        if (e.key === 'Escape') document.getElementById('modalCallback').classList.add('hidden');
    });
    document.getElementById('modalCallback').addEventListener('click', e => {
        if (e.target === e.currentTarget) e.currentTarget.classList.add('hidden');
    });

    // Modal: Bloqueo con mensaje
    document.getElementById('btnLock').addEventListener('click', () => {
        document.getElementById('lockMessage').value = '';
        document.getElementById('modalLock').classList.remove('hidden');
        setTimeout(() => document.getElementById('lockMessage').focus(), 50);
    });
    document.getElementById('modalLockCancel').addEventListener('click', () => {
        document.getElementById('modalLock').classList.add('hidden');
    });
    document.getElementById('modalLockConfirm').addEventListener('click', () => {
        const msg = document.getElementById('lockMessage').value.trim();
        document.getElementById('modalLock').classList.add('hidden');
        sendCommand('LOCK', msg);
    });
    document.getElementById('lockMessage').addEventListener('keydown', e => {
        if (e.key === 'Enter')  document.getElementById('modalLockConfirm').click();
        if (e.key === 'Escape') document.getElementById('modalLock').classList.add('hidden');
    });
    document.getElementById('modalLock').addEventListener('click', e => {
        if (e.target === e.currentTarget) e.currentTarget.classList.add('hidden');
    });

    // Modal: Cambiar PIN
    document.getElementById('btnResetPin').addEventListener('click', () => {
        document.getElementById('newPin').value = '';
        document.getElementById('modalResetPin').classList.remove('hidden');
        setTimeout(() => document.getElementById('newPin').focus(), 50);
    });
    document.getElementById('modalResetPinCancel').addEventListener('click', () => {
        document.getElementById('modalResetPin').classList.add('hidden');
    });
    document.getElementById('modalResetPinConfirm').addEventListener('click', () => {
        const pin = document.getElementById('newPin').value.trim();
        if (pin.length < 4) { document.getElementById('newPin').focus(); return; }
        document.getElementById('modalResetPin').classList.add('hidden');
        sendCommand('RESET_PIN', pin);
    });
    document.getElementById('newPin').addEventListener('keydown', e => {
        if (e.key === 'Enter')  document.getElementById('modalResetPinConfirm').click();
        if (e.key === 'Escape') document.getElementById('modalResetPin').classList.add('hidden');
    });
    document.getElementById('modalResetPin').addEventListener('click', e => {
        if (e.target === e.currentTarget) e.currentTarget.classList.add('hidden');
    });

    // Toggle: Restricción de pantalla de bloqueo (KEYGUARD)
    const btnKG = document.getElementById('btnKeyguard');
    btnKG.addEventListener('click', () => {
        const on = btnKG.dataset.state !== 'on';
        btnKG.dataset.state = on ? 'on' : 'off';
        sendCommand(on ? 'KEYGUARD_ON' : 'KEYGUARD_OFF');
        btnKG.classList.toggle('active', on);
        btnKG.querySelector('span').textContent = on ? 'Restringido' : 'Restricción';
        btnKG.querySelector('.cmd-desc').textContent = on ? 'Restaurar accesos' : 'Deshabilitar accesos en bloqueo';
    });

    document.getElementById('btnSave').addEventListener('click', () => {
        const url = document.getElementById('apiUrl').value.trim();
        if (!url) return;
        localStorage.setItem('tracer_url', url.replace(/\/$/, ''));
        localStorage.removeItem('tracer_token');
        mapState.centered = false;
        if (ws) ws.close();
        showLogin();
    });

    // Toggles
    bindCollapseToggle('historyToggle',  'historyList');
    bindCollapseToggle('cmdLogToggle',   'cmdLogList');
    bindCollapseToggle('geofenceToggle', 'geofenceBody');

    // Notification bell
    document.getElementById('btnNotif').addEventListener('click', requestNotifications);
}

function bindCollapseToggle(toggleId, listId) {
    const toggle  = document.getElementById(toggleId);
    const list    = document.getElementById(listId);
    const section = toggle.closest('.history-section');
    toggle.addEventListener('click', () => {
        const collapsed = section.classList.toggle('collapsed');
        list.classList.toggle('hidden', collapsed);
    });
}

function loadSettingsIntoForm() {
    const { apiUrl } = getSettings();
    document.getElementById('apiUrl').value = apiUrl;
}

// ── Auth ──────────────────────────────────────────────────────────────────────

function showLogin() {
    document.getElementById('loginOverlay').classList.remove('hidden');
}

function hideLogin() {
    document.getElementById('loginOverlay').classList.add('hidden');
}

function bindLoginEvents() {
    const btn   = document.getElementById('loginBtn');
    const errEl = document.getElementById('loginError');

    const { apiUrl } = getSettings();
    document.getElementById('loginUrl').value = apiUrl || window.location.origin;

    btn.addEventListener('click', async () => {
        const url      = document.getElementById('loginUrl').value.trim();
        const username = document.getElementById('loginUsername').value.trim();
        const password = document.getElementById('loginPassword').value;

        if (!url || !username || !password) {
            errEl.textContent = 'Completa todos los campos.';
            return;
        }

        btn.disabled      = true;
        btn.textContent   = 'Conectando…';
        errEl.textContent = '';

        try {
            const res = await fetch(`${url.replace(/\/$/, '')}/api/login`, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ username, password }),
            });

            if (res.status === 401) {
                errEl.textContent = 'Usuario o contraseña incorrectos.';
                btn.disabled    = false;
                btn.textContent = 'Conectar';
                return;
            }
            if (!res.ok) throw new Error(`HTTP ${res.status}`);

            const { token } = await res.json();
            persistSettings(url, token, username);
            loadSettingsIntoForm();
            hideLogin();
            mapState.centered = false;
            startRefreshing();
            connectWS();
        } catch (err) {
            errEl.textContent = `Error de conexión: ${err.message}`;
            btn.disabled    = false;
            btn.textContent = 'Conectar';
        }
    });

    document.getElementById('loginOverlay').querySelectorAll('input').forEach(inp => {
        inp.addEventListener('keydown', e => { if (e.key === 'Enter') btn.click(); });
    });
}

function bindWipeModal() {
    document.getElementById('btnWipe').addEventListener('click', () => {
        document.getElementById('wipePassword').value = '';
        document.getElementById('wipeError').textContent = '';
        document.getElementById('modalWipe').classList.remove('hidden');
        setTimeout(() => document.getElementById('wipePassword').focus(), 50);
    });

    document.getElementById('modalWipeCancel').addEventListener('click', () => {
        document.getElementById('modalWipe').classList.add('hidden');
    });

    document.getElementById('modalWipeConfirm').addEventListener('click', async () => {
        const password = document.getElementById('wipePassword').value;
        const errEl    = document.getElementById('wipeError');
        const btn      = document.getElementById('modalWipeConfirm');

        if (!password) { document.getElementById('wipePassword').focus(); return; }

        btn.disabled    = true;
        btn.textContent = 'Verificando…';
        errEl.textContent = '';

        try {
            const { apiUrl, apiUsername } = getSettings();
            const res = await fetch(`${apiUrl}/api/login`, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ username: apiUsername, password }),
            });

            if (res.status === 401) {
                errEl.textContent = 'Contraseña incorrecta.';
                btn.disabled    = false;
                btn.textContent = 'Borrar datos';
                return;
            }
            if (!res.ok) throw new Error(`HTTP ${res.status}`);

            document.getElementById('modalWipe').classList.add('hidden');
            sendCommand('WIPE', 'CONFIRM');
        } catch (err) {
            errEl.textContent = `Error: ${err.message}`;
            btn.disabled    = false;
            btn.textContent = 'Borrar datos';
        }
    });

    document.getElementById('wipePassword').addEventListener('keydown', e => {
        if (e.key === 'Enter')  document.getElementById('modalWipeConfirm').click();
        if (e.key === 'Escape') document.getElementById('modalWipe').classList.add('hidden');
    });
}

let refreshInterval = null;

function startRefreshing() {
    if (refreshInterval) return;
    refresh();
    loadCommandHistory();
    loadGeofence();
    refreshInterval = setInterval(refresh, 30_000);
    setInterval(loadCommandHistory, 120_000);
}

async function checkAuth() {
    const { apiToken } = getSettings();
    if (!apiToken) { showLogin(); return; }

    try {
        const { apiUrl } = getSettings();
        const res = await fetch(`${apiUrl}/api/location/latest`, {
            headers: { 'Authorization': `Bearer ${apiToken}` },
        });
        if (res.status === 401) {
            localStorage.removeItem('tracer_token');
            showLogin();
        } else {
            hideLogin();
            startRefreshing();
            connectWS();
        }
    } catch {
        hideLogin();
        startRefreshing();
        connectWS();
    }
}

// ── Init ──────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
    initMap();
    loadSettingsIntoForm();
    bindEvents();
    bindToggleButtons();
    bindLoginEvents();
    bindWipeModal();
    bindGeofenceEvents();
    bindPhotoGallery();
    syncNotifBtn();
    checkAuth();
});
