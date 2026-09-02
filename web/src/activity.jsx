// Activity view — historial de comandos enviados al dispositivo

const ACTIVITY_LABELS = {
  ring: { label: 'Hizo sonar', icon: 'IconRing', tone: 'default' },
  'ring-stop': { label: 'Detuvo el sonido', icon: 'IconRing', tone: 'default' },
  lost: { label: 'Activó modo perdido', icon: 'IconLock', tone: 'warn' },
  wipe: { label: 'Inició borrado remoto', icon: 'IconErase', tone: 'danger' },
  photo: { label: 'Capturó foto remota', icon: 'IconCamera', tone: 'covert' },
  audio: { label: 'Grabó audio ambiente', icon: 'IconMic', tone: 'covert' },
  screen: { label: 'Capturó pantalla', icon: 'IconScreen', tone: 'covert' },
  'silent-call': { label: 'Grabó el entorno', icon: 'IconMic', tone: 'covert' },
  flash: { label: 'Encendió linterna', icon: 'IconFlash', tone: 'default' },
  'flash-stop': { label: 'Apagó linterna', icon: 'IconFlash', tone: 'default' },
  vibrate: { label: 'Hizo vibrar', icon: 'IconVibrate', tone: 'default' },
  'vibrate-stop': { label: 'Detuvo la vibración', icon: 'IconVibrate', tone: 'default' },
  gps: { label: 'Forzó GPS preciso', icon: 'IconBoltGPS', tone: 'default' },
  locate: { label: 'Solicitó ubicación', icon: 'IconBoltGPS', tone: 'default' },
  callback: { label: 'Inició llamada de retorno', icon: 'IconRing', tone: 'covert' },
  geofence: { label: 'Salió de la zona segura', icon: 'IconGeofence', tone: 'warn' },
  message: { label: 'Envió mensaje', icon: 'IconMessage', tone: 'default' },
  stealth: { label: 'Activó modo sigilo', icon: 'IconStealth', tone: 'warn' },
  unstealth: { label: 'Desactivó modo sigilo', icon: 'IconStealth', tone: 'default' },
  'alert-on': { label: 'Activó modo alerta', icon: 'IconBell', tone: 'warn' },
  'alert-off': { label: 'Desactivó modo alerta', icon: 'IconBell', tone: 'default' },
  'keyguard-on': { label: 'Restringió la pantalla de bloqueo', icon: 'IconLock', tone: 'warn' },
  'keyguard-off': { label: 'Restauró la pantalla de bloqueo', icon: 'IconLock', tone: 'default' },
  apps: { label: 'Bloqueó apps sensibles', icon: 'IconAppBlock', tone: 'warn' },
  key: { label: 'Cambió contraseña', icon: 'IconKey', tone: 'warn' },
};

const CMD_TO_KIND = {
  'RING': 'ring',
  'RING_STOP': 'ring-stop',
  'LOCK': 'lost',
  'WIPE': 'wipe',
  'PHOTO': 'photo',
  'AUDIO': 'audio',
  'SCREENSHOT': 'screen',
  'SILENT_CALL': 'silent-call',
  'FLASH': 'flash',
  'FLASH_STOP': 'flash-stop',
  'VIBRATE': 'vibrate',
  'VIBRATE_STOP': 'vibrate-stop',
  'GPS_HIGH': 'gps',
  'LOCATE': 'locate',
  'CALLBACK': 'callback',
  'MESSAGE': 'message',
  'STEALTH': 'stealth',
  'UNSTEALTH': 'unstealth',
  'BLOCK_APPS': 'apps',
  'RESET_PIN': 'key',
  'ALERT_ON': 'alert-on',
  'ALERT_OFF': 'alert-off',
  'KEYGUARD_ON': 'keyguard-on',
  'KEYGUARD_OFF': 'keyguard-off',
  'GEO_BREACH': 'geofence',
};

function ActivityView({ cmdLog, devices }) {
  const [filter, setFilter] = React.useState('all');

  const all = cmdLog.map((cmd) => {
    const kind = CMD_TO_KIND[cmd.command] || cmd.command.toLowerCase();
    // pending = en cola · dispatched = recibido por el dispositivo, en ejecución
    const status = cmd.status === 'executed' ? 'completed'
      : (cmd.status === 'pending' || cmd.status === 'dispatched') ? 'in-progress'
      : 'completed';
    const statusLabel = cmd.status === 'executed' ? 'Completado'
      : cmd.status === 'dispatched' ? 'En el dispositivo'
      : cmd.status === 'pending' ? 'En cola'
      : 'Completado';
    return {
      id: 'cmd-' + cmd.id,
      kind,
      deviceId: devices[0]?.id || '',
      timestamp: cmd.ts || tracerFormatHistoryTime(cmd.created_at),
      detail: cmd.args || cmd.result || '—',
      status,
      statusLabel,
    };
  });

  const filtered = filter === 'all' ? all
    : filter === 'covert' ? all.filter(a => ACTIVITY_LABELS[a.kind]?.tone === 'covert')
    : all.filter(a => a.kind === filter);

  return (
    <div className="view-pad">
      <TracerTopBar
        title="Actividad"
        subtitle={`${all.length} comandos enviados · historial del dispositivo`}
        right={
          <div className="seg">
            <button className={`seg-btn ${filter === 'all' ? 'is-on' : ''}`} onClick={() => setFilter('all')}>Todo</button>
            <button className={`seg-btn ${filter === 'covert' ? 'is-on' : ''}`} onClick={() => setFilter('covert')}>Vigilancia</button>
            <button className={`seg-btn ${filter === 'ring' ? 'is-on' : ''}`} onClick={() => setFilter('ring')}>Sonar</button>
          </div>
        }
      />

      <div className="activity-list">
        {filtered.length === 0 ? (
          <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
            No hay actividad registrada
          </div>
        ) : filtered.map((a) => {
          const meta = ACTIVITY_LABELS[a.kind] || { label: a.kind, icon: 'IconActivity', tone: 'default' };
          const Icon = window[meta.icon] || IconActivity;
          const device = devices.find((d) => d.id === a.deviceId);
          return (
            <div key={a.id} className="activity-row">
              <div className={`activity-icon activity-icon-${meta.tone}`}>
                <Icon width={14} height={14} />
              </div>
              <div className="activity-body">
                <div className="activity-title">
                  {meta.label}
                  {device && <span className="activity-device"> · {device.name}</span>}
                </div>
                <div className="activity-detail">{a.detail}</div>
              </div>
              <div className="activity-meta">
                <div className="activity-time mono">{a.timestamp}</div>
                <div className={`activity-status activity-status-${a.status}`}>
                  {a.statusLabel}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

window.ActivityView = ActivityView;
window.ACTIVITY_LABELS = ACTIVITY_LABELS;
