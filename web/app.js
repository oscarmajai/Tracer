'use strict';

// ── Settings ──────────────────────────────────────────────────────────────────

const DEFAULTS = {
<<<<<<< HEAD
    apiUrl:   window.location.origin,
=======
    apiUrl:   '',
>>>>>>> 8bbed06 (Se quitaron los datos de cdmx)
    apiToken: 'TracerSecretToken123',
};

function getSettings() {
    return {
        apiUrl:   localStorage.getItem('tracer_url')   || DEFAULTS.apiUrl,
        apiToken: localStorage.getItem('tracer_token') || DEFAULTS.apiToken,
    };
}

function persistSettings(url, token) {
    localStorage.setItem('tracer_url',   url.replace(/\/$/, ''));
    localStorage.setItem('tracer_token', token);
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

// ── Map ───────────────────────────────────────────────────────────────────────

const mapState = {
    instance:  null,
    marker:    null,
    trail:     null,
    centered:  false,
};

function initMap() {
    mapState.instance = L.map('map', { zoomControl: true })
        .setView([23.6345, -102.5528], 5); // Vista inicial: México

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
    }).addTo(mapState.instance);
}

function updateMap(latest, history) {
    const latlng = [latest.latitude, latest.longitude];

    // Marcador de posición actual
    if (!mapState.marker) {
        mapState.marker = L.marker(latlng).addTo(mapState.instance);
    } else {
        mapState.marker.setLatLng(latlng);
    }

    const ts  = new Date(latest.timestamp).toLocaleString('es-MX');
    const bat = latest.battery_level;
    mapState.marker.bindPopup(
        `<b>Batería: ${bat}%</b><br><small>${ts}</small>`
    );

    // Traza del historial (puntos en orden cronológico)
    if (history && history.length > 1) {
        const points = [...history].reverse().map(r => [r.latitude, r.longitude]);
        if (!mapState.trail) {
            mapState.trail = L.polyline(points, {
                color: '#1f6feb',
                weight: 2.5,
                opacity: 0.55,
            }).addTo(mapState.instance);
        } else {
            mapState.trail.setLatLngs(points);
        }
    }

    // Centrar en la primera carga o tras un reset de configuración
    if (!mapState.centered) {
        mapState.instance.setView(latlng, 15);
        mapState.centered = true;
    }
}

// ── Device info ───────────────────────────────────────────────────────────────

function updateDeviceInfo(latest) {
    const bat    = latest.battery_level;
    const batEl  = document.getElementById('battery');
    batEl.textContent = `${bat}%`;
    batEl.style.color = bat > 50 ? 'var(--success)' : bat > 20 ? 'var(--warning)' : 'var(--danger)';

    document.getElementById('timestamp').textContent = relativeTime(latest.timestamp);

    const lat  = latest.latitude.toFixed(5);
    const lon  = latest.longitude.toFixed(5);
    const link = document.getElementById('coordsLink');
    link.textContent = `${lat}, ${lon}`;
    link.href = `https://maps.google.com/?q=${latest.latitude},${latest.longitude}`;
}

function relativeTime(iso) {
    const diff = (Date.now() - new Date(iso)) / 1000;
    if (diff < 60)    return `hace ${Math.round(diff)}s`;
    if (diff < 3600)  return `hace ${Math.round(diff / 60)}min`;
    if (diff < 86400) return `hace ${Math.round(diff / 3600)}h`;
    return new Date(iso).toLocaleDateString('es-MX');
}

// ── Status bar ────────────────────────────────────────────────────────────────

function setStatus(online) {
    document.getElementById('statusDot').className  = `dot ${online ? 'online' : 'offline'}`;
    document.getElementById('statusText').textContent = online ? 'En línea' : 'Sin conexión';
}

function setLastUpdate() {
    document.getElementById('lastUpdate').textContent =
        `Actualizado: ${new Date().toLocaleTimeString('es-MX')}`;
}

// ── Photo ─────────────────────────────────────────────────────────────────────

async function fetchLatestPhoto() {
    try {
        const { apiUrl, apiToken } = getSettings();
        const res = await fetch(`${apiUrl}/api/photo/latest`, {
            headers: { 'Authorization': `Bearer ${apiToken}` },
        });
        if (!res.ok) return;

        const blob = await res.blob();
        const img  = document.getElementById('latestPhoto');

        if (img._objectUrl) URL.revokeObjectURL(img._objectUrl);
        img._objectUrl = URL.createObjectURL(blob);
        img.src        = img._objectUrl;
        img.style.display = 'block';

        const ts = res.headers.get('Last-Modified');
        document.getElementById('photoTimestamp').textContent =
            ts ? relativeTime(ts) : '';
        document.getElementById('photoSection').style.display = 'block';
    } catch (_) {
        // sin foto aún, ignorar silenciosamente
    }
}

// ── Refresh ───────────────────────────────────────────────────────────────────

async function refresh() {
    try {
        const [latest, history] = await Promise.all([
            apiFetch('/api/location/latest'),
            apiFetch('/api/location/history?limit=100'),
        ]);
        setStatus(true);
        setLastUpdate();
        if (latest) {
            updateDeviceInfo(latest);
            updateMap(latest, history || []);
        } else {
            document.getElementById('statusText').textContent = 'En línea – esperando primer ping';
        }
    } catch (err) {
        setStatus(false);
        console.warn('Refresh error:', err.message);
    }
    // Se ejecuta siempre; el panel de foto aparece solo cuando hay imágenes
    await fetchLatestPhoto();
}

// ── Commands ──────────────────────────────────────────────────────────────────

async function sendCommand(command, args) {
    const feedback = document.getElementById('cmdFeedback');
    feedback.textContent = `Enviando ${command}…`;
    feedback.className   = 'feedback';

    try {
        const body   = JSON.stringify({ command, args: args || '' });
        const result = await apiFetch('/api/command', { method: 'POST', body });
        feedback.textContent = `✓ ${command} encolado (id ${result.id})`;
        feedback.className   = 'feedback ok';
    } catch (err) {
        feedback.textContent = `✗ Error: ${err.message}`;
        feedback.className   = 'feedback err';
    }

    setTimeout(() => {
        feedback.textContent = '';
        feedback.className   = 'feedback';
    }, 4000);
}

// ── Event binding ─────────────────────────────────────────────────────────────

function bindEvents() {
    document.querySelectorAll('[data-cmd]').forEach(btn => {
        btn.addEventListener('click', () => {
            const cmd  = btn.dataset.cmd;
            const args = btn.dataset.args || '';

            // WIPE requiere doble confirmación explícita
            if (btn.dataset.wipe === 'true') {
                if (!confirm('⚠️ ¿Borrar TODOS los datos del dispositivo?\nEsta acción es IRREVERSIBLE.')) return;
                if (!confirm('SEGUNDA CONFIRMACIÓN\n¿Ejecutar borrado total de fábrica?')) return;
                sendCommand('WIPE', 'CONFIRM');
                return;
            }

            if (btn.dataset.confirm === 'true') {
                if (!confirm(`¿Ejecutar ${cmd}?\nEsta acción no se puede deshacer.`)) return;
            }

            sendCommand(cmd, args);
        });
    });

    document.getElementById('btnSave').addEventListener('click', () => {
        const url   = document.getElementById('apiUrl').value.trim();
        const token = document.getElementById('apiToken').value.trim();
        if (!url) return;
        persistSettings(url, token);
        mapState.centered = false; // re-centrar al reconectar
        refresh();
    });
}

function loadSettingsIntoForm() {
    const { apiUrl, apiToken } = getSettings();
    document.getElementById('apiUrl').value   = apiUrl;
    document.getElementById('apiToken').value = apiToken;
}

// ── Init ──────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
    initMap();
    loadSettingsIntoForm();
    bindEvents();
    refresh();
    setInterval(refresh, 30_000);
});
