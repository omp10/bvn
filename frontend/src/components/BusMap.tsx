import { useEffect, useMemo } from "react";
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

export type MapStop = { _id?: string; name: string; lat: number; lng: number; sequence?: number };
export type MapPoint = { lat: number; lng: number };

/**
 * OpenStreetMap tiles, not Google Maps.
 *
 * ponytail: no API key, no billing account, no per-load charge — and the FRD's
 * requirement is "parents can see the bus on a map", which this satisfies today.
 * Swap TileLayer for the Google provider when a key and billing exist; nothing
 * else on this component changes.
 */
const TILE_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

/** Leaflet's default marker images break under a bundler, so the icons are inline SVG. */
const pin = (fill: string, glyph: string) =>
  L.divIcon({
    className: "",
    html: `<div style="transform:translate(-50%,-100%)">
      <svg width="30" height="40" viewBox="0 0 30 40" xmlns="http://www.w3.org/2000/svg">
        <path d="M15 39C15 39 28 24.5 28 14A13 13 0 1 0 2 14c0 10.5 13 25 13 25z"
              fill="${fill}" stroke="white" stroke-width="2.5"/>
        <text x="15" y="19" text-anchor="middle" font-size="12" font-weight="700" fill="white"
              font-family="system-ui">${glyph}</text>
      </svg></div>`,
    iconSize: [30, 40],
    iconAnchor: [0, 0],
  });

/**
 * The bus gets an actual bus, not a lettered pin — on a map full of stop
 * markers the parent needs to find their child's bus at a glance.
 */
const busIcon = L.divIcon({
  className: "",
  html: `<div style="transform:translate(-50%,-50%)">
    <svg width="46" height="46" viewBox="0 0 46 46" xmlns="http://www.w3.org/2000/svg">
      <circle cx="23" cy="23" r="19" fill="#1155a5" stroke="#fff" stroke-width="3"/>
      <circle cx="23" cy="23" r="21.5" fill="none" stroke="#1155a5" stroke-width="1.5" opacity=".35">
        <animate attributeName="r" values="20;25;20" dur="2.4s" repeatCount="indefinite"/>
        <animate attributeName="opacity" values=".45;0;.45" dur="2.4s" repeatCount="indefinite"/>
      </circle>
      <rect x="14" y="12.5" width="18" height="19" rx="3.4" fill="#fdc010"/>
      <rect x="16.2" y="15.4" width="13.6" height="6.6" rx="1.6" fill="#0d4381"/>
      <rect x="16.2" y="24.4" width="4" height="2.6" rx="1" fill="#0d4381"/>
      <rect x="25.8" y="24.4" width="4" height="2.6" rx="1" fill="#0d4381"/>
      <circle cx="18.2" cy="31.6" r="2.1" fill="#0f172a"/>
      <circle cx="27.8" cy="31.6" r="2.1" fill="#0f172a"/>
    </svg></div>`,
  iconSize: [46, 46],
  iconAnchor: [0, 0],
});
const stopIcon = (n: number) => pin("#45ab35", String(n));
const myStopIcon = pin("#f0ac00", "★");

/** Keeps the bus in view as it moves, without fighting a user who has panned. */
function FollowBus({ position, enabled }: { position?: MapPoint | null; enabled: boolean }) {
  const map = useMap();
  useEffect(() => {
    if (!enabled || !position) return;
    map.panTo([position.lat, position.lng], { animate: true, duration: 0.8 });
  }, [map, position?.lat, position?.lng, enabled]);
  return null;
}

/** Fits the map to everything worth seeing, once, when the data first arrives. */
function FitBounds({ points }: { points: MapPoint[] }) {
  const map = useMap();
  const key = points.length;
  useEffect(() => {
    if (points.length === 0) return;
    if (points.length === 1) {
      map.setView([points[0].lat, points[0].lng], 15);
      return;
    }
    map.fitBounds(L.latLngBounds(points.map((p) => [p.lat, p.lng] as [number, number])), {
      padding: [40, 40],
      maxZoom: 16,
    });
    // Only on first meaningful load — re-fitting on every tick would yank the
    // map away from a parent who is looking at their own stop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, key === 0]);
  return null;
}

export default function BusMap({
  bus,
  stops = [],
  trail = [],
  highlightStopId,
  follow = true,
  height = 320,
}: {
  bus?: MapPoint | null;
  stops?: MapStop[];
  /** Breadcrumbs for route replay; omit for a live view. */
  trail?: MapPoint[];
  highlightStopId?: string | null;
  follow?: boolean;
  height?: number | string;
}) {
  const everything = useMemo(
    () => [...stops.map((s) => ({ lat: s.lat, lng: s.lng })), ...(bus ? [bus] : []), ...trail],
    [stops, bus, trail]
  );

  const centre = everything[0] ?? { lat: 18.5204, lng: 73.8567 }; // Pune, a sane default

  if (!everything.length) {
    return (
      <div className="grid place-items-center rounded-lg bg-slate-100 text-sm text-slate-500" style={{ height }}>
        Nothing to show on the map yet.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg" style={{ height }}>
      <MapContainer
        center={[centre.lat, centre.lng]}
        zoom={14}
        scrollWheelZoom
        style={{ height: "100%", width: "100%" }}
      >
        <TileLayer url={TILE_URL} attribution={ATTRIBUTION} />
        <FitBounds points={everything} />
        <FollowBus position={bus} enabled={follow} />

        {stops.length > 1 && (
          <Polyline
            positions={stops.map((s) => [s.lat, s.lng] as [number, number])}
            pathOptions={{ color: "#45ab35", weight: 4, opacity: 0.5, dashArray: "6 8" }}
          />
        )}

        {trail.length > 1 && (
          <Polyline
            positions={trail.map((p) => [p.lat, p.lng] as [number, number])}
            pathOptions={{ color: "#1155a5", weight: 4, opacity: 0.85 }}
          />
        )}

        {stops.map((stop, i) => (
          <Marker
            key={stop._id ?? i}
            position={[stop.lat, stop.lng]}
            icon={String(stop._id) === String(highlightStopId) ? myStopIcon : stopIcon(stop.sequence ?? i + 1)}
          >
            <Popup>
              <strong>{stop.name}</strong>
              {String(stop._id) === String(highlightStopId) && <div>Your stop</div>}
            </Popup>
          </Marker>
        ))}

        {bus && (
          <Marker position={[bus.lat, bus.lng]} icon={busIcon} zIndexOffset={1000}>
            <Popup>The bus is here</Popup>
          </Marker>
        )}
      </MapContainer>
    </div>
  );
}
