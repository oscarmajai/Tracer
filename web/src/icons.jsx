// Icon set for Tracer. All icons are 16x16 stroke-1.5, currentColor.
// Some product/device icons are 20x20 for sidebar/cards.

const _icon = (paths, size = 16) => (props) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox={`0 0 ${size} ${size}`}
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    {paths}
  </svg>
);

const IconMap = _icon(<>
  <path d="M2 4.5l4-1.5 4 1.5 4-1.5v9l-4 1.5-4-1.5-4 1.5v-9z" />
  <path d="M6 3v10" />
  <path d="M10 4.5v10" />
</>);

const IconDevices = _icon(<>
  <rect x="2" y="3" width="9" height="7" rx="1" />
  <rect x="10" y="6" width="4" height="7" rx="1" />
  <path d="M5 13h2" />
</>);

const IconHistory = _icon(<>
  <path d="M2.5 8a5.5 5.5 0 1 0 1.6-3.9" />
  <path d="M2 2v3h3" />
  <path d="M8 5v3l2 1.5" />
</>);

const IconBell = _icon(<>
  <path d="M4 7a4 4 0 0 1 8 0v3l1 2H3l1-2V7z" />
  <path d="M6.5 13a1.5 1.5 0 0 0 3 0" />
</>);

const IconShare = _icon(<>
  <circle cx="4" cy="8" r="1.75" />
  <circle cx="12" cy="4" r="1.75" />
  <circle cx="12" cy="12" r="1.75" />
  <path d="M5.5 7.2l5-2.4" />
  <path d="M5.5 8.8l5 2.4" />
</>);

const IconSettings = _icon(<>
  <circle cx="8" cy="8" r="2" />
  <path d="M8 1.5v2M8 12.5v2M14.5 8h-2M3.5 8h-2M12.6 3.4l-1.4 1.4M4.8 11.2l-1.4 1.4M12.6 12.6l-1.4-1.4M4.8 4.8L3.4 3.4" />
</>);

const IconSearch = _icon(<>
  <circle cx="7" cy="7" r="4.5" />
  <path d="M13.5 13.5l-3-3" />
</>);

const IconPhone = _icon(<>
  <rect x="5" y="2" width="6" height="12" rx="1.2" />
  <path d="M7.5 12.5h1" />
</>, 16);

const IconLaptop = _icon(<>
  <rect x="3" y="4" width="10" height="6" rx="0.5" />
  <path d="M2 12h12" />
</>);

const IconEarbuds = _icon(<>
  <path d="M5 3.5c-1.5 0-2.5 1.2-2.5 3v2.5c0 1 .7 1.5 1.5 1.5s1.5-.5 1.5-1.5V6c0-1.4-.2-2.5-.5-2.5z" />
  <path d="M11 3.5c1.5 0 2.5 1.2 2.5 3v2.5c0 1-.7 1.5-1.5 1.5s-1.5-.5-1.5-1.5V6c0-1.4.2-2.5.5-2.5z" />
  <path d="M5 11v1.5M11 11v1.5" />
</>);

const IconTablet = _icon(<>
  <rect x="3.5" y="2" width="9" height="12" rx="1.2" />
  <path d="M7.5 12.5h1" />
</>);

const IconWatch = _icon(<>
  <rect x="5" y="5" width="6" height="6" rx="1.2" />
  <path d="M6 5l.5-2.5h3L10 5" />
  <path d="M6 11l.5 2.5h3L10 11" />
</>);

const IconBattery = _icon(<>
  <rect x="1.5" y="5" width="11" height="6" rx="1" />
  <path d="M14 7v2" />
</>);

const IconChevronRight = _icon(<>
  <path d="M6 4l4 4-4 4" />
</>);

const IconChevronDown = _icon(<>
  <path d="M4 6l4 4 4-4" />
</>);

const IconCheck = _icon(<>
  <path d="M3 8.5l3 3 7-7" />
</>);

const IconClose = _icon(<>
  <path d="M4 4l8 8M12 4l-8 8" />
</>);

const IconRing = _icon(<>
  <path d="M8 2v1" />
  <path d="M5 4l5 8" />
  <path d="M11 4l-5 8" />
  <path d="M3 8h1.5" />
  <path d="M11.5 8H13" />
  <circle cx="8" cy="11.5" r="2.5" />
</>);

const IconLock = _icon(<>
  <rect x="3" y="7" width="10" height="7" rx="1" />
  <path d="M5 7V5a3 3 0 0 1 6 0v2" />
</>);

const IconErase = _icon(<>
  <path d="M2 11l5 3 7-7-5-3z" />
  <path d="M5 6l5 3" />
  <path d="M7 14h7" />
</>);

const IconPlus = _icon(<>
  <path d="M8 3v10M3 8h10" />
</>);

const IconCompass = _icon(<>
  <circle cx="8" cy="8" r="6" />
  <path d="M10.5 5.5L9 9l-3.5 1.5L7 7z" />
</>);

const IconLogo = _icon(<>
  <circle cx="8" cy="8" r="6" />
  <circle cx="8" cy="8" r="2.5" fill="currentColor" />
  <path d="M8 2v1.5M8 12.5V14M2 8h1.5M12.5 8H14" />
</>, 16);

const IconArrowUp = _icon(<>
  <path d="M8 13V3M4 7l4-4 4 4" />
</>);

const IconShield = _icon(<>
  <path d="M8 1.5l5 2v4.5c0 3-2 5.5-5 6.5-3-1-5-3.5-5-6.5V3.5z" />
  <path d="M5.5 8L7 9.5l3-3" />
</>);

const IconHelp = _icon(<>
  <circle cx="8" cy="8" r="6" />
  <path d="M6.5 6.5c0-1 .7-1.7 1.5-1.7s1.5.7 1.5 1.5c0 .8-1.5 1.2-1.5 2.2" />
  <circle cx="8" cy="11" r="0.5" fill="currentColor" />
</>);

const IconLogout = _icon(<>
  <path d="M9 3H4a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h5" />
  <path d="M11 5l3 3-3 3" />
  <path d="M14 8H7" />
</>);

const IconCamera = _icon(<>
  <rect x="1.5" y="4" width="13" height="9" rx="1.5" />
  <path d="M5 4l1-1.5h4L11 4" />
  <circle cx="8" cy="8.5" r="2.5" />
</>);

const IconCameraFlip = _icon(<>
  <rect x="1.5" y="4" width="13" height="9" rx="1.5" />
  <path d="M5 4l1-1.5h4L11 4" />
  <circle cx="8" cy="8.5" r="2" />
  <path d="M11 7.5l1.5 1L11 9.5" />
</>);

const IconMic = _icon(<>
  <rect x="6" y="1.5" width="4" height="8" rx="2" />
  <path d="M3.5 8a4.5 4.5 0 0 0 9 0" />
  <path d="M8 12.5v2M6 14.5h4" />
</>);

const IconScreen = _icon(<>
  <rect x="1.5" y="3" width="13" height="8.5" rx="1" />
  <path d="M5 14h6M8 11.5v2.5" />
  <path d="M5 6l1.5 1.5L9 5" />
</>);

const IconFlash = _icon(<>
  <path d="M9 1.5L4 8.5h3l-1 6 5-7H8l1-6z" />
</>);

const IconVibrate = _icon(<>
  <rect x="5" y="3.5" width="6" height="9" rx="1" />
  <path d="M2 6v4M3.5 7v2M14 6v4M12.5 7v2" />
</>);

const IconGeofence = _icon(<>
  <circle cx="8" cy="8" r="6" strokeDasharray="2 2" />
  <circle cx="8" cy="8" r="1.5" fill="currentColor" stroke="none" />
</>);

const IconStealth = _icon(<>
  <path d="M2 8s2.5-4 6-4 6 4 6 4-2.5 4-6 4S2 8 2 8z" />
  <path d="M2 2l12 12" />
  <circle cx="8" cy="8" r="1.5" />
</>);

const IconMessage = _icon(<>
  <path d="M2 4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H6.5l-3 2.5V11H3a1 1 0 0 1-1-1V4z" />
  <path d="M5 6h6M5 8.5h4" />
</>);

const IconKey = _icon(<>
  <circle cx="5" cy="10" r="2.5" />
  <path d="M7 9l6-6" />
  <path d="M11 5l1 1M13 3l1 1" />
</>);

const IconAppBlock = _icon(<>
  <rect x="2" y="2" width="5" height="5" rx="1" />
  <rect x="9" y="2" width="5" height="5" rx="1" />
  <rect x="2" y="9" width="5" height="5" rx="1" />
  <circle cx="11.5" cy="11.5" r="2.5" />
  <path d="M9.8 9.8l3.4 3.4" />
</>);

const IconBoltGPS = _icon(<>
  <circle cx="8" cy="7" r="3" />
  <path d="M8 1.5v1.5M8 11v1.5M13 7h-1.5M4.5 7H3" />
  <path d="M7.5 14.5l1-2-1-1 1-1.5" />
</>);

const IconActivity = _icon(<>
  <path d="M1.5 8h3l2-5 3 10 2-5h3" />
</>);

const IconLayers = _icon(<>
  <path d="M8 2l6 3-6 3-6-3 6-3z" />
  <path d="M2 8l6 3 6-3" />
  <path d="M2 11l6 3 6-3" />
</>);

const IconPlay = _icon(<>
  <path d="M5 3.5v9l7-4.5-7-4.5z" fill="currentColor" />
</>);

const IconPause = _icon(<>
  <rect x="4" y="3" width="3" height="10" rx="0.5" fill="currentColor" stroke="none" />
  <rect x="9" y="3" width="3" height="10" rx="0.5" fill="currentColor" stroke="none" />
</>);

const IconZoomIn = _icon(<>
  <circle cx="7" cy="7" r="4.5" />
  <path d="M13.5 13.5l-3-3" />
  <path d="M7 5v4M5 7h4" />
</>);

const IconZoomOut = _icon(<>
  <circle cx="7" cy="7" r="4.5" />
  <path d="M13.5 13.5l-3-3" />
  <path d="M5 7h4" />
</>);

const IconTarget = _icon(<>
  <circle cx="8" cy="8" r="6" />
  <circle cx="8" cy="8" r="3" />
  <path d="M8 1v2M8 13v2M1 8h2M13 8h2" />
</>);

const TracerIcons = {
  IconMap, IconDevices, IconHistory, IconBell, IconShare, IconSettings,
  IconSearch, IconPhone, IconLaptop, IconEarbuds, IconTablet, IconWatch,
  IconBattery, IconChevronRight, IconChevronDown, IconCheck, IconClose,
  IconRing, IconLock, IconErase, IconPlus, IconCompass, IconLogo,
  IconArrowUp, IconShield, IconHelp, IconLogout, IconLayers,
  IconPlay, IconPause, IconZoomIn, IconZoomOut, IconTarget,
  IconCamera, IconCameraFlip, IconMic, IconScreen, IconFlash, IconVibrate,
  IconGeofence, IconStealth, IconMessage, IconKey, IconAppBlock, IconBoltGPS,
  IconActivity,
};

const deviceIcon = (type) => ({
  phone: IconPhone, laptop: IconLaptop, earbuds: IconEarbuds,
  tablet: IconTablet, watch: IconWatch,
}[type] || IconPhone);

window.TracerIcons = TracerIcons;
window.tracerDeviceIcon = deviceIcon;
Object.assign(window, TracerIcons);
