import { useState } from 'react';
import { useTracer } from '../TracerContext';
import { relativeTime } from '../helpers';

// ── Icons ─────────────────────────────────────────────────────────────────────

function ChevronIcon() {
  return (
    <svg className="chevron" xmlns="http://www.w3.org/2000/svg" width="13" height="13"
      viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round">
      <polyline points="18 15 12 9 6 15" />
    </svg>
  );
}

// ── DeviceCard ────────────────────────────────────────────────────────────────

function DeviceCard() {
  const { deviceName, deviceModel, statusDotClass, statusLabel, statusTextClass, lastSeen } = useTracer();
  return (
    <div className="device-card">
      <div className="device-icon">
        <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24"
          fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
          <line x1="12" y1="18" x2="12.01" y2="18" />
        </svg>
      </div>
      <div className="device-meta">
        <p className="device-name">{deviceName}</p>
        <p className="device-model">{deviceModel}</p>
        <div className="device-status-row">
          <span className={`status-dot${statusDotClass ? ' ' + statusDotClass : ''}`} />
          <span className={`status-text${statusTextClass ? ' ' + statusTextClass : ''}`}>{statusLabel}</span>
          <span className="last-seen">{lastSeen}</span>
        </div>
      </div>
    </div>
  );
}

// ── StatsRow ──────────────────────────────────────────────────────────────────

function StatsRow() {
  const { battery, batteryColor, signal } = useTracer();
  return (
    <div className="stats-row">
      <div className="stat-card">
        <div className="stat-label-row">
          <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24"
            fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="1" y="6" width="18" height="12" rx="2" />
            <line x1="23" y1="13" x2="23" y2="11" />
          </svg>
          <span>BATERÍA</span>
        </div>
        <p className="stat-value" style={{ color: batteryColor }}>{battery}</p>
      </div>
      <div className="stat-card">
        <div className="stat-label-row">
          <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24"
            fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12.55a11 11 0 0 1 14.08 0" />
            <path d="M1.42 9a16 16 0 0 1 21.16 0" />
            <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
            <line x1="12" y1="20" x2="12.01" y2="20" />
          </svg>
          <span>SEÑAL</span>
        </div>
        <p className="stat-value">{signal}</p>
      </div>
    </div>
  );
}

// ── AlertBanner ───────────────────────────────────────────────────────────────

function AlertBanner() {
  const { alertBannerText, alertBannerVisible } = useTracer();
  return (
    <div className={`alert-banner${alertBannerVisible ? ' visible' : ''}`}>
      {alertBannerText}
    </div>
  );
}

// ── CommandLog ────────────────────────────────────────────────────────────────

function CommandLog() {
  const { cmdLog, cmdLogOpen, setCmdLogOpen } = useTracer();
  return (
    <div className={`history-section${!cmdLogOpen ? ' collapsed' : ''}`}>
      <button className="history-header" onClick={() => setCmdLogOpen((v) => !v)}>
        <div className="history-header-left">
          <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24"
            fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
          </svg>
          <span>Registro</span>
        </div>
        <ChevronIcon />
      </button>
      {cmdLogOpen && (
        <ul className="history-list">
          {cmdLog.length === 0 ? (
            <li className="history-empty">Sin comandos</li>
          ) : (
            cmdLog.map((cmd) => (
              <li key={cmd.id} className="cmd-log-item">
                <span className={`cmd-badge ${cmd.status === 'executed' ? 'executed' : 'pending'}`}>
                  {cmd.command}
                </span>
                <div className="cmd-log-text">
                  <small>{cmd.ts}{cmd.args ? ' · ' + cmd.args : ''}</small>
                  <p
                    className="cmd-log-result"
                    style={!cmd.result && cmd.status === 'pending' ? { color: 'var(--subtext-lt)' } : undefined}
                  >
                    {cmd.result || (cmd.status === 'pending' ? 'Esperando…' : '')}
                  </p>
                </div>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}

// ── LocationHistory ───────────────────────────────────────────────────────────

function LocationHistory() {
  const { historyItems, historyLoading, historyOpen, setHistoryOpen, flyTo } = useTracer();
  return (
    <div className={`history-section${!historyOpen ? ' collapsed' : ''}`}>
      <button className="history-header" onClick={() => setHistoryOpen((v) => !v)}>
        <div className="history-header-left">
          <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24"
            fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
          <span>Historial</span>
        </div>
        <ChevronIcon />
      </button>
      {historyOpen && (
        <ul className="history-list">
          {historyItems.length === 0 ? (
            <li className="history-empty">
              {historyLoading ? 'Cargando…' : 'Sin ubicaciones aún'}
            </li>
          ) : (
            historyItems.map((item, i) => (
              <li key={i} className="history-item" onClick={() => flyTo(item.lat, item.lon)}>
                <div className="history-dot-wrap">
                  <div className={`history-dot${i === 0 ? ' current' : ''}`} />
                  {i < historyItems.length - 1 && <div className="history-connector" />}
                </div>
                <div className="history-text">
                  <strong title={item.name}>{item.name}</strong>
                  <small>{item.sub ? item.sub + ' · ' : ''}{item.ts}</small>
                </div>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}

// ── Geofence ──────────────────────────────────────────────────────────────────

function Geofence() {
  const {
    geofenceOpen, setGeofenceOpen,
    geofenceStatus, geofenceStatusClass,
    geofenceRadius, geofenceSaveDisabled, geofenceDeleteVisible, geofenceDrawMode,
    handleGeofencePick, handleGeofenceRadiusChange, handleGeofenceSave, handleGeofenceDelete,
  } = useTracer();

  return (
    <div className={`history-section${!geofenceOpen ? ' collapsed' : ''}`}>
      <button className="history-header" onClick={() => setGeofenceOpen((v) => !v)}>
        <div className="history-header-left">
          <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24"
            fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <circle cx="12" cy="12" r="3" />
            <line x1="12" y1="2" x2="12" y2="5" />
            <line x1="12" y1="19" x2="12" y2="22" />
            <line x1="2" y1="12" x2="5" y2="12" />
            <line x1="19" y1="12" x2="22" y2="12" />
          </svg>
          <span>Geocerca</span>
        </div>
        <ChevronIcon />
      </button>
      {geofenceOpen && (
        <div className="geofence-body">
          <p className={`geofence-status${geofenceStatusClass ? ' ' + geofenceStatusClass : ''}`}>
            {geofenceStatus}
          </p>
          <label htmlFor="geofenceRadius">Radio (m)</label>
          <input
            id="geofenceRadius"
            type="number"
            min="50"
            max="50000"
            value={geofenceRadius}
            onChange={(e) => handleGeofenceRadiusChange(Number(e.target.value))}
          />
          <div className="geofence-actions">
            <button
              className={`btn-geo-pick${geofenceDrawMode ? ' active' : ''}`}
              onClick={handleGeofencePick}
            >
              {geofenceDrawMode ? 'Cancelar' : 'Marcar en mapa'}
            </button>
            <button
              className="btn-geo-save"
              disabled={geofenceSaveDisabled}
              onClick={handleGeofenceSave}
            >
              Guardar
            </button>
          </div>
          {geofenceDeleteVisible && (
            <button className="btn-geo-delete" onClick={handleGeofenceDelete}>
              Eliminar zona
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Photo Modal ───────────────────────────────────────────────────────────────

function PhotoModal({ photos, onClose }) {
  return (
    <div
      className="photo-modal-overlay"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="photo-modal">
        <div className="photo-modal-header">
          <p className="photo-modal-title">Galería de fotos</p>
          <button className="photo-modal-close" onClick={onClose}>
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24"
              fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div className="photo-modal-body">
          {photos.length === 0 ? (
            <p className="photo-modal-empty">Sin fotos disponibles</p>
          ) : (
            <div className="photo-grid">
              {photos.map((p, i) => (
                <div key={i} className="photo-grid-item">
                  <img src={p.blobUrl} alt="Foto capturada" />
                  <p className="photo-grid-ts">{relativeTime(p.timestamp)}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Photos button ─────────────────────────────────────────────────────────────

function PhotosButton() {
  const { photos } = useTracer();
  const [open, setOpen] = useState(false);

  if (photos.length === 0) return null;

  return (
    <>
      <button className="btn-photos" onClick={() => setOpen(true)}>
        <div className="btn-photos-left">
          <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24"
            fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
            <circle cx="12" cy="13" r="4" />
          </svg>
          <span>Fotos</span>
        </div>
        <span className="photos-badge">{photos.length}</span>
      </button>
      {open && <PhotoModal photos={photos} onClose={() => setOpen(false)} />}
    </>
  );
}

// ── SidebarRight ──────────────────────────────────────────────────────────────

export default function SidebarRight() {
  return (
    <aside className="sidebar-right">
      <DeviceCard />
      <StatsRow />
      <AlertBanner />
      <CommandLog />
      <LocationHistory />
      <Geofence />
      <PhotosButton />
    </aside>
  );
}
