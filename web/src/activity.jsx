// Activity view — historial de comandos enviados al dispositivo

const ACTIVITY_LABELS = {
  ring: { label: 'Hizo sonar', icon: 'IconRing', tone: 'default' },
  lost: { label: 'Activó modo perdido', icon: 'IconLock', tone: 'warn' },
  wipe: { label: 'Inició borrado remoto', icon: 'IconErase', tone: 'danger' },
  photo: { label: 'Capturó foto remota', icon: 'IconCamera', tone: 'covert' },
  audio: { label: 'Grabó audio ambiente', icon: 'IconMic', tone: 'covert' },
  screen: { label: 'Capturó pantalla', icon: 'IconScreen', tone: 'covert' },
  'silent-call': { label: 'Inició llamada silenciosa', icon: 'IconRing', tone: 'covert' },
  flash: { label: 'Encendió linterna', icon: 'IconFlash', tone: 'default' },
  vibrate: { label: 'Hizo vibrar', icon: 'IconVibrate', tone: 'default' },
  gps: { label: 'Forzó GPS preciso', icon: 'IconBoltGPS', tone: 'default' },
  geofence: { label: 'Creó geocerca', icon: 'IconGeofence', tone: 'default' },
  message: { label: 'Envió mensaje', icon: 'IconMessage', tone: 'default' },
  stealth: { label: 'Activó modo sigilo', icon: 'IconStealth', tone: 'warn' },
  apps: { label: 'Bloqueó apps sensibles', icon: 'IconAppBlock', tone: 'warn' },
  key: { label: 'Cambió contraseña', icon: 'IconKey', tone: 'warn' },
};

const CMD_TO_KIND = {
  'RING': 'ring',
  'RING_STOP': 'ring',
  'LOCK': 'lost',
  'WIPE': 'wipe',
  'PHOTO': 'photo',
  'AUDIO': 'audio',
  'SCREENSHOT': 'screen',
  'SILENT_CALL': 'silent-call',
  'FLASH': 'flash',
  'VIBRATE': 'vibrate',
  'GPS_HIGH': 'gps',
  'MESSAGE': 'message',
  'STEALTH': 'stealth',
  'BLOCK_APPS': 'apps',
  'RESET_PIN': 'key',
  'ALERT_ON': 'ring',
  'ALERT_OFF': 'ring',
  'KEYGUARD_ON': 'apps',
  'KEYGUARD_OFF': 'apps',
  'GEO_BREACH': 'geofence',
};

function ActivityView({ cmdLog, devices }) {
  const [filter, setFilter] = React.useState('all');

  const all = cmdLog.map((cmd) => {
    const kind = CMD_TO_KIND[cmd.command] || cmd.command.toLowerCase();
    return {
      id: 'cmd-' + cmd.id,
      kind,
      deviceId: devices[0]?.id || '',
      timestamp: cmd.ts || tracerFormatHistoryTime(cmd.created_at),
      detail: cmd.args || cmd.result || '—',
      status: cmd.status === 'executed' ? 'completed' : cmd.status === 'pending' ? 'in-progress' : 'completed',
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
                  {a.status === 'completed' ? 'Completado' : a.status === 'in-progress' ? 'Pendiente' : 'Cancelado'}
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
