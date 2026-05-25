export const SIGNAL_LABELS = ['Sin señal', 'Débil', 'Moderada', 'Buena', 'Excelente'];

export function relativeTime(iso) {
  const diff = (Date.now() - new Date(iso)) / 1000;
  if (diff < 60) return `hace ${Math.round(diff)}s`;
  if (diff < 3600) return `hace ${Math.round(diff / 60)}m`;
  if (diff < 86400) return `hace ${Math.round(diff / 3600)}h`;
  return new Date(iso).toLocaleDateString('es-MX');
}

export function formatHistoryTime(iso) {
  const d = new Date(iso);
  const now = new Date();
  const time = d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
  return d.toDateString() === now.toDateString()
    ? `Hoy, ${time}`
    : d.toLocaleDateString('es-MX');
}

export function sendNotification(title, body) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  new Notification(title, { body, tag: title });
}
