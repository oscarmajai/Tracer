// Advanced action modals: Photo, Audio, Screen, Silent Call, Geofence, Stealth, Message, etc.

function PhotoModal({ open, device, onClose, onConfirm }) {
  const [stage, setStage] = React.useState('config'); // config | capturing | done
  const [cam, setCam] = React.useState('front');
  const [silent, setSilent] = React.useState(true);
  React.useEffect(() => { if (open) setStage('config'); }, [open]);

  if (!device) return null;
  const start = () => {
    setStage('capturing');
    setTimeout(() => setStage('done'), 2200);
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
              Toma una foto silenciosa desde el dispositivo. No se mostrará ninguna alerta,
              flash ni sonido al obturador. Útil para identificar a quien lo tiene.
            </p>

            <div className="cam-picker">
              <button className={`cam-tile ${cam === 'front' ? 'is-active' : ''}`} onClick={() => setCam('front')}>
                <IconCamera width={20} height={20} />
                <div className="cam-tile-label">Cámara frontal</div>
                <div className="cam-tile-help">12 MP · Selfie</div>
              </button>
              <button className={`cam-tile ${cam === 'back' ? 'is-active' : ''}`} onClick={() => setCam('back')}>
                <IconCameraFlip width={20} height={20} />
                <div className="cam-tile-label">Cámara trasera</div>
                <div className="cam-tile-help">48 MP · Principal</div>
              </button>
            </div>

            <div className="checkbox-row">
              <label className="checkbox">
                <input type="checkbox" checked={silent} onChange={(e) => setSilent(e.target.checked)} />
                <span>Modo silencioso (sin obturador ni flash)</span>
              </label>
              <label className="checkbox">
                <input type="checkbox" defaultChecked />
                <span>Capturar metadatos GPS y red</span>
              </label>
            </div>
          </>
        )}

        {stage === 'capturing' && (
          <div className="capture-stage">
            <div className="capture-frame">
              <div className="capture-scanline" />
              <div className="capture-corners">
                <span /><span /><span /><span />
              </div>
              <div className="capture-center mono">CONECTANDO</div>
            </div>
            <div className="capture-status">
              <span className="loader-dots"><i /><i /><i /></span>
              Enviando comando · cifrado E2E
            </div>
          </div>
        )}

        {stage === 'done' && (
          <div className="capture-result">
            <div className="capture-photo">
              <div className="capture-photo-placeholder">
                <span className="mono">IMG_20260527_124842.jpg · 4080×3072</span>
              </div>
              <div className="capture-meta">
                <div className="capture-meta-row">
                  <span>Tomada</span><span className="mono">Hoy, 12:48:42</span>
                </div>
                <div className="capture-meta-row">
                  <span>Cámara</span><span>{cam === 'front' ? 'Frontal' : 'Trasera'}</span>
                </div>
                <div className="capture-meta-row">
                  <span>GPS</span><span className="mono">19.4284° N, 99.1660° W</span>
                </div>
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
        {stage === 'capturing' && (
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
        )}
        {stage === 'done' && (
          <>
            <button className="btn btn-ghost" onClick={onClose}>Cerrar</button>
            <button className="btn btn-primary" onClick={() => { onConfirm(); onClose(); }}>
              Guardar en mi cuenta
            </button>
          </>
        )}
      </footer>
    </Modal>
  );
}

function AudioModal({ open, device, onClose, onConfirm }) {
  const [stage, setStage] = React.useState('config');
  const [duration, setDuration] = React.useState(60);
  const [elapsed, setElapsed] = React.useState(0);

  React.useEffect(() => {
    if (open) { setStage('config'); setElapsed(0); }
  }, [open]);

  React.useEffect(() => {
    if (stage !== 'recording') return;
    const i = setInterval(() => setElapsed((e) => {
      if (e + 1 >= duration) { setStage('done'); return duration; }
      return e + 1;
    }), 100);
    return () => clearInterval(i);
  }, [stage, duration]);

  if (!device) return null;
  const start = () => { setElapsed(0); setStage('recording'); };

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
              Activa el micrófono de forma encubierta y graba sonido ambiente.
              El indicador del micrófono permanecerá oculto en pantalla.
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

        {stage === 'recording' && (
          <div className="audio-stage">
            <AudioBars />
            <div className="audio-timer mono">
              {fmtSec(elapsed)} <span className="audio-timer-total">/ {fmtSec(duration)}</span>
            </div>
            <div className="audio-progress">
              <div className="audio-progress-bar" style={{ width: `${(elapsed / duration) * 100}%` }} />
            </div>
            <div className="audio-status">Grabando · transmisión en vivo</div>
          </div>
        )}

        {stage === 'done' && (
          <div className="capture-result">
            <div className="audio-result-card">
              <div className="audio-result-icon"><IconMic width={20} height={20} /></div>
              <div className="audio-result-body">
                <div className="audio-result-title">rec_20260527_1248.m4a</div>
                <div className="audio-result-meta mono">{fmtSec(duration)} · 192 kbps · 2.4 MB</div>
              </div>
              <button className="btn btn-sm btn-ghost"><IconPlay width={12} height={12} /></button>
            </div>
            <div className="audio-waveform">
              {Array.from({ length: 60 }).map((_, i) => (
                <span key={i} style={{ height: `${20 + Math.sin(i * 0.6) * 14 + Math.random() * 14}px` }} />
              ))}
            </div>
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
        {stage === 'recording' && (
          <button className="btn btn-danger-outline" onClick={() => setStage('done')}>Detener</button>
        )}
        {stage === 'done' && (
          <>
            <button className="btn btn-ghost" onClick={onClose}>Cerrar</button>
            <button className="btn btn-primary" onClick={() => { onConfirm(); onClose(); }}>Guardar</button>
          </>
        )}
      </footer>
    </Modal>
  );
}

function AudioBars() {
  return (
    <div className="audio-bars">
      {Array.from({ length: 32 }).map((_, i) => (
        <span key={i} className="audio-bar" style={{ animationDelay: `${i * 35}ms` }} />
      ))}
    </div>
  );
}

function fmtSec(s) {
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
}

function ScreenshotModal({ open, device, onClose, onConfirm }) {
  const [stage, setStage] = React.useState('config');
  React.useEffect(() => { if (open) setStage('config'); }, [open]);
  if (!device) return null;
  const start = () => { setStage('capturing'); setTimeout(() => setStage('done'), 1400); };

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
            Toma una imagen exacta de lo que está mostrándose en este momento en el dispositivo.
            La captura es silenciosa y no aparece en el carrete de fotos.
          </p>
        )}
        {stage === 'capturing' && (
          <div className="capture-stage">
            <div className="capture-frame screen-frame">
              <div className="capture-scanline" />
              <div className="capture-center mono">CAPTURANDO PANTALLA</div>
            </div>
          </div>
        )}
        {stage === 'done' && (
          <div className="capture-result">
            <div className="screen-result">
              <div className="screen-mock-bar">
                <span className="mono">9:41</span>
                <span className="mono">·····</span>
              </div>
              <div className="screen-mock-body">
                <span className="mono">Screenshot_20260527.png</span>
                <span className="screen-mock-help">1280×2856 · 4.1 MB</span>
              </div>
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
        ) : stage === 'done' ? (
          <>
            <button className="btn btn-ghost" onClick={onClose}>Cerrar</button>
            <button className="btn btn-primary" onClick={() => { onConfirm(); onClose(); }}>Guardar imagen</button>
          </>
        ) : null}
      </footer>
    </Modal>
  );
}

function SilentCallModal({ open, device, onClose, onConfirm }) {
  const [stage, setStage] = React.useState('config');
  const [elapsed, setElapsed] = React.useState(0);
  React.useEffect(() => { if (open) { setStage('config'); setElapsed(0); } }, [open]);
  React.useEffect(() => {
    if (stage !== 'live') return;
    const i = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(i);
  }, [stage]);
  if (!device) return null;

  return (
    <Modal open={open} onClose={onClose}>
      <header className="modal-head">
        <div className="modal-eyebrow">Vigilancia · Llamada silenciosa</div>
        <h3>Escuchar el entorno en vivo</h3>
        <button className="modal-close" onClick={onClose}><IconClose width={14} height={14} /></button>
      </header>

      <div className="modal-body">
        {stage === 'config' && (
          <p className="modal-lead">
            Activa el micrófono y transmite el audio en vivo a este navegador.
            La llamada no aparece en el registro y no muestra ningún indicador en la pantalla del dispositivo.
          </p>
        )}
        {stage === 'live' && (
          <div className="audio-stage">
            <AudioBars />
            <div className="live-call-status">
              <span className="live-dot" /> En llamada · {device.name}
            </div>
            <div className="audio-timer mono">{fmtSec(elapsed)}</div>
            <div className="audio-status">Encriptado · 192 kbps · sin registro</div>
          </div>
        )}
      </div>

      <footer className="modal-foot">
        {stage === 'config' ? (
          <>
            <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
            <button className="btn btn-primary" onClick={() => setStage('live')}>
              <IconMic width={14} height={14} /> Iniciar llamada
            </button>
          </>
        ) : (
          <button className="btn btn-danger" onClick={() => { onConfirm(); onClose(); }}>
            Terminar llamada
          </button>
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

function GeofenceModal({ open, device, onClose, onConfirm }) {
  const [radius, setRadius] = React.useState(200);
  const [name, setName] = React.useState('Casa');
  const [trigger, setTrigger] = React.useState('exit');
  if (!device) return null;
  return (
    <Modal open={open} onClose={onClose} size="lg">
      <header className="modal-head">
        <div className="modal-eyebrow">Localización · Geocerca</div>
        <h3>Crear perímetro de seguridad</h3>
        <button className="modal-close" onClick={onClose}><IconClose width={14} height={14} /></button>
      </header>
      <div className="modal-body">
        <p className="modal-lead">
          Recibe una alerta cuando {device.name} entre o salga de una zona específica.
        </p>

        <div className="geofence-preview">
          <div className="geofence-map">
            <TracerMap />
            <svg className="geofence-overlay" viewBox="0 0 1000 1000" preserveAspectRatio="xMidYMid slice">
              <circle cx="520" cy="480" r={radius / 0.6} fill="var(--accent)" fillOpacity="0.10" stroke="var(--accent)" strokeWidth="2" strokeDasharray="6 4" />
              <circle cx="520" cy="480" r="8" fill="#fff" stroke="var(--accent)" strokeWidth="2" />
            </svg>
          </div>
        </div>

        <div className="form-grid form-grid-2">
          <label className="form-field">
            <span>Nombre de la zona</span>
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <div className="form-field">
            <span>Radio: <span className="mono">{radius} m</span></span>
            <input type="range" min="50" max="500" step="10"
                   value={radius} onChange={(e) => setRadius(+e.target.value)}
                   className="range" />
          </div>
        </div>

        <div className="form-field" style={{ marginTop: 12 }}>
          <span>Alertarme cuando</span>
          <div className="seg seg-full">
            <button className={`seg-btn ${trigger === 'exit' ? 'is-on' : ''}`} onClick={() => setTrigger('exit')}>Salga</button>
            <button className={`seg-btn ${trigger === 'enter' ? 'is-on' : ''}`} onClick={() => setTrigger('enter')}>Entre</button>
            <button className={`seg-btn ${trigger === 'both' ? 'is-on' : ''}`} onClick={() => setTrigger('both')}>Ambos</button>
          </div>
        </div>
      </div>
      <footer className="modal-foot">
        <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
        <button className="btn btn-primary" onClick={() => onConfirm(name, radius)}>
          <IconGeofence width={14} height={14} /> Crear geocerca
        </button>
      </footer>
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
