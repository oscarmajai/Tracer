// Fondo SVG decorativo y abstracto (calles/manzanas estilizadas, sin nombres
// reales ni relación con una ubicación concreta). Solo backdrop; el mapa real
// es Leaflet. Coordenadas 0..1000 en cada eje.

function TracerMap({ accent = '#2563EB', dark = false }) {
  const land = dark ? '#0F1115' : '#F2F1EC';
  const blocks = dark ? '#161A20' : '#FFFFFF';
  const blocksOutline = dark ? '#1F242C' : '#E6E4DA';
  const road = dark ? '#1F242C' : '#FFFFFF';
  const roadCasing = dark ? '#0B0D11' : '#E5E2D5';
  const minor = dark ? '#181C22' : '#F7F6F1';
  const park = dark ? '#11261A' : '#DDE9D0';
  const water = dark ? '#0E2030' : '#C9DDEE';

  return (
    <svg viewBox="0 0 1000 1000" preserveAspectRatio="xMidYMid slice" style={{ width: '100%', height: '100%', display: 'block' }}>
      <defs>
        <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
          <path d="M 40 0 L 0 0 0 40" fill="none" stroke={dark ? '#13161B' : '#EAE7DC'} strokeWidth="0.5" />
        </pattern>
      </defs>

      {/* Land base */}
      <rect width="1000" height="1000" fill={land} />
      <rect width="1000" height="1000" fill="url(#grid)" opacity="0.6" />

      {/* Park top-right */}
      <path d="M 720 60 L 940 80 L 960 220 L 820 280 L 700 240 Z" fill={park} />
      <path d="M 720 60 L 940 80 L 960 220 L 820 280 L 700 240 Z" fill="none" stroke={dark ? '#1A3024' : '#C7D5B6'} strokeWidth="1.2" />

      {/* River / water diagonal */}
      <path d="M -20 820 Q 200 760 380 800 T 760 760 Q 880 740 1020 700 L 1020 1020 L -20 1020 Z" fill={water} />
      <path d="M -20 820 Q 200 760 380 800 T 760 760 Q 880 740 1020 700" fill="none" stroke={dark ? '#143049' : '#A8C3DA'} strokeWidth="1.2" />

      {/* Lake bottom-left */}
      <ellipse cx="140" cy="900" rx="100" ry="40" fill={water} />

      {/* Block grid - city blocks rendered as varied rectangles */}
      <g fill={blocks} stroke={blocksOutline} strokeWidth="0.8">
        {/* Row 1 */}
        <rect x="60" y="80" width="120" height="80" rx="2" />
        <rect x="200" y="80" width="160" height="60" rx="2" />
        <rect x="380" y="80" width="100" height="80" rx="2" />
        <rect x="500" y="80" width="140" height="60" rx="2" />
        {/* Row 2 */}
        <rect x="60" y="180" width="80" height="120" rx="2" />
        <rect x="160" y="160" width="80" height="80" rx="2" />
        <rect x="260" y="160" width="120" height="80" rx="2" />
        <rect x="400" y="180" width="100" height="100" rx="2" />
        <rect x="520" y="160" width="80" height="60" rx="2" />
        <rect x="620" y="160" width="60" height="100" rx="2" />
        {/* Row 3 */}
        <rect x="60" y="320" width="160" height="100" rx="2" />
        <rect x="240" y="260" width="80" height="80" rx="2" />
        <rect x="240" y="360" width="80" height="60" rx="2" />
        <rect x="340" y="300" width="80" height="120" rx="2" />
        <rect x="440" y="300" width="100" height="60" rx="2" />
        <rect x="440" y="380" width="60" height="60" rx="2" />
        <rect x="520" y="380" width="80" height="60" rx="2" />
        <rect x="620" y="280" width="80" height="60" rx="2" />
        <rect x="620" y="360" width="80" height="80" rx="2" />
        {/* Row 4 - middle */}
        <rect x="80" y="440" width="60" height="80" rx="2" />
        <rect x="160" y="440" width="120" height="80" rx="2" />
        <rect x="300" y="440" width="60" height="120" rx="2" />
        <rect x="380" y="460" width="80" height="60" rx="2" />
        <rect x="480" y="460" width="60" height="60" rx="2" />
        <rect x="560" y="460" width="60" height="100" rx="2" />
        <rect x="640" y="460" width="80" height="80" rx="2" />
        <rect x="740" y="320" width="100" height="80" rx="2" />
        <rect x="860" y="320" width="100" height="100" rx="2" />
        <rect x="740" y="420" width="100" height="120" rx="2" />
        <rect x="860" y="440" width="100" height="100" rx="2" />
        {/* Row 5 */}
        <rect x="60" y="540" width="80" height="80" rx="2" />
        <rect x="160" y="540" width="80" height="100" rx="2" />
        <rect x="260" y="580" width="80" height="60" rx="2" />
        <rect x="360" y="560" width="100" height="100" rx="2" />
        <rect x="480" y="560" width="60" height="60" rx="2" />
        <rect x="560" y="580" width="80" height="60" rx="2" />
        <rect x="660" y="560" width="60" height="80" rx="2" />
        <rect x="740" y="560" width="100" height="80" rx="2" />
        <rect x="860" y="560" width="100" height="100" rx="2" />
        {/* Row 6 */}
        <rect x="60" y="640" width="120" height="60" rx="2" />
        <rect x="200" y="660" width="80" height="60" rx="2" />
        <rect x="300" y="660" width="60" height="80" rx="2" />
        <rect x="380" y="680" width="100" height="60" rx="2" />
        <rect x="500" y="660" width="100" height="60" rx="2" />
        <rect x="620" y="660" width="80" height="80" rx="2" />
        <rect x="720" y="680" width="100" height="60" rx="2" />
        <rect x="840" y="680" width="80" height="60" rx="2" />
      </g>

      {/* Major roads - casing then surface */}
      <g stroke={roadCasing} strokeWidth="14" fill="none" strokeLinecap="round">
        <path d="M 0 250 L 1000 230" />
        <path d="M 0 440 L 1000 440" />
        <path d="M 0 660 L 1000 660" />
        <path d="M 230 0 L 230 1000" />
        <path d="M 540 0 L 540 1000" />
        <path d="M 820 0 L 820 1000" />
        <path d="M 60 60 L 980 980" opacity="0.0" />
      </g>
      <g stroke={road} strokeWidth="10" fill="none" strokeLinecap="round">
        <path d="M 0 250 L 1000 230" />
        <path d="M 0 440 L 1000 440" />
        <path d="M 0 660 L 1000 660" />
        <path d="M 230 0 L 230 1000" />
        <path d="M 540 0 L 540 1000" />
        <path d="M 820 0 L 820 1000" />
      </g>

      {/* Minor streets */}
      <g stroke={minor} strokeWidth="4" fill="none" strokeLinecap="round">
        <path d="M 0 160 L 1000 160" />
        <path d="M 0 320 L 1000 320" />
        <path d="M 0 540 L 1000 540" />
        <path d="M 0 740 L 1000 740" />
        <path d="M 140 0 L 140 1000" />
        <path d="M 380 0 L 380 1000" />
        <path d="M 460 0 L 460 1000" />
        <path d="M 620 0 L 620 1000" />
        <path d="M 720 0 L 720 1000" />
        <path d="M 940 0 L 940 1000" />
      </g>

      {/* Highway diagonal */}
      <path d="M -20 540 Q 400 480 700 380 T 1020 200" fill="none" stroke={roadCasing} strokeWidth="16" strokeLinecap="round" />
      <path d="M -20 540 Q 400 480 700 380 T 1020 200" fill="none" stroke={road} strokeWidth="12" strokeLinecap="round" />
      <path d="M -20 540 Q 400 480 700 380 T 1020 200" fill="none" stroke={accent} strokeWidth="1.5" strokeDasharray="4 6" opacity="0.6" />

      {/* Sin etiquetas: es un fondo abstracto, no un mapa de un lugar real. */}
    </svg>
  );
}

window.TracerMap = TracerMap;
