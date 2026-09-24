import React, { useEffect, useMemo, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { DeliveryRow, DriverRow } from '../../services/delivery';
import { t } from '../../i18n';

/**
 * Where tonight's orders and drivers are.
 *
 * Leaflet over OpenStreetMap tiles: no key, no billing, and no third party
 * learning the restaurant's customer addresses from a request log. The
 * trade-off is real and worth saying out loud — OSM street coverage in Iraq
 * is uneven, so the pin a cashier drops is the authority here, not the
 * basemap under it.
 *
 * Markers are drawn as DivIcons rather than image pins because Leaflet's
 * default marker images break under Vite's asset hashing, and a map whose
 * pins are invisible in production is worse than no map.
 */

interface DeliveryMapProps {
  deliveries: DeliveryRow[];
  drivers: DriverRow[];
  /** Called when the dispatcher clicks the map while placing a pin. */
  onPick?: (lat: number, lng: number) => void;
  picking?: boolean;
  height?: number;
}

/** Baghdad, used only when nothing on the board has coordinates yet. */
const FALLBACK_CENTER: [number, number] = [33.3152, 44.3661];

function driverIcon(stale: boolean, initial: string): L.DivIcon {
  return L.divIcon({
    className: '',
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    html: `<div style="
      width:34px;height:34px;border-radius:50%;
      display:flex;align-items:center;justify-content:center;
      font:600 13px/1 system-ui,sans-serif;color:#fff;
      background:${stale ? '#8b9490' : '#1f6b3f'};
      border:3px solid #fff;box-shadow:0 2px 6px #0004;
      opacity:${stale ? 0.65 : 1};
    ">${initial}</div>`,
  });
}

function destinationIcon(late: boolean): L.DivIcon {
  return L.divIcon({
    className: '',
    iconSize: [22, 22],
    iconAnchor: [11, 22],
    html: `<div style="
      width:18px;height:18px;border-radius:50% 50% 50% 0;
      transform:rotate(-45deg);margin:2px;
      background:${late ? '#a22f24' : '#b77948'};
      border:2px solid #fff;box-shadow:0 2px 5px #0004;
    "></div>`,
  });
}

export const DeliveryMap: React.FC<DeliveryMapProps> = ({
  deliveries,
  drivers,
  onPick,
  picking,
  height = 380,
}) => {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const pickHandler = useRef(onPick);
  pickHandler.current = onPick;

  const points = useMemo(
    () => ({
      destinations: deliveries.filter((row) => row.latitude && row.longitude),
      located: drivers.filter((row) => row.last_latitude && row.last_longitude),
    }),
    [deliveries, drivers],
  );

  useEffect(() => {
    if (!container.current || map.current) return;

    map.current = L.map(container.current, { zoomControl: true, attributionControl: true });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap',
    }).addTo(map.current);
    layer.current = L.layerGroup().addTo(map.current);
    map.current.setView(FALLBACK_CENTER, 12);

    map.current.on('click', (event: L.LeafletMouseEvent) => {
      pickHandler.current?.(event.latlng.lat, event.latlng.lng);
    });

    return () => {
      map.current?.remove();
      map.current = null;
    };
  }, []);

  useEffect(() => {
    const instance = map.current;
    const group = layer.current;
    if (!instance || !group) return;

    group.clearLayers();
    const bounds: [number, number][] = [];

    for (const row of points.destinations) {
      const position: [number, number] = [row.latitude as number, row.longitude as number];
      bounds.push(position);
      L.marker(position, { icon: destinationIcon(row.lateness.late) })
        .bindPopup(
          `<strong>${row.customer_name || row.invoice}</strong><br>${row.address}<br>` +
            `${t('dash.delivery.minutes', { count: String(row.elapsed_minutes) })}`,
        )
        .addTo(group);
    }

    for (const driver of points.located) {
      const position: [number, number] = [
        driver.last_latitude as number,
        driver.last_longitude as number,
      ];
      bounds.push(position);

      const age =
        driver.position_age_minutes === null || driver.position_age_minutes === undefined
          ? t('dash.delivery.map.no_position')
          : t('dash.delivery.map.reported', { count: String(driver.position_age_minutes) });

      L.marker(position, {
        icon: driverIcon(Boolean(driver.position_stale), driver.driver_name.trim().charAt(0)),
        // A stale dot must not sit on top of a live one and be read as live.
        zIndexOffset: driver.position_stale ? 0 : 500,
      })
        .bindPopup(`<strong>${driver.driver_name}</strong><br>${age}`)
        .addTo(group);

      // A line from a driver to the order they are carrying, so "who is near
      // which stop" is answered by looking rather than by cross-referencing.
      const theirs = points.destinations.filter((row) => row.driver === driver.name);
      for (const row of theirs) {
        L.polyline(
          [position, [row.latitude as number, row.longitude as number]],
          { color: '#1f6b3f', weight: 2, opacity: driver.position_stale ? 0.25 : 0.5, dashArray: '6 6' },
        ).addTo(group);
      }
    }

    if (bounds.length === 1) {
      instance.setView(bounds[0], 15);
    } else if (bounds.length > 1) {
      instance.fitBounds(L.latLngBounds(bounds), { padding: [40, 40], maxZoom: 16 });
    }
  }, [points]);

  // The container is sized by the page, so Leaflet has to be told when that
  // size changed or it renders grey strips where tiles should be.
  useEffect(() => {
    const instance = map.current;
    if (!instance) return;
    const timer = window.setTimeout(() => instance.invalidateSize(), 120);
    return () => window.clearTimeout(timer);
  }, [height]);

  const nothingToShow = points.destinations.length === 0 && points.located.length === 0;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-gray-200">
      <div
        ref={container}
        style={{ height }}
        className={picking ? 'cursor-crosshair' : ''}
        role="application"
        aria-label={t('dash.delivery.map.title')}
      />
      {picking && (
        <p className="pointer-events-none absolute inset-x-0 top-0 z-[500] bg-primary-700/90 p-2 text-center text-xs font-medium text-white">
          {t('dash.delivery.map.pick_hint')}
        </p>
      )}
      {nothingToShow && !picking && (
        <p className="pointer-events-none absolute inset-x-0 bottom-0 z-[500] bg-white/90 p-2 text-center text-xs text-gray-600">
          {t('dash.delivery.map.empty')}
        </p>
      )}
    </div>
  );
};
