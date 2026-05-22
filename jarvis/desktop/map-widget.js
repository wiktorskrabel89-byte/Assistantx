'use strict';

class MapWidget {
  constructor() {
    this.container = null;
    this.iframe = null;
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
    const { lat, lon } = this.lastLocation;
    const bbox = `${Number(lon) - 0.15}%2C${Number(lat) - 0.08}%2C${Number(lon) + 0.15}%2C${Number(lat) + 0.08}`;
    const marker = `${lat}%2C${lon}`;
    this.iframe.src = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${marker}`;
    this.iframe.title = this.lastLocation.label || 'Map';
  }

  addMarker(lat, lon, label = 'Selected place') {
    this.lastLocation = { lat: Number(lat), lon: Number(lon), label: String(label || 'Selected place') };
    this.render();
  }

  async goTo(query) {
    const q = String(query || '').trim();
    if (!q) throw new Error('empty-location-query');
    const endpoint = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`;
    const response = await fetch(endpoint, {
      headers: {
        'User-Agent': 'AssistantX/1.0 (contact@assistantx.app)',
        Accept: 'application/json',
      },
    });
    const payload = await response.json().catch(() => []);
    const best = Array.isArray(payload) ? payload[0] : null;
    if (!best?.lat || !best?.lon) throw new Error('location-not-found');
    this.addMarker(best.lat, best.lon, best.display_name || q);
    return {
      lat: Number(best.lat),
      lon: Number(best.lon),
      label: best.display_name || q,
    };
  }

  destroy() {
    if (this.container) this.container.innerHTML = '';
    this.container = null;
    this.iframe = null;
  }
}

window.MapWidget = MapWidget;
