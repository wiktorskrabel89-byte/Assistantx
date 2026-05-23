'use strict';

class MapWidget {
  constructor(options = {}) {
    this.container = null;
    this.iframe = null;
    this.accessToken = String(options.accessToken || '').trim();
    this.lastLocation = { lat: 52.2297, lon: 21.0122, label: 'Europe' };
    this._pendingFlyTo = null;
  }

  init(containerEl) {
    if (!containerEl) throw new Error('map-container-required');
    this.container = containerEl;
    this.iframe = document.createElement('iframe');
    this.iframe.style.width = '100%';
    this.iframe.style.height = '100%';
    this.iframe.style.border = '0';
    this.iframe.setAttribute('loading', 'lazy');
    this.iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin');
    this.container.innerHTML = '';
    this.container.appendChild(this.iframe);

    const token = this.getAccessToken();
    if (token) {
      this._renderMapboxGl(this.lastLocation.lat, this.lastLocation.lon, token);
    } else {
      this._renderTokenMissing();
    }
  }

  // ── Render helpers ─────────────────────────────────────────────────────────

  _renderTokenMissing() {
    if (!this.iframe) return;
    this.iframe.src = 'about:blank';
    this.iframe.title = 'Mapbox token missing';
  }

  /**
   * Build the full Mapbox GL JS HTML page inside the iframe's srcdoc.
   * Using srcdoc keeps the CSP sane (no external origin for the frame itself)
   * while still loading Mapbox GL JS from the CDN inside the sandboxed iframe.
   *
   * The page exposes a `window.flyTo(lat, lon, label, opts)` function that
   * Electron can call via iframe.contentWindow.flyTo(...).
   */
  _renderMapboxGl(lat, lon, token, flyToOptions = null) {
    if (!this.iframe) return;
    const safeToken = String(token || '').replace(/"/g, '');
    const safeLat = Number(lat) || 0;
    const safeLon = Number(lon) || 0;
    const { zoom = 10.5, pitch = 0, bearing = 0, duration = 0 } = flyToOptions || {};

    const srcdoc = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy"
  content="default-src 'self' https://api.mapbox.com https://events.mapbox.com;
           script-src 'self' 'unsafe-inline' https://api.mapbox.com;
           worker-src blob:;
           style-src 'self' 'unsafe-inline' https://api.mapbox.com;" />
<link href="https://api.mapbox.com/mapbox-gl-js/v3.3.0/mapbox-gl.css" rel="stylesheet" />
<script src="https://api.mapbox.com/mapbox-gl-js/v3.3.0/mapbox-gl.js"><\/script>
<style>
  html, body, #map { margin: 0; padding: 0; width: 100%; height: 100%; background: #070b14; }
</style>
</head>
<body>
<div id="map"></div>
<script>
mapboxgl.accessToken = "${safeToken}";
const map = new mapboxgl.Map({
  container: "map",
  style: "mapbox://styles/mapbox/dark-v11",
  center: [${safeLon}, ${safeLat}],
  zoom: ${zoom},
  pitch: ${pitch},
  bearing: ${bearing},
  antialias: true,
});

// ── Cinematic 3D building layer ─────────────────────────────────────────────
map.on("load", () => {
  map.addLayer({
    id: "3d-buildings",
    source: "composite",
    "source-layer": "building",
    filter: ["==", "extrude", "true"],
    type: "fill-extrusion",
    minzoom: 13,
    paint: {
      "fill-extrusion-color": "#1a2a4a",
      "fill-extrusion-height": ["interpolate", ["linear"], ["zoom"], 13, 0, 15.05, ["get", "height"]],
      "fill-extrusion-base":   ["interpolate", ["linear"], ["zoom"], 13, 0, 15.05, ["get", "min_height"]],
      "fill-extrusion-opacity": 0.7,
    },
  });

  // Atmospheric sky
  map.setFog({ color: "#070b14", "high-color": "#1e3a5f", "space-color": "#000005" });

  // If a pending fly-to was requested before the map loaded, execute it now.
  if (window._pendingFlyTo) {
    const p = window._pendingFlyTo;
    window._pendingFlyTo = null;
    _doFlyTo(p.center, p.zoom, p.pitch, p.bearing, p.duration);
  }
});

function _doFlyTo(center, zoom, pitch, bearing, duration) {
  map.flyTo({ center, zoom, pitch, bearing, duration, essential: true });
}

// ── Public API called by the parent frame via iframe.contentWindow.flyTo ─────
window.flyTo = function(lat, lon, label, opts) {
  const center = [Number(lon), Number(lat)];
  const zoom    = (opts && opts.zoom    != null) ? opts.zoom    : 12;
  const pitch   = (opts && opts.pitch   != null) ? opts.pitch   : 60;
  const bearing = (opts && opts.bearing != null) ? opts.bearing : -45;
  const dur     = (opts && opts.duration != null) ? opts.duration : 5000;

  if (!map.loaded()) {
    window._pendingFlyTo = { center, zoom, pitch, bearing, duration: dur };
    return;
  }
  _doFlyTo(center, zoom, pitch, bearing, dur);
};
<\/script>
</body>
</html>`;

    this.iframe.srcdoc = srcdoc;
    this.iframe.title = this.lastLocation.label || 'Map';
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Animate the map to a new location with a cinematic 3D camera fly-to.
   * If the map iframe is already loaded, calls iframe.contentWindow.flyTo
   * directly; otherwise re-renders the iframe with the correct initial center.
   */
  flyTo(lat, lon, label = 'Selected place', options = {}) {
    const safeLat = Number(lat) || 0;
    const safeLon = Number(lon) || 0;
    this.lastLocation = { lat: safeLat, lon: safeLon, label: String(label || 'Selected place') };

    const token = this.getAccessToken();
    if (!token) return;

    const flyToOpts = {
      zoom: options.zoom ?? 12,
      pitch: options.pitch ?? 60,
      bearing: options.bearing ?? -45,
      duration: options.duration ?? 5000,
    };

    // Attempt to call the live map inside the iframe
    try {
      if (this.iframe?.contentWindow?.flyTo) {
        this.iframe.contentWindow.flyTo(safeLat, safeLon, label, flyToOpts);
        return;
      }
    } catch {
      // cross-origin or not yet loaded — fall through to re-render
    }

    // Re-render the iframe with the new center (map loads centered there)
    this._renderMapboxGl(safeLat, safeLon, token, flyToOpts);
  }

  /** @deprecated Use flyTo() for the cinematic experience. */
  addMarker(lat, lon, label = 'Selected place') {
    this.flyTo(lat, lon, label, { zoom: 12, pitch: 0, bearing: 0, duration: 1000 });
  }

  /**
   * Geocode a text query and fly to the result with the cinematic 3D camera.
   */
  async goTo(query) {
    const q = String(query || '').trim();
    if (!q) throw new Error('empty-location-query');
    const token = this.getAccessToken();
    if (!token) throw new Error('mapbox-token-missing');

    const endpoint = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json?limit=1&access_token=${encodeURIComponent(token)}`;
    const response = await fetch(endpoint);
    const payload = await response.json().catch(() => ({}));
    const best = Array.isArray(payload?.features) ? payload.features[0] : null;
    const center = Array.isArray(best?.center) ? best.center : null;
    if (!center || center.length < 2) throw new Error('location-not-found');

    const [lon, lat] = center;
    const label = best.place_name || q;
    this.flyTo(Number(lat), Number(lon), label);
    return { lat: Number(lat), lon: Number(lon), label };
  }

  getAccessToken() {
    return String(this.accessToken || window.__JARVIS_MAPBOX_ACCESS_TOKEN__ || '').trim();
  }

  destroy() {
    if (this.container) this.container.innerHTML = '';
    this.container = null;
    this.iframe = null;
  }
}

window.MapWidget = MapWidget;
