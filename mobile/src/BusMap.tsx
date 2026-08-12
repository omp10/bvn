import { useMemo, useRef, useState } from "react";
import { Modal, Pressable, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { WebView } from "react-native-webview";
import { colors, radius } from "./theme";
import { str } from "./strings";
import { Muted, T } from "./ui";

export type MapStop = { _id?: string; name: string; lat: number; lng: number; sequence?: number };
export type MapPoint = { lat: number; lng: number };

/**
 * Leaflet in a WebView, on OpenStreetMap tiles.
 *
 * ponytail: react-native-maps would be the obvious native choice, but on Android
 * it is Google Maps — which means an API key, a billing account and a per-load
 * charge before a single parent sees a bus. This renders the same map the web
 * app already ships, with no key and no bill. Swap in react-native-maps the day
 * a key exists; the props on this component are the whole contract.
 *
 * The page is built once. Moving the bus injects a call into the existing map
 * rather than re-rendering the HTML — reloading a WebView every ten seconds
 * would flash a white square in the parent's face all the way home.
 */
export default function BusMap({
  bus,
  stops = [],
  trail = [],
  highlightStopId,
  follow = true,
  height = 300,
  expandable = true,
}: {
  bus?: MapPoint | null;
  stops?: MapStop[];
  trail?: MapPoint[];
  highlightStopId?: string | null;
  follow?: boolean;
  /** A number of pixels, or "fill" to take the space the parent gives it. */
  height?: number | "fill";
  /** Adds a tap-to-expand full-screen view. On by default for inline maps. */
  expandable?: boolean;
}) {
  const web = useRef<WebView>(null);
  const full = useRef<WebView>(null);
  const [expanded, setExpanded] = useState(false);

  // Only the stops belong in the page source; they do not change while a trip
  // runs, and rebuilding the HTML is what causes the flash.
  const html = useMemo(
    () => page(stops, highlightStopId ?? null, follow),
    [stops, highlightStopId, follow]
  );

  const box = height === "fill" ? { flex: 1 } : { height };
  const hasAnything = stops.length > 0 || Boolean(bus);

  if (!hasAnything) {
    return (
      <View style={[s.blank, box]}>
        <Muted>{str.map.nothingYet}</Muted>
      </View>
    );
  }

  // Injected on every render — cheap, and it keeps the marker in step with props
  // without an effect and a dependency list to get wrong.
  const update = `window.bvUpdate(${JSON.stringify({ bus: bus ?? null, trail })});true;`;

  /* An inline map lives inside a scrolling screen, so a drag on it scrolls the
     page instead of panning the map — the gesture is owned by the ScrollView and
     no WebView prop wins that fight reliably. Rather than pretend, the inline
     map is a preview that opens a real full-screen one, where every gesture is
     unambiguous. */
  const canExpand = expandable && height !== "fill";

  return (
    <>
    <View style={[s.wrap, box]}>
      <WebView
        ref={web}
        originWhitelist={["*"]}
        source={{ html }}
        injectedJavaScript={update}
        // Re-injects after the page itself has loaded, so the first fix is not
        // lost to a script that ran before Leaflet existed.
        onLoadEnd={() => web.current?.injectJavaScript(update)}
        style={{ backgroundColor: colors.slate100 }}
        javaScriptEnabled
        domStorageEnabled
        androidLayerType="hardware"
        scrollEnabled={false}
        // A map is decorative chrome around data the screen already states in
        // text; nothing here should trigger a navigation.
        setSupportMultipleWindows={false}
        // The inline preview must not swallow the page scroll.
        pointerEvents={canExpand ? "none" : "auto"}
      />

      {canExpand && (
        <Pressable style={StyleSheet.absoluteFill} onPress={() => setExpanded(true)}>
          <View style={s.expandHint}>
            <T size={12} weight="700" color={colors.white}>{str.map.tapToOpen}</T>
          </View>
        </Pressable>
      )}
    </View>

    <Modal visible={expanded} animationType="slide" onRequestClose={() => setExpanded(false)}>
      <View style={{ flex: 1, backgroundColor: colors.slate900 }}>
        <StatusBar style="light" />
        <WebView
          ref={full}
          originWhitelist={["*"]}
          source={{ html }}
          injectedJavaScript={update}
          onLoadEnd={() => full.current?.injectJavaScript(update)}
          style={{ flex: 1, backgroundColor: colors.slate100 }}
          javaScriptEnabled
          domStorageEnabled
          androidLayerType="hardware"
          setSupportMultipleWindows={false}
        />
        <SafeAreaView edges={["top"]} style={s.fullBar}>
          <Pressable onPress={() => setExpanded(false)} hitSlop={12} style={s.fullClose}>
            <T size={15} weight="700" color={colors.white}>✕  Close</T>
          </Pressable>
        </SafeAreaView>
      </View>
    </Modal>
    </>
  );
}

const BUS_SVG = `
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
  </svg>`;

/** Serialised into the page — never interpolate anything a user typed here. */
function page(stops: MapStop[], highlightStopId: string | null, follow: boolean) {
  const data = JSON.stringify({
    stops: stops.map((s, i) => ({
      name: s.name,
      lat: s.lat,
      lng: s.lng,
      label: String(s.sequence ?? i + 1),
      mine: String(s._id) === String(highlightStopId),
    })),
    follow,
  });

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no"/>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>
  html,body,#map{height:100%;margin:0;background:${colors.slate100}}
  .leaflet-control-attribution{font-size:9px}
</style>
</head>
<body>
<div id="map"></div>
<script>
  var D = ${data};
  var map = L.map('map', { zoomControl: false, attributionControl: true })
             .setView([18.5204, 73.8567], 14);
  L.control.zoom({ position: 'bottomright' }).addTo(map);

  /* CARTO Positron rather than standard OSM tiles. Standard OSM draws every
     shop, tree and building name, which at a glance buries the one thing this
     map exists to show — the bus. A pale basemap lets the route and the marker
     carry all the colour. Free, and still no API key. */
  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; OpenStreetMap &copy; CARTO',
    subdomains: 'abcd',
    maxZoom: 20
  }).addTo(map);

  function pin(fill, glyph) {
    return L.divIcon({ className:'', iconSize:[30,40], iconAnchor:[0,0],
      html:'<div style="transform:translate(-50%,-100%)">'
        + '<svg width="30" height="40" viewBox="0 0 30 40" xmlns="http://www.w3.org/2000/svg">'
        + '<path d="M15 39C15 39 28 24.5 28 14A13 13 0 1 0 2 14c0 10.5 13 25 13 25z" fill="'+fill+'" stroke="white" stroke-width="2.5"/>'
        + '<text x="15" y="19" text-anchor="middle" font-size="12" font-weight="700" fill="white" font-family="system-ui">'+glyph+'</text>'
        + '</svg></div>' });
  }
  var busIcon = L.divIcon({ className:'', iconSize:[46,46], iconAnchor:[0,0],
    html:'<div style="transform:translate(-50%,-50%)">${BUS_SVG.replace(/\n\s*/g, "")}</div>' });

  var pts = [];
  D.stops.forEach(function (s) {
    L.marker([s.lat, s.lng], { icon: s.mine ? pin('${colors.sun500}','\\u2605') : pin('${colors.leaf500}', s.label) })
      /* JSON.stringify, not quotes-and-hope: the label is interpolated into
         JavaScript that runs inside the WebView, and a translated string
         carrying an apostrophe would end the literal early and take the whole
         map down with it. */
      .addTo(map).bindPopup(s.name + (s.mine ? '<br/><b>' + ${JSON.stringify(str.map.yourStop)} + '</b>' : ''));
    pts.push([s.lat, s.lng]);
  });
  /* The route line.
   *
   * A straight line between stops cuts through buildings and rivers and reads
   * as "the app does not know the roads". OSRM snaps the stop sequence to the
   * actual driving network — the Zomato-looking line — with no key and no bill.
   *
   * It is drawn straight first and replaced when the road geometry arrives, so
   * a slow or unreachable router degrades to the old behaviour instead of an
   * empty map. The public demo server has no SLA; point OSRM_HOST at your own
   * instance if this ever matters at scale.
   */
  var routeLine = null;
  if (D.stops.length > 1) {
    routeLine = L.polyline(pts, {
      color: '${colors.brand400}', weight: 5, opacity: .45, dashArray: '6 8', lineJoin: 'round'
    }).addTo(map);

    var coords = D.stops.map(function (s) { return s.lng + ',' + s.lat; }).join(';');
    fetch('https://router.project-osrm.org/route/v1/driving/' + coords + '?overview=full&geometries=geojson')
      .then(function (r) { return r.json(); })
      .then(function (j) {
        var g = j && j.routes && j.routes[0] && j.routes[0].geometry;
        if (!g || !g.coordinates || g.coordinates.length < 2) return;
        var latlngs = g.coordinates.map(function (c) { return [c[1], c[0]]; });
        map.removeLayer(routeLine);
        // Casing underneath, colour on top — the trick that keeps a thin line
        // readable over a pale basemap at every zoom.
        L.polyline(latlngs, { color: '#ffffff', weight: 9, opacity: .9, lineJoin: 'round', lineCap: 'round' }).addTo(map);
        routeLine = L.polyline(latlngs, {
          color: '${colors.brand500}', weight: 5, opacity: .95, lineJoin: 'round', lineCap: 'round'
        }).addTo(map);
      })
      .catch(function () { /* Keep the straight line. */ });
  }

  var busMarker = null, trailLine = null, fitted = false;

  window.bvUpdate = function (state) {
    var b = state && state.bus;
    if (b && typeof b.lat === 'number') {
      if (busMarker) busMarker.setLatLng([b.lat, b.lng]);
      else busMarker = L.marker([b.lat, b.lng], { icon: busIcon, zIndexOffset: 1000 })
                        .addTo(map).bindPopup('The bus is here');
      if (D.follow) map.panTo([b.lat, b.lng], { animate: true, duration: 0.8 });
    }

    /* Where the bus has actually been. These are real GPS fixes, so they already
       follow the road — no snapping needed, and drawn over the planned route so
       "travelled" is visibly distinct from "still to come". */
    var t = (state && state.trail) || [];
    if (t.length > 1) {
      var line = t.map(function (p) { return [p.lat, p.lng]; });
      if (trailLine) trailLine.setLatLngs(line);
      else trailLine = L.polyline(line, {
        color: '${colors.leaf600}', weight: 5, opacity: .95, lineJoin: 'round', lineCap: 'round'
      }).addTo(map);
      trailLine.bringToFront();
    }

    /* Fit once, when there is finally something to fit. Re-fitting on every
       position would yank the map away from a parent reading their own stop. */
    if (!fitted) {
      var all = pts.slice();
      if (b && typeof b.lat === 'number') all.push([b.lat, b.lng]);
      if (all.length === 1) { map.setView(all[0], 15); fitted = true; }
      else if (all.length > 1) { map.fitBounds(L.latLngBounds(all), { padding: [40,40], maxZoom: 16 }); fitted = true; }
    }
  };
  window.bvUpdate({});
</script>
</body>
</html>`;
}

const s = StyleSheet.create({
  wrap: { overflow: "hidden", borderRadius: radius.md, backgroundColor: colors.slate100 },
  expandHint: {
    position: "absolute",
    right: 10,
    bottom: 10,
    backgroundColor: "rgba(15,23,42,0.75)",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.pill,
  },
  fullBar: { position: "absolute", top: 0, left: 0, right: 0, alignItems: "flex-end", padding: 12 },
  fullClose: {
    backgroundColor: "rgba(15,23,42,0.8)",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: radius.pill,
  },
  blank: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    backgroundColor: colors.slate100,
  },
});
