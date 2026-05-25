'use strict';

// ── Settings ──────────────────────────────────────────────────────────────────

function getSettings() {
    return {
        apiUrl:      window.location.origin,
        apiToken:    localStorage.getItem('tracer_token')    || '',
        apiUsername: localStorage.getItem('tracer_username') || '',
    };
}

function persistSettings(token, username) {
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

const mapState = { instance: null, marker: null, trail: null, centered: false, deviceName: 'Device' };

function initMap() {
    mapState.instance = L.map('map', { zoomControl: false }).setView([23.6345, -102.5528], 5);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>',
        maxZoom: 19,
    }).addTo(mapState.instance);
    L.control.zoom({ position: 'bottomright' }).addTo(mapState.instance);
}

function makeDeviceIcon(initial) {
    return L.divIcon({
        className: '', html: `<div class="device-marker">${initial}</div>`,
        iconSize: [36, 36], iconAnchor: [18, 18], tooltipAnchor: [0, -22],
    });
}

function updateMap(latest, history) {
    const latlng  = [latest.latitude, latest.longitude];
    const initial = (mapState.deviceName || 'D').charAt(0).toUpperCase();
    if (!mapState.marker) {
        mapState.marker = L.marker(latlng, { icon: makeDeviceIcon(initial) }).addTo(mapState.instance);
        mapState.marker.bindTooltip(mapState.deviceName, {
            permanent: true, direction: 'bottom', offset: [0, 10], className: 'device-label',
        });
    } else {
        mapState.marker.setLatLng(latlng);
        mapState.marker.setIcon(makeDeviceIcon(initial));
        const tt = mapState.marker.getTooltip();
        if (tt) tt.setContent(mapState.deviceName);
    }
    const ts = new Date(latest.timestamp).toLocaleString('es-MX');
    mapState.marker.bindPopup(`<b>Batería: ${latest.battery_level}%</b><br><small>${ts}</small>`);
    if (history && history.length > 1) {
        const points = [...history].reverse().map(r => [r.latitude, r.longitude]);
        if (!mapState.trail) {
            mapState.trail = L.polyline(points, { color: '#2563eb', weight: 2.5, opacity: 0.5 }).addTo(mapState.instance);
        } else {
            mapState.trail.setLatLngs(points);
        }
    }
    if (!mapState.centered) {
        mapState.instance.setView(latlng, 15);
        mapState.centered = true;
    }
}

function tracerFlyTo(lat, lon) {
    mapState.instance.flyTo([lat, lon], 16, { duration: 1 });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const SIGNAL_LABELS = ['Sin señal', 'Débil', 'Moderada', 'Buena', 'Excelente'];

function relativeTime(iso) {
    const diff = (Date.now() - new Date(iso)) / 1000;
    if (diff < 60)    return `hace ${Math.round(diff)}s`;
    if (diff < 3600)  return `hace ${Math.round(diff / 60)}m`;
    if (diff < 86400) return `hace ${Math.round(diff / 3600)}h`;
    return new Date(iso).toLocaleDateString('es-MX');
}

function formatHistoryTime(iso) {
    const d    = new Date(iso);
    const now  = new Date();
    const time = d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
    return d.toDateString() === now.toDateString() ? `Hoy, ${time}` : d.toLocaleDateString('es-MX');
}

function sendNotification(title, body) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    new Notification(title, { body, tag: title });
}

// ── Photos ────────────────────────────────────────────────────────────────────

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
    loadBlobUrl(photo.filename).then(url => { if (url) { img._objUrl = url; img.src = url; } }).catch(() => {});
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

        const latest    = photos[0];
        const latestImg = document.createElement('img');
        latestImg.alt   = 'Foto capturada';
        const latestTs  = document.createElement('p');
        latestTs.className   = 'photo-gallery-ts';
        latestTs.textContent = relativeTime(latest.timestamp);
        latestWrap.append(latestImg, latestTs);
        loadBlobUrl(latest.filename).then(url => { if (url) { latestImg._objUrl = url; latestImg.src = url; } }).catch(() => {});

        if (photos.length > 1) {
            for (const photo of photos.slice(1)) renderPhotoItem(galleryOld, photo);
            btnGallery.style.display = '';
            btnGallery.textContent   = 'Ver más';
            galleryOld.classList.add('hidden');
        } else {
            btnGallery.style.display = 'none';
        }
        Alpine.store('tracer').photosVisible = true;
    } catch {}
}

async function loadPhotoFromEvent(filename, timestamp) {
    const latestWrap = document.getElementById('latestPhotoWrap');
    const galleryOld = document.getElementById('photoGalleryOld');
    const btnGallery = document.getElementById('btnPhotoGallery');

    if (latestWrap.hasChildNodes()) {
        const oldItem = document.createElement('div');
        oldItem.className = 'photo-gallery-old-item';
        while (latestWrap.firstChild) oldItem.appendChild(latestWrap.firstChild);
        galleryOld.insertBefore(oldItem, galleryOld.firstChild);
        btnGallery.style.display = '';
        btnGallery.textContent   = 'Ver más';
        galleryOld.classList.add('hidden');
    }
    const img  = document.createElement('img');
    img.alt    = 'Foto capturada';
    const tsEl = document.createElement('p');
    tsEl.className   = 'photo-gallery-ts';
    tsEl.textContent = relativeTime(timestamp);
    latestWrap.append(img, tsEl);
    try {
        const url = await loadBlobUrl(filename);
        if (url) { img._objUrl = url; img.src = url; }
    } catch {}
    Alpine.store('tracer').photosVisible = true;
}

// ── Geofence ──────────────────────────────────────────────────────────────────

const geofenceState = { circle: null, drawMode: false, pending: null };

function drawGeofenceCircle(lat, lon, radius) {
    if (geofenceState.circle) {
        geofenceState.circle.setLatLng([lat, lon]);
        geofenceState.circle.setRadius(radius);
    } else {
        geofenceState.circle = L.circle([lat, lon], {
            radius, color: '#2563eb', fillColor: '#2563eb', fillOpacity: 0.08, weight: 2,
        }).addTo(mapState.instance);
    }
}

function clearGeofenceCircle() {
    if (geofenceState.circle) { mapState.instance.removeLayer(geofenceState.circle); geofenceState.circle = null; }
}

async function loadGeofence() {
    try {
        const gf = await apiFetch('/api/geofence');
        if (!gf) return;
        const s = Alpine.store('tracer');
        geofenceState.pending   = { lat: gf.lat, lon: gf.lon };
        s.geofenceRadius        = gf.radius;
        s.geofenceStatus        = gf.enabled ? `Zona activa · ${gf.radius}m` : `Zona inactiva · ${gf.radius}m`;
        s.geofenceStatusClass   = gf.enabled ? 'active' : '';
        s.geofenceDeleteVisible = true;
        s.geofenceSaveDisabled  = false;
        drawGeofenceCircle(gf.lat, gf.lon, gf.radius);
    } catch {}
}

function tracerGeofencePick() {
    const s = Alpine.store('tracer');
    geofenceState.drawMode = !geofenceState.drawMode;
    s.geofenceDrawMode = geofenceState.drawMode;
    mapState.instance.getContainer().style.cursor = geofenceState.drawMode ? 'crosshair' : '';
    if (!geofenceState.drawMode) {
        s.geofenceStatus      = geofenceState.pending ? 'Listo · click Guardar para activar' : 'Sin zona configurada';
        s.geofenceStatusClass = geofenceState.pending ? 'drawing' : '';
    } else {
        s.geofenceStatus      = 'Haz click en el mapa para centrar la zona';
        s.geofenceStatusClass = 'drawing';
    }
}

function tracerGeofenceRadiusChange() {
    const s = Alpine.store('tracer');
    if (geofenceState.circle && geofenceState.pending) {
        geofenceState.circle.setRadius(s.geofenceRadius || 500);
    }
}

async function tracerGeofenceSave() {
    const s = Alpine.store('tracer');
    if (!geofenceState.pending) return;
    const radius = s.geofenceRadius || 500;
    try {
        await apiFetch('/api/geofence', {
            method: 'POST',
            body: JSON.stringify({ lat: geofenceState.pending.lat, lon: geofenceState.pending.lon, radius, enabled: true }),
        });
        s.geofenceStatus        = `Zona activa · ${radius}m`;
        s.geofenceStatusClass   = 'active';
        s.geofenceDeleteVisible = true;
        drawGeofenceCircle(geofenceState.pending.lat, geofenceState.pending.lon, radius);
    } catch {
        s.geofenceStatus = 'Error al guardar';
    }
}

async function tracerGeofenceDelete() {
    if (!confirm('¿Eliminar la zona segura?')) return;
    const s = Alpine.store('tracer');
    try {
        const { apiUrl, apiToken } = getSettings();
        await fetch(`${apiUrl}/api/geofence`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${apiToken}` } });
        clearGeofenceCircle();
        geofenceState.pending   = null;
        s.geofenceStatus        = 'Sin zona configurada';
        s.geofenceStatusClass   = '';
        s.geofenceDeleteVisible = false;
        s.geofenceSaveDisabled  = true;
    } catch {}
}

// ── State updates ─────────────────────────────────────────────────────────────

let lowBatNotified = false;
let _statusOnline  = null;
let alertTimer     = null;

function updateDeviceInfo(latest) {
    const s    = Alpine.store('tracer');
    const name = latest.device_name || latest.device_id || 'Unknown';
    mapState.deviceName = name;
    s.deviceName  = name;
    s.deviceModel = latest.device_id || '—';
    s.lastSeen    = relativeTime(latest.timestamp);

    const bat = latest.battery_level;
    s.battery      = `${bat}%${latest.is_charging ? ' ⚡' : ''}`;
    s.batteryColor = bat > 50 ? 'var(--success)' : bat > 20 ? 'var(--warning)' : 'var(--danger)';

    if (bat <= 15 && !lowBatNotified) {
        sendNotification('Batería baja', `Batería al ${bat}% en ${name}`);
        lowBatNotified = true;
    } else if (bat > 15) {
        lowBatNotified = false;
    }

    s.signal = latest.signal_level != null
        ? (SIGNAL_LABELS[latest.signal_level] ?? `${latest.signal_level}`)
        : '—';
}

function setStatus(online) {
    if (_statusOnline === true && !online) {
        sendNotification('Dispositivo desconectado', 'Tracer dejó de reportar ubicación');
    }
    _statusOnline = online;
    Alpine.store('tracer').statusOnline = online;
}

async function renderHistory(history) {
    const s = Alpine.store('tracer');
    s.historyLoading = false;
    if (!history || history.length === 0) { s.historyItems = []; return; }

    const seen = new Set(), unique = [];
    for (const r of history) {
        const key = `${r.latitude.toFixed(3)},${r.longitude.toFixed(3)}`;
        if (!seen.has(key)) { seen.add(key); unique.push(r); if (unique.length >= 5) break; }
    }

    const geocoded = await Promise.all(unique.map(r => reverseGeocode(r.latitude, r.longitude)));
    s.historyItems = unique.map((r, i) => ({
        lat:  r.latitude,
        lon:  r.longitude,
        name: geocoded[i].name,
        sub:  geocoded[i].sub,
        ts:   formatHistoryTime(r.timestamp),
    }));
}

// ── Command log ───────────────────────────────────────────────────────────────

async function loadCommandHistory() {
    try {
        const history = await apiFetch('/api/command/history?limit=8');
        if (history) {
            Alpine.store('tracer').cmdLog = history.map(cmd => ({
                ...cmd, ts: formatHistoryTime(cmd.created_at),
            }));
        }
    } catch {}
}

function updateCommandLog(data) {
    const s = Alpine.store('tracer');
    s.cmdLog = s.cmdLog.map(cmd =>
        cmd.id === data.id
            ? { ...cmd, status: 'executed', result: data.result, executed_at: data.executed_at }
            : cmd
    );
}

function handleDeviceAlert(data) {
    const labels = { sim_change: 'Alerta: SIM cambiada', pin_fail: 'Alerta: intento de desbloqueo' };
    const title  = labels[data.type] || 'Alerta del dispositivo';
    const icon   = data.type === 'sim_change' ? '⚠️' : data.type === 'pin_fail' ? '📷' : '🔔';
    sendNotification(title, data.message || '');
    const s = Alpine.store('tracer');
    s.alertBannerText    = `${icon} ${title}${data.message ? ': ' + data.message : ''}`;
    s.alertBannerVisible = true;
    clearTimeout(alertTimer);
    alertTimer = setTimeout(() => { Alpine.store('tracer').alertBannerVisible = false; }, 8000);
}

// ── WebSocket ─────────────────────────────────────────────────────────────────

let ws = null, wsReconnectDelay = 1_000, wsConnected = false;

function connectWS() {
    const { apiUrl, apiToken } = getSettings();
    if (!apiToken) return;
    const wsUrl = apiUrl.replace(/^https/, 'wss').replace(/^http/, 'ws').replace(/\/$/, '')
        + '/ws?token=' + encodeURIComponent(apiToken);

    ws = new WebSocket(wsUrl);
    ws.onopen  = () => { wsConnected = true; wsReconnectDelay = 1_000; setStatus(true); };
    ws.onerror = () => {};
    ws.onclose = () => {
        wsConnected = false;
        wsReconnectDelay = Math.min(wsReconnectDelay * 2, 30_000);
        setStatus(false);
        setTimeout(connectWS, wsReconnectDelay);
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
                    if (!Alpine.store('tracer').cmdLog.find(e => e.id === msg.data.id)) loadCommandHistory();
                    break;
                case 'photo':
                    msg.data?.filename
                        ? loadPhotoFromEvent(msg.data.filename, msg.data.timestamp || new Date().toISOString())
                        : fetchPhotos();
                    break;
                case 'geofence_breach':
                    sendNotification('Alerta: zona segura abandonada',
                        `El dispositivo salió de la zona (${Math.round(msg.data.distance)}m del centro)`);
                    break;
                case 'alert':
                    handleDeviceAlert(msg.data);
                    break;
            }
        } catch {}
    };
}

// ── Refresh ───────────────────────────────────────────────────────────────────

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
        }
        if (history) renderHistory(history);
    } catch (err) {
        if (!wsConnected) setStatus(false);
        console.warn('Refresh error:', err.message);
    }
    await fetchPhotos();
}

// ── Alpine Store ──────────────────────────────────────────────────────────────

document.addEventListener('alpine:init', () => {
    Alpine.store('tracer', {
        // Auth
        loggedIn:      false,
        loginUsername: '',
        loginPassword: '',
        loginError:    '',
        loginLoading:  false,

        // Device
        deviceName:   '—',
        deviceModel:  '—',
        statusOnline: null,
        lastSeen:     '',
        battery:      '—',
        batteryColor: 'var(--text)',
        signal:       '—',

        get statusDotClass()  {
            return this.statusOnline === true ? 'online' : this.statusOnline === false ? 'offline' : '';
        },
        get statusLabel() {
            return this.statusOnline === true ? 'EN LÍNEA' : this.statusOnline === false ? 'DESCONECTADO' : 'Conectando…';
        },
        get statusTextClass() {
            return this.statusOnline === true ? '' : this.statusOnline === false ? 'offline' : 'connecting';
        },

        // Feedback
        feedbackText: '',
        feedbackMod:  '',

        // History
        historyItems:   [],
        historyLoading: true,
        historyOpen:    true,

        // Command log
        cmdLog:     [],
        cmdLogOpen: true,

        // Geofence
        geofenceOpen:         false,
        geofenceStatus:       'Sin zona configurada',
        geofenceStatusClass:  '',
        geofenceRadius:       500,
        geofenceSaveDisabled: true,
        geofenceDeleteVisible: false,
        geofenceDrawMode:     false,

        // Modals
        modal:          null,
        callbackNumber: '',
        lockMessage:    '',
        newPin:         '',
        wipePassword:   '',
        wipeError:      '',
        wipeLoading:    false,

        // Alert banner
        alertBannerText:    '',
        alertBannerVisible: false,

        // Photos
        photosVisible: false,

        // Toggles
        alertActive:    false,
        ringActive:     false,
        keyguardActive: false,

        // Notifications
        notifGranted: typeof Notification !== 'undefined' && Notification.permission === 'granted',

        // ── Methods ────────────────────────────────────────────────────────────

        async doLogin() {
            if (!this.loginUsername || !this.loginPassword) {
                this.loginError = 'Completa todos los campos.';
                return;
            }
            this.loginLoading = true;
            this.loginError   = '';
            try {
                const res = await fetch('/api/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username: this.loginUsername, password: this.loginPassword }),
                });
                if (res.status === 401) {
                    this.loginError = 'Usuario o contraseña incorrectos.';
                    this.loginLoading = false;
                    return;
                }
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const { token } = await res.json();
                persistSettings(token, this.loginUsername);
                this.loggedIn    = true;
                this.loginLoading = false;
                mapState.centered = false;
                startRefreshing();
                connectWS();
            } catch (err) {
                this.loginError   = `Error de conexión: ${err.message}`;
                this.loginLoading = false;
            }
        },

        async sendCmd(command, args = '') {
            this.feedbackText = `Enviando ${command}…`;
            this.feedbackMod  = '';
            try {
                const result = await apiFetch('/api/command', {
                    method: 'POST',
                    body: JSON.stringify({ command, args }),
                });
                this.cmdLog.unshift({
                    id: result.id, command, args, status: 'pending', result: '',
                    created_at: new Date().toISOString(), ts: formatHistoryTime(new Date().toISOString()),
                });
                if (this.cmdLog.length > 8) this.cmdLog.pop();
                this.feedbackText = `✓ ${command} en cola (id ${result.id})`;
                this.feedbackMod  = 'ok';
            } catch (err) {
                this.feedbackText = `✗ Error: ${err.message}`;
                this.feedbackMod  = 'err';
            }
            setTimeout(() => { this.feedbackText = ''; this.feedbackMod = ''; }, 4000);
        },

        sendCmdConfirm(command) {
            if (!confirm(`¿Ejecutar ${command}?\nEsta acción no se puede deshacer.`)) return;
            this.sendCmd(command);
        },

        toggleAlert() {
            this.alertActive = !this.alertActive;
            this.sendCmd(this.alertActive ? 'ALERT_ON' : 'ALERT_OFF');
        },

        toggleRing() {
            this.ringActive = !this.ringActive;
            this.sendCmd(this.ringActive ? 'RING' : 'RING_STOP');
        },

        toggleKeyguard() {
            this.keyguardActive = !this.keyguardActive;
            this.sendCmd(this.keyguardActive ? 'KEYGUARD_ON' : 'KEYGUARD_OFF');
        },

        openModal(name) {
            this.callbackNumber = '';
            this.lockMessage    = '';
            this.newPin         = '';
            this.wipePassword   = '';
            this.wipeError      = '';
            this.wipeLoading    = false;
            this.modal = name;
        },

        confirmCallback() {
            if (!this.callbackNumber.trim()) return;
            const num = this.callbackNumber.trim();
            this.modal = null;
            this.sendCmd('CALLBACK', num);
        },

        confirmLock() {
            const msg = this.lockMessage.trim();
            this.modal = null;
            this.sendCmd('LOCK', msg);
        },

        confirmResetPin() {
            if (this.newPin.trim().length < 4) return;
            const pin = this.newPin.trim();
            this.modal = null;
            this.sendCmd('RESET_PIN', pin);
        },

        async confirmWipe() {
            if (!this.wipePassword) return;
            this.wipeLoading = true;
            this.wipeError   = '';
            try {
                const { apiUsername } = getSettings();
                const res = await fetch('/api/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username: apiUsername, password: this.wipePassword }),
                });
                if (res.status === 401) {
                    this.wipeError   = 'Contraseña incorrecta.';
                    this.wipeLoading = false;
                    return;
                }
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                this.modal       = null;
                this.wipeLoading = false;
                this.sendCmd('WIPE', 'CONFIRM');
            } catch (err) {
                this.wipeError   = `Error: ${err.message}`;
                this.wipeLoading = false;
            }
        },

        async requestNotifications() {
            if (!('Notification' in window)) return;
            await Notification.requestPermission();
            this.notifGranted = Notification.permission === 'granted';
        },
    });
});

// ── Refresh loop ──────────────────────────────────────────────────────────────

let refreshInterval = null;

function startRefreshing() {
    if (refreshInterval) return;
    refresh();
    loadCommandHistory();
    loadGeofence();
    refreshInterval = setInterval(refresh, 30_000);
    setInterval(loadCommandHistory, 120_000);
}

// ── Auth check ────────────────────────────────────────────────────────────────

async function checkAuth() {
    const { apiToken } = getSettings();
    if (!apiToken) return;
    try {
        const { apiUrl } = getSettings();
        const res = await fetch(`${apiUrl}/api/location/latest`, {
            headers: { 'Authorization': `Bearer ${apiToken}` },
        });
        if (res.status === 401) {
            localStorage.removeItem('tracer_token');
        } else {
            Alpine.store('tracer').loggedIn = true;
            startRefreshing();
            connectWS();
        }
    } catch {
        Alpine.store('tracer').loggedIn = true;
        startRefreshing();
        connectWS();
    }
}

// ── Init ──────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
    initMap();

    mapState.instance.on('click', (e) => {
        if (!geofenceState.drawMode) return;
        const { lat, lng } = e.latlng;
        const s = Alpine.store('tracer');
        const radius = s.geofenceRadius || 500;
        geofenceState.pending  = { lat, lon: lng };
        geofenceState.drawMode = false;
        s.geofenceDrawMode     = false;
        mapState.instance.getContainer().style.cursor = '';
        s.geofenceSaveDisabled = false;
        drawGeofenceCircle(lat, lng, radius);
        s.geofenceStatus      = `Centro: ${lat.toFixed(4)}, ${lng.toFixed(4)}`;
        s.geofenceStatusClass = 'drawing';
    });

    document.getElementById('btnPhotoGallery').addEventListener('click', () => {
        const galleryOld = document.getElementById('photoGalleryOld');
        const btn        = document.getElementById('btnPhotoGallery');
        const nowHidden  = galleryOld.classList.toggle('hidden');
        btn.textContent  = nowHidden ? 'Ver más' : 'Ver menos';
    });

    checkAuth();
});
