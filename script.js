let map;
let currentUserLocation;
let destinationLatLng;
let routeLayer;
let watchId;
let liveMarker;
let isTracking = false;
let clickedLocation = null;

const ORS_API_KEY = "eyJvcmciOiI1YjNjZTM1OTc4NTExMTAwMDFjZjYyNDgiLCJpZCI6Ijk5M2RhODBjMmMzYzQxNWY5MDE4MjgzMTdiY2YyN2QyIiwiaCI6Im11cm11cjY0In0=";


// ================= INIT =================
window.onload = function () {

  const defaultLoc = [8.5241, 76.9366];

  map = L.map("map").setView(defaultLoc, 13);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png")
    .addTo(map);

  navigator.geolocation.getCurrentPosition(
    pos => {

      currentUserLocation = L.latLng(
        pos.coords.latitude,
        pos.coords.longitude
      );

      map.setView(currentUserLocation, 13);

      L.marker(currentUserLocation)
        .addTo(map)
        .bindPopup("You are here")
        .openPopup();
    },
    () => {
      currentUserLocation = L.latLng(defaultLoc);
    }
  );

  enableIncidentReporting();
};


// ================= INCIDENT REPORT =================
function enableIncidentReporting() {

  map.on("click", function (e) {

    clickedLocation = e.latlng;

    document.getElementById("incidentForm").style.display = "block";
    document.getElementById("overlay").style.display = "block";

    map.dragging.disable();
    map.scrollWheelZoom.disable();
  });
}

function closeIncidentForm() {

  document.getElementById("incidentForm").style.display = "none";
  document.getElementById("overlay").style.display = "none";

  map.dragging.enable();
  map.scrollWheelZoom.enable();
}

function submitIncident() {

  if (!clickedLocation) {
    alert("Click on map first.");
    return;
  }

  const category =
    document.getElementById("incidentCategory").value;

  const description =
    document.getElementById("incidentDescription").value;

  if (!description.trim()) {
    alert("Please enter description.");
    return;
  }

  db.collection("incidents").add({
    lat: clickedLocation.lat,
    lng: clickedLocation.lng,
    category,
    description,
    time: new Date()
  })
  .then(() => {
    alert("Incident reported!");
    document.getElementById("incidentDescription").value = "";
    closeIncidentForm();
  })
  .catch(err => {
    console.error(err);
    alert("Failed to report.");
  });
}


// ================= SEARCH =================
function searchLocation() {

  const query =
    document.getElementById("locationSearch").value;

  if (!query) return;

  fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${query}`)
    .then(res => res.json())
    .then(data => {

      if (!data.length) {
        alert("Location not found");
        return;
      }

      destinationLatLng =
        L.latLng(data[0].lat, data[0].lon);

      map.setView(destinationLatLng, 15);

      L.marker(destinationLatLng)
        .addTo(map)
        .bindPopup("Destination")
        .openPopup();
    });
}


// ================= SAFE ROUTE (FIXED VERSION) =================
function getSafeRoute() {

  if (!currentUserLocation || !destinationLatLng)
    return alert("Search destination first.");

  fetch("https://api.openrouteservice.org/v2/directions/driving-car/geojson", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": ORS_API_KEY
    },
    body: JSON.stringify({
      coordinates: [
        [currentUserLocation.lng, currentUserLocation.lat],
        [destinationLatLng.lng, destinationLatLng.lat]
      ]
    })
  })
  .then(res => res.json())
  .then(data => {

    console.log("Route response:", data);

    if (!data.features || !data.features.length) {
      alert("No route returned.");
      return;
    }

    const coords =
      data.features[0].geometry.coordinates;

    const latLngs =
      coords.map(c => [c[1], c[0]]);

    if (routeLayer)
      map.removeLayer(routeLayer);

    routeLayer = L.polyline(latLngs, {
      color: "green",
      weight: 6
    }).addTo(map);

    map.fitBounds(routeLayer.getBounds());
  })
  .catch(err => {
    console.error("Routing error:", err);
    alert("Routing failed. Check console.");
  });
}


// ================= LIVE =================
function toggleLiveTracking() {

  if (!isTracking) {

    watchId =
      navigator.geolocation.watchPosition(pos => {

        currentUserLocation =
          L.latLng(pos.coords.latitude,
                   pos.coords.longitude);

        if (liveMarker)
          liveMarker.setLatLng(currentUserLocation);
        else
          liveMarker =
            L.marker(currentUserLocation)
             .addTo(map);
      });

    isTracking = true;

  } else {

    navigator.geolocation.clearWatch(watchId);

    if (liveMarker)
      map.removeLayer(liveMarker);

    isTracking = false;
  }
}


// ================= SOS =================
function sendSOS() {

  if (!currentUserLocation)
    return alert("Location not ready.");

  const sound =
    document.getElementById("alertSound");

  sound.loop = true;

  sound.play().catch(err => console.log(err));

  setTimeout(() => {
    sound.pause();
    sound.currentTime = 0;
  }, 10000);

  const message =
   `🚨 EMERGENCY SOS ALERT 🚨
Location:
https://www.google.com/maps?q=${currentUserLocation.lat},${currentUserLocation.lng}`;

  window.open(
   `https://wa.me/918547308589?text=${encodeURIComponent(message)}`,
   "_blank"
  );
}
