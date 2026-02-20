/**
 * app.js – SafeRoute main application
 *
 * Features:
 *  1. Map with colour-coded safe / moderate / unsafe zones
 *  2. Safest-route planner (Leaflet Routing Machine + OSRM)
 *  3. SOS alert with countdown and location capture
 *  4. Anonymous incident reporting pinned to map
 *  5. Real-time location sharing (shareable link)
 */

/* ─────────────────────────────────────────────
   Constants & State
───────────────────────────────────────────── */
const ZONE_COLORS = {
  safe:     { fill: '#22c55e', stroke: '#16a34a' },
  moderate: { fill: '#f59e0b', stroke: '#d97706' },
  unsafe:   { fill: '#ef4444', stroke: '#dc2626' }
};

// Multiplier applied to a zone's radius when checking if a point is
// "near enough" to a zone to be rated by it (2× catches the transition area).
const ZONE_PROXIMITY_THRESHOLD = 2;

// Number of evenly-spaced route coordinates sampled for safety assessment.
const ROUTE_SAMPLE_POINTS = 10;

// Demo fallback coordinates and jitter for location simulation.
const DEMO_LAT = 40.7500;
const DEMO_LNG = -73.9857;
const DEMO_POSITION_JITTER = 0.01;

const ZONE_OPACITY = { fill: 0.18, stroke: 0.8 };

const state = {
  map: null,
  userMarker: null,
  userLatLng: null,
  zoneCircles: [],           // all zone circle layers
  incidentMarkers: [],       // reported incident markers
  routeControl: null,        // Leaflet Routing Machine control
  reportPinLatLng: null,     // location pinned for incident report
  reportPinMarker: null,
  sharing: false,
  shareId: null,
  shareTimer: null,
  shareWatchId: null,
  shareMarker: null,
  sosTimer: null,
  sosCountdown: 5,
  incidents: []              // in-memory list of submitted incidents
};

/* ─────────────────────────────────────────────
   Initialisation
───────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  initMap();
  renderZones(ZONE_DATA);
  updateZoneStats();
  checkSharedLocation();  // support viewing a shared location from URL
});

function initMap() {
  state.map = L.map('map', {
    center: [DEMO_LAT, DEMO_LNG],
    zoom: 13,
    zoomControl: true
  });

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19
  }).addTo(state.map);

  // Click on map to pin a report location
  state.map.on('click', (e) => {
    if (document.getElementById('panel-report').classList.contains('active')) {
      setPinLocation(e.latlng);
    }
  });
}

/* ─────────────────────────────────────────────
   Panel Navigation
───────────────────────────────────────────── */
function showPanel(name) {
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));

  document.getElementById(`panel-${name}`).classList.add('active');
  document.getElementById(`nav-${name}`).classList.add('active');
}

/* ─────────────────────────────────────────────
   Safety Zones
───────────────────────────────────────────── */
function renderZones(zones) {
  // Remove existing circles
  state.zoneCircles.forEach(c => state.map.removeLayer(c));
  state.zoneCircles = [];

  zones.forEach(zone => {
    const color = ZONE_COLORS[zone.type];

    const circle = L.circle([zone.lat, zone.lng], {
      radius: zone.radius,
      color: color.stroke,
      fillColor: color.fill,
      fillOpacity: ZONE_OPACITY.fill,
      weight: 2,
      opacity: ZONE_OPACITY.stroke,
      className: `zone-circle zone-${zone.type}`
    }).addTo(state.map);

    circle.bindPopup(buildZonePopup(zone), { maxWidth: 240 });

    // Tooltip on hover
    circle.bindTooltip(zone.name, {
      permanent: false,
      className: 'zone-tooltip',
      direction: 'center'
    });

    circle._zoneData = zone;
    state.zoneCircles.push(circle);
  });
}

function buildZonePopup(zone) {
  const typeLabel = { safe: '✅ Safe', moderate: '⚠️ Moderate Risk', unsafe: '🚫 Unsafe' };
  return `
    <div style="font-family:'Segoe UI',sans-serif;min-width:180px">
      <strong style="font-size:14px">${zone.name}</strong><br/>
      <span style="font-size:12px;color:#64748b">${typeLabel[zone.type]}</span>
      <p style="font-size:12px;margin-top:6px;color:#374151">${zone.desc}</p>
    </div>`;
}

function filterZones(type) {
  state.zoneCircles.forEach(circle => {
    const zoneType = circle._zoneData.type;
    if (type === 'all' || zoneType === type) {
      circle.addTo(state.map);
    } else {
      state.map.removeLayer(circle);
    }
  });
}

function refreshZones() {
  renderZones(ZONE_DATA);
  updateZoneStats();
  showToast('🔄 Zones refreshed');
}

function updateZoneStats() {
  const counts = { safe: 0, moderate: 0, unsafe: 0 };
  ZONE_DATA.forEach(z => counts[z.type]++);
  document.getElementById('stat-safe').textContent     = counts.safe;
  document.getElementById('stat-moderate').textContent = counts.moderate;
  document.getElementById('stat-unsafe').textContent   = counts.unsafe;
}

/* ─────────────────────────────────────────────
   User Location
───────────────────────────────────────────── */
function locateMe() {
  if (!navigator.geolocation) { showToast('⚠️ Geolocation not supported'); return; }

  navigator.geolocation.getCurrentPosition(
    pos => {
      const ll = L.latLng(pos.coords.latitude, pos.coords.longitude);
      setUserLocation(ll);
      state.map.setView(ll, 15);
    },
    () => {
      // Fallback: use default map centre (demo mode)
      const ll = L.latLng(DEMO_LAT, DEMO_LNG);
      setUserLocation(ll);
      showToast('📍 Using demo location (GPS unavailable)');
    }
  );
}

function setUserLocation(ll) {
  state.userLatLng = ll;

  if (state.userMarker) state.map.removeLayer(state.userMarker);

  state.userMarker = L.circleMarker(ll, {
    radius: 10, color: '#2563eb', fillColor: '#3b82f6',
    fillOpacity: 0.9, weight: 3
  }).addTo(state.map);

  state.userMarker.bindPopup('<strong>📍 You are here</strong>').openPopup();

  const zoneName = getNearestZoneName(ll);
  showToast(`📍 Location found – ${zoneName}`);
}

function getNearestZoneName(ll) {
  let nearest = null;
  let minDist = Infinity;
  state.zoneCircles.forEach(c => {
    const d = ll.distanceTo(L.latLng(c._zoneData.lat, c._zoneData.lng));
    if (d < minDist) { minDist = d; nearest = c._zoneData; }
  });
  if (!nearest) return 'Unknown area';
  const label = { safe: '✅ Safe area', moderate: '⚠️ Moderate area', unsafe: '🚫 Unsafe area' };
  return `${nearest.name} (${label[nearest.type]})`;
}

function getSafetyRating(ll) {
  let minDist = Infinity;
  let nearest = null;
  state.zoneCircles.forEach(c => {
    const d = ll.distanceTo(L.latLng(c._zoneData.lat, c._zoneData.lng));
    if (d < minDist) { minDist = d; nearest = c._zoneData; }
  });
  if (!nearest) return 'unknown';
  if (minDist > nearest.radius * ZONE_PROXIMITY_THRESHOLD) return 'unknown';
  return nearest.type;
}

/* ─────────────────────────────────────────────
   Route Planner
───────────────────────────────────────────── */
function useMyLocation(field) {
  if (!navigator.geolocation) { showToast('⚠️ Geolocation not supported'); return; }

  navigator.geolocation.getCurrentPosition(
    pos => {
      const label = `${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`;
      document.getElementById(`route-${field}`).value = label;
    },
    () => {
      // Demo fallback
      document.getElementById(`route-${field}`).value = `${DEMO_LAT}, ${DEMO_LNG}`;
      showToast('📍 Using demo location');
    }
  );
}

function planRoute() {
  const startVal = document.getElementById('route-start').value.trim();
  const endVal   = document.getElementById('route-end').value.trim();

  if (!startVal || !endVal) {
    showToast('⚠️ Please enter both start and destination');
    return;
  }

  clearRoute();

  // Try to parse "lat, lng" format directly; otherwise geocode via Nominatim
  Promise.all([resolveLocation(startVal), resolveLocation(endVal)])
    .then(([startLL, endLL]) => {
      if (!startLL || !endLL) {
        showToast('⚠️ Could not find one or both locations. Try "lat, lng" format.');
        return;
      }
      drawRoute(startLL, endLL);
    })
    .catch(() => showToast('⚠️ Geocoding failed. Try "lat, lng" format.'));
}

function resolveLocation(value) {
  // Check if it's "lat, lng" format
  const coords = value.match(/^(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)$/);
  if (coords) {
    return Promise.resolve(L.latLng(parseFloat(coords[1]), parseFloat(coords[2])));
  }

  // Nominatim geocoding
  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(value)}&limit=1`;
  return fetch(url, { headers: { 'Accept-Language': 'en' } })
    .then(r => r.json())
    .then(data => {
      if (!data.length) return null;
      return L.latLng(parseFloat(data[0].lat), parseFloat(data[0].lon));
    });
}

function drawRoute(startLL, endLL) {
  const avoidUnsafe = document.getElementById('avoid-unsafe').checked;

  state.routeControl = L.Routing.control({
    waypoints: [startLL, endLL],
    routeWhileDragging: false,
    addWaypoints: false,
    draggableWaypoints: false,
    fitSelectedRoutes: true,
    show: false,        // hide the default turn-by-turn panel
    lineOptions: {
      styles: [{ color: '#2563eb', weight: 5, opacity: 0.85 }],
      extendToWaypoints: true,
      missingRouteTolerance: 0
    },
    createMarker: (i, wp) => {
      const icons = ['🟢', '🔴'];
      return L.marker(wp.latLng, {
        icon: L.divIcon({
          html: `<span style="font-size:22px;line-height:1">${icons[i]}</span>`,
          iconSize: [28, 28], iconAnchor: [14, 14],
          className: ''
        })
      });
    }
  }).addTo(state.map);

  state.routeControl.on('routesfound', e => {
    const route = e.routes[0];
    const distKm  = (route.summary.totalDistance / 1000).toFixed(2);
    const timeMin = Math.ceil(route.summary.totalTime / 60);

    // Sample ROUTE_SAMPLE_POINTS evenly-spaced coordinates to assess safety.
    // Use ZONE_WEIGHT to compute a weighted risk score across the full route.
    const coords = route.coordinates;
    const step = Math.max(1, Math.floor(coords.length / ROUTE_SAMPLE_POINTS));
    let totalWeight = 0;
    let sampledCount = 0;
    let hasUnsafe = false;

    for (let i = 0; i < coords.length; i += step) {
      const c = coords[i];
      const rating = getSafetyRating(L.latLng(c.lat, c.lng));
      if (rating !== 'unknown') {
        totalWeight += ZONE_WEIGHT[rating] || 0;
        sampledCount++;
      }
      if (rating === 'unsafe') hasUnsafe = true;
    }

    // Overall route safety: average weight across sampled points.
    const avgWeight = sampledCount > 0 ? totalWeight / sampledCount : 0;
    let overallSafety;
    if      (avgWeight < 0.2)  overallSafety = 'safe';
    else if (avgWeight < 0.6)  overallSafety = 'moderate';
    else                        overallSafety = 'unsafe';

    const safetyLabels = {
      safe:     '✅ Mostly safe',
      moderate: '⚠️ Some moderate-risk areas',
      unsafe:   '🚫 Passes through unsafe areas',
      unknown:  '🔵 Safety unrated'
    };

    const avoidNote = avoidUnsafe && hasUnsafe
      ? '<br/><em style="color:#ef4444">⚠️ Route crosses unsafe zones – consider an alternative path.</em>'
      : '';

    document.getElementById('route-info').innerHTML = `
      <strong>🔀 Route Found</strong><br/>
      📏 Distance: <strong>${distKm} km</strong><br/>
      ⏱️ Est. time: <strong>${timeMin} min</strong><br/>
      🛡️ Safety: <strong>${safetyLabels[overallSafety]}</strong>
      ${avoidNote}
    `;
    document.getElementById('route-info').classList.remove('hidden');
  });

  state.routeControl.on('routingerror', () => {
    showToast('⚠️ Could not calculate route. Check your locations.');
  });
}

function clearRoute() {
  if (state.routeControl) {
    state.map.removeControl(state.routeControl);
    state.routeControl = null;
  }
  document.getElementById('route-info').classList.add('hidden');
}

/* ─────────────────────────────────────────────
   SOS Alert
───────────────────────────────────────────── */
function triggerSOS() {
  document.getElementById('sos-modal').classList.remove('hidden');
  document.getElementById('sos-countdown').classList.remove('hidden');
  document.getElementById('sos-sent').classList.add('hidden');
  document.getElementById('sos-cancel-btn').classList.remove('hidden');
  document.getElementById('sos-close-btn').classList.add('hidden');

  state.sosCountdown = 5;
  updateSOSCounter(5);

  state.sosTimer = setInterval(() => {
    state.sosCountdown--;
    updateSOSCounter(state.sosCountdown);
    if (state.sosCountdown <= 0) {
      clearInterval(state.sosTimer);
      sendSOS();
    }
  }, 1000);
}

function updateSOSCounter(n) {
  document.getElementById('sos-seconds').textContent      = n;
  document.getElementById('sos-seconds-text').textContent = n;
}

function cancelSOS() {
  clearInterval(state.sosTimer);
  closeSOS();
  showToast('SOS cancelled');
}

function closeSOS() {
  clearInterval(state.sosTimer);
  document.getElementById('sos-modal').classList.add('hidden');
}

function sendSOS() {
  // Capture location then mark alert as sent
  const getLocation = (cb) => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        p => cb(`${p.coords.latitude.toFixed(5)}, ${p.coords.longitude.toFixed(5)}`),
        () => cb('Location unavailable')
      );
    } else {
      cb('Location unavailable');
    }
  };

  getLocation(locationStr => {
    document.getElementById('sos-countdown').classList.add('hidden');
    document.getElementById('sos-sent').classList.remove('hidden');
    document.getElementById('sos-cancel-btn').classList.add('hidden');
    document.getElementById('sos-close-btn').classList.remove('hidden');

    document.getElementById('sos-location-sent').textContent =
      `📍 Your location: ${locationStr}`;

    // In a real deployment this would call an emergency API / SMS gateway.
    console.info('[SafeRoute] SOS sent – location:', locationStr);
    showToast('🆘 SOS Alert sent to emergency contacts!');
  });
}

/* ─────────────────────────────────────────────
   Incident Reporting
───────────────────────────────────────────── */
function useMyLocationForReport() {
  if (!navigator.geolocation) { showToast('⚠️ Geolocation not supported'); return; }

  navigator.geolocation.getCurrentPosition(
    pos => setPinLocation(L.latLng(pos.coords.latitude, pos.coords.longitude)),
    () => setPinLocation(L.latLng(DEMO_LAT, DEMO_LNG))   // demo fallback
  );
}

function setPinLocation(ll) {
  state.reportPinLatLng = ll;

  if (state.reportPinMarker) state.map.removeLayer(state.reportPinMarker);

  state.reportPinMarker = L.marker(ll, {
    icon: L.divIcon({
      html: '<span style="font-size:24px">📌</span>',
      iconSize: [28, 28], iconAnchor: [14, 28],
      className: ''
    })
  }).addTo(state.map);

  document.getElementById('report-location-text').textContent =
    `${ll.lat.toFixed(5)}, ${ll.lng.toFixed(5)}`;
}

function submitReport() {
  if (!state.reportPinLatLng) {
    showToast('⚠️ Please pin a location on the map or use "Use My Location"');
    return;
  }

  const type = document.getElementById('incident-type').value;
  const desc = document.getElementById('incident-desc').value.trim();
  const time = document.getElementById('incident-time').value;

  const incident = {
    id: Date.now(),
    type,
    desc: desc || '(no description)',
    time,
    lat: state.reportPinLatLng.lat,
    lng: state.reportPinLatLng.lng,
    ts: new Date().toISOString()
  };

  state.incidents.push(incident);
  addIncidentMarker(incident);

  // Reset form
  document.getElementById('incident-desc').value = '';
  document.getElementById('incident-type').selectedIndex = 0;
  document.getElementById('incident-time').selectedIndex = 0;
  document.getElementById('report-location-text').textContent = 'Click the map to pin a location';

  if (state.reportPinMarker) { state.map.removeLayer(state.reportPinMarker); state.reportPinMarker = null; }
  state.reportPinLatLng = null;

  document.getElementById('report-success').classList.remove('hidden');
  setTimeout(() => document.getElementById('report-success').classList.add('hidden'), 4000);

  showToast('📋 Incident reported anonymously');
}

const INCIDENT_ICONS = {
  theft:      '🔓',
  assault:    '⚠️',
  harassment: '🚫',
  suspicious: '👁️',
  accident:   '🚧',
  other:      '❓'
};

function addIncidentMarker(incident) {
  const icon = INCIDENT_ICONS[incident.type] || '❓';
  const marker = L.marker([incident.lat, incident.lng], {
    icon: L.divIcon({
      html: `<span style="font-size:22px;filter:drop-shadow(0 2px 2px rgba(0,0,0,.3))">${icon}</span>`,
      iconSize: [28, 28], iconAnchor: [14, 14],
      className: ''
    })
  }).addTo(state.map);

  marker.bindPopup(`
    <div style="font-family:'Segoe UI',sans-serif;min-width:160px">
      <strong>${icon} ${capitalize(incident.type)}</strong><br/>
      <span style="font-size:12px;color:#64748b">${formatTime(incident.time)}</span>
      <p style="font-size:12px;margin-top:6px;color:#374151">${incident.desc}</p>
      <em style="font-size:11px;color:#94a3b8">Reported anonymously</em>
    </div>`);

  state.incidentMarkers.push(marker);
}

/* ─────────────────────────────────────────────
   Real-Time Location Sharing
───────────────────────────────────────────── */
function toggleSharing() {
  if (state.sharing) {
    stopSharing();
  } else {
    startSharing();
  }
}

function startSharing() {
  if (!navigator.geolocation) { showToast('⚠️ Geolocation not supported'); return; }

  const name     = document.getElementById('share-name').value.trim() || 'Anonymous';
  const duration = parseInt(document.getElementById('share-duration').value, 10);

  // Generate a unique share ID
  state.shareId = generateId();

  // Build a shareable URL (client-side; no server required for demo)
  const shareUrl = buildShareUrl(state.shareId, name);
  document.getElementById('share-link').value = shareUrl;
  document.getElementById('share-link-box').classList.remove('hidden');

  if (duration > 0) {
    const expiresAt = new Date(Date.now() + duration * 60 * 1000);
    document.getElementById('share-expires').textContent =
      `⏱ Sharing expires at ${expiresAt.toLocaleTimeString()}`;
    state.shareTimer = setTimeout(stopSharing, duration * 60 * 1000);
  } else {
    document.getElementById('share-expires').textContent = '⏱ Sharing until you stop';
  }

  // Watch position
  state.shareWatchId = navigator.geolocation.watchPosition(
    pos => updateShareMarker(pos, name),
    () => {
      // Demo mode: simulate movement
      const ll = L.latLng(DEMO_LAT + (Math.random() - 0.5) * DEMO_POSITION_JITTER,
                          DEMO_LNG + (Math.random() - 0.5) * DEMO_POSITION_JITTER);
      updateShareMarkerLL(ll, name);
    },
    { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
  );

  // Update UI
  state.sharing = true;
  document.getElementById('share-indicator').className = 'share-indicator active';
  document.getElementById('share-status-text').textContent = 'Location sharing is ON';
  document.getElementById('share-toggle-btn').textContent = '⛔ Stop Sharing';
  document.getElementById('share-toggle-btn').className   = 'btn btn-danger';

  addShareHistory(name, duration);
  showToast('📡 Location sharing started');
}

function stopSharing() {
  if (state.shareWatchId !== null) {
    navigator.geolocation.clearWatch(state.shareWatchId);
    state.shareWatchId = null;
  }
  if (state.shareTimer)  { clearTimeout(state.shareTimer); state.shareTimer = null; }
  if (state.shareMarker) { state.map.removeLayer(state.shareMarker); state.shareMarker = null; }

  state.sharing = false;
  state.shareId = null;

  document.getElementById('share-indicator').className = 'share-indicator inactive';
  document.getElementById('share-status-text').textContent = 'Location sharing is off';
  document.getElementById('share-toggle-btn').textContent  = '📡 Start Sharing';
  document.getElementById('share-toggle-btn').className    = 'btn btn-primary';
  document.getElementById('share-link-box').classList.add('hidden');

  showToast('📡 Location sharing stopped');
}

function updateShareMarker(pos, name) {
  updateShareMarkerLL(L.latLng(pos.coords.latitude, pos.coords.longitude), name);
}

function updateShareMarkerLL(ll, name) {
  if (state.shareMarker) {
    state.shareMarker.setLatLng(ll);
  } else {
    state.shareMarker = L.marker(ll, {
      icon: L.divIcon({
        html: `<div style="background:#2563eb;color:#fff;border-radius:50% 50% 50% 0;padding:4px 7px;font-size:11px;font-weight:700;transform:rotate(-45deg);min-width:28px;text-align:center">${name.charAt(0).toUpperCase()}</div>`,
        iconSize: [36, 36], iconAnchor: [14, 34],
        className: ''
      })
    }).addTo(state.map);
    state.shareMarker.bindPopup(`<strong>📡 ${name}</strong><br/><span style="font-size:12px;color:#64748b">Sharing live location</span>`);
  }
  state.map.setView(ll, state.map.getZoom());
}

function buildShareUrl(id, name) {
  const base = window.location.href.split('?')[0];
  return `${base}?share=${id}&name=${encodeURIComponent(name)}`;
}

function copyShareLink() {
  const link = document.getElementById('share-link').value;
  if (navigator.clipboard) {
    navigator.clipboard.writeText(link).then(() => showToast('📋 Link copied!'));
  } else {
    showToast('📋 Please copy the link manually');
  }
}

function shareViaWhatsApp() {
  const link = document.getElementById('share-link').value;
  window.open(`https://wa.me/?text=${encodeURIComponent('Track my live location on SafeRoute: ' + link)}`, '_blank');
}

function shareViaSMS() {
  const link = document.getElementById('share-link').value;
  window.open(`sms:?body=${encodeURIComponent('Track my live location on SafeRoute: ' + link)}`, '_self');
}

function addShareHistory(name, duration) {
  const list = document.getElementById('share-history-list');
  // Remove "no recent shares" placeholder
  const empty = list.querySelector('.empty-state');
  if (empty) empty.remove();

  const li = document.createElement('li');
  const dur = duration > 0 ? `${duration} min` : 'until stopped';
  li.textContent = `${name} – ${new Date().toLocaleTimeString()} (${dur})`;
  list.prepend(li);
}

function checkSharedLocation() {
  const params = new URLSearchParams(window.location.search);
  const shareId = params.get('share');
  const name    = params.get('name') || 'Someone';

  if (!shareId) return;

  // In a real app we would fetch the live location from a server.
  // For the demo we show a marker at a fixed offset with a banner.
  showToast(`📡 Viewing ${name}'s shared location (demo)`);

  const demoLL = L.latLng(DEMO_LAT + 0.003, DEMO_LNG + 0.003);
  const marker = L.marker(demoLL, {
    icon: L.divIcon({
      html: `<div style="background:#2563eb;color:#fff;border-radius:50% 50% 50% 0;padding:4px 7px;font-size:11px;font-weight:700;transform:rotate(-45deg);min-width:28px;text-align:center">${name.charAt(0).toUpperCase()}</div>`,
      iconSize: [36, 36], iconAnchor: [14, 34],
      className: ''
    })
  }).addTo(state.map);

  marker.bindPopup(`<strong>📡 ${name}</strong><br/><span style="font-size:12px;color:#64748b">Live location (demo)</span>`).openPopup();
  state.map.setView(demoLL, 15);
}

/* ─────────────────────────────────────────────
   Helpers
───────────────────────────────────────────── */
function showToast(msg, duration = 3000) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.remove('hidden');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => toast.classList.add('hidden'), duration);
}

function generateId() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function formatTime(code) {
  const map = { now: 'Just now', '1h': 'Within the last hour', today: 'Today', yesterday: 'Yesterday' };
  return map[code] || code;
}
