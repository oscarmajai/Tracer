import { useEffect, useRef, useCallback } from 'react';
import L from 'leaflet';

export function useMap() {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const trailRef = useRef(null);
  const centeredRef = useRef(false);
  const geofenceCircleRef = useRef(null);
  const drawCallbackRef = useRef(null);
  const drawModeRef = useRef(false);
  const deviceNameRef = useRef('Device');

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, { zoomControl: false }).setView([23.6345, -102.5528], 5);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>',
      maxZoom: 19,
    }).addTo(map);
    L.control.zoom({ position: 'bottomright' }).addTo(map);

    map.on('click', (e) => {
      if (!drawModeRef.current) return;
      const { lat, lng } = e.latlng;
      drawModeRef.current = false;
      map.getContainer().style.cursor = '';
      drawCallbackRef.current?.(lat, lng);
    });

    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
      trailRef.current = null;
      geofenceCircleRef.current = null;
    };
  }, []);

  const makeDeviceIcon = (initial) =>
    L.divIcon({
      className: '',
      html: `<div class="device-marker">${initial}</div>`,
      iconSize: [36, 36],
      iconAnchor: [18, 18],
      tooltipAnchor: [0, -22],
    });

  const updateMap = useCallback((latest, history) => {
    const map = mapRef.current;
    if (!map) return;
    const latlng = [latest.latitude, latest.longitude];
    const name = deviceNameRef.current;
    const initial = (name || 'D').charAt(0).toUpperCase();

    if (!markerRef.current) {
      markerRef.current = L.marker(latlng, { icon: makeDeviceIcon(initial) }).addTo(map);
      markerRef.current.bindTooltip(name, {
        permanent: true, direction: 'bottom', offset: [0, 10], className: 'device-label',
      });
    } else {
      markerRef.current.setLatLng(latlng);
      markerRef.current.setIcon(makeDeviceIcon(initial));
      const tt = markerRef.current.getTooltip();
      if (tt) tt.setContent(name);
    }

    const ts = new Date(latest.timestamp).toLocaleString('es-MX');
    markerRef.current.bindPopup(`<b>Batería: ${latest.battery_level}%</b><br><small>${ts}</small>`);

    if (history && history.length > 1) {
      const points = [...history].reverse().map((r) => [r.latitude, r.longitude]);
      if (!trailRef.current) {
        trailRef.current = L.polyline(points, {
          color: '#2563eb', weight: 2.5, opacity: 0.5,
        }).addTo(map);
      } else {
        trailRef.current.setLatLngs(points);
      }
    }

    if (!centeredRef.current) {
      map.setView(latlng, 15);
      centeredRef.current = true;
    }
  }, []);

  const flyTo = useCallback((lat, lon) => {
    mapRef.current?.flyTo([lat, lon], 16, { duration: 1 });
  }, []);

  const setDeviceName = useCallback((name) => {
    deviceNameRef.current = name;
  }, []);

  const resetCentered = useCallback(() => {
    centeredRef.current = false;
  }, []);

  const enableGeofencePick = useCallback((enabled, onPick) => {
    const map = mapRef.current;
    if (!map) return;
    drawModeRef.current = enabled;
    drawCallbackRef.current = onPick || null;
    map.getContainer().style.cursor = enabled ? 'crosshair' : '';
  }, []);

  const drawGeofenceCircle = useCallback((lat, lon, radius) => {
    const map = mapRef.current;
    if (!map) return;
    if (geofenceCircleRef.current) {
      geofenceCircleRef.current.setLatLng([lat, lon]);
      geofenceCircleRef.current.setRadius(radius);
    } else {
      geofenceCircleRef.current = L.circle([lat, lon], {
        radius, color: '#2563eb', fillColor: '#2563eb', fillOpacity: 0.08, weight: 2,
      }).addTo(map);
    }
  }, []);

  const clearGeofenceCircle = useCallback(() => {
    if (geofenceCircleRef.current && mapRef.current) {
      mapRef.current.removeLayer(geofenceCircleRef.current);
      geofenceCircleRef.current = null;
    }
  }, []);

  const updateGeofenceRadius = useCallback((radius) => {
    geofenceCircleRef.current?.setRadius(radius);
  }, []);

  return {
    containerRef,
    updateMap,
    flyTo,
    setDeviceName,
    resetCentered,
    enableGeofencePick,
    drawGeofenceCircle,
    clearGeofenceCircle,
    updateGeofenceRadius,
  };
}
