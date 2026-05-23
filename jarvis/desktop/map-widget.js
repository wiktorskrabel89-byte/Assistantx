'use strict';

class MapWidget {
  constructor(options = {}) {
    this.container = null;
    this.iframe = null;
    this.accessToken = String(options.accessToken || '').trim();
    this.lastLocation = { lat: 52.2297, lon: 21.0122, label: 'Europe' };
  }

  init(containerEl) {
    if (!containerEl) throw new Error('map-container-required');
    this.container = containerEl;
    this.iframe = document.createElement('iframe');
    this.iframe.style.width = '100%';
    this.iframe.style.height = '100%';
    this.iframe.style.border = '0';
    this.iframe.setAttribute('loading', 'lazy');
    this.container.innerHTML = '';
    this.container.appendChild(this.iframe);
    this.render();
  }

  render() {
    if (!this.iframe) return;
    const token = this.getAccessToken();
    if (!token) {
      this.iframe.src = 'about:blank';
      this.iframe.title = 'Mapbox token missing';
      return;
    }
    const { lat, lon } = this.lastLocation;
    const zoom = 10.5;
    this.iframe.src = `https://api.mapbox.com/styles/v1/mapbox/streets-v12.html?title=false&zoomwheel=true&access_token=${encodeURIComponent(token)}#${zoom}/${lat}/${lon}`;
    this.iframe.title = this.lastLocation.label || 'Map';
  }

  addMarker(lat, lon, label = 'Selected place') {
    this.lastLocation = { lat: Number(lat), lon: Number(lon), label: String(label || 'Selected place') };
    this.render();
  }

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
    this.addMarker(lat, lon, best.place_name || q);
    return {
      lat: Number(lat),
      lon: Number(lon),
      label: best.place_name || q,
    };
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
