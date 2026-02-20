let map;
let currentUserLocation = null;
let destinationLatLng = null;
let routeLayer = null;

let liveMarker = null;
let watchId = null;
let isTracking = false;

let incidentMarkers = [];
let allIncidents = [];
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

      liveMarker = L.marker(currentUserLocation)
        .addTo(map)
        .bindPopup("You are here")
        .openPopup();

      calculateSafetyScore(currentUserLocation);
    },
    () => {
      currentUserLocation = L.latLng(defaultLoc);
      calculateSafetyScore(currentUserLocation);
    }
  );

  enableIncidentReporting();
  loadIncidents();
};



// ================= SEARCH =================
function searchLocation() {

  const query =
    document.getElementById("locationSearch").value.trim();

  if (!query) {
    alert("Enter destination");
    return;
  }

  fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}`)
    .then(res => res.json())
    .then(data => {

      if (!data.length) {
        alert("Location not found");
        return;
      }

      destinationLatLng = L.latLng(
        parseFloat(data[0].lat),
        parseFloat(data[0].lon)
      );

      map.setView(destinationLatLng, 15);

      L.marker(destinationLatLng)
        .addTo(map)
        .bindPopup("Destination")
        .openPopup();
    });
}



// ================= SAFE ROUTE =================
function getSafeRoute() {

  if (!currentUserLocation)
    return alert("Current location not ready");

  if (!destinationLatLng)
    return alert("Search destination first");

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
  .then(res => {
    if (!res.ok) throw new Error("ORS error");
    return res.json();
  })
  .then(data => {

    if (!data.features.length)
      return alert("No route found");

    const coords = data.features[0].geometry.coordinates;

    const latLngs = coords.map(c => [c[1], c[0]]);

    if (routeLayer)
      map.removeLayer(routeLayer);

    routeLayer = L.polyline(latLngs, {
      color: "green",
      weight: 6
    }).addTo(map);

    map.fitBounds(routeLayer.getBounds());
  })
  .catch(err => {
    console.error(err);
    alert("Routing failed");
  });
}



// ================= LIVE TRACKING =================
function toggleLiveTracking() {

  if (!isTracking) {

    watchId = navigator.geolocation.watchPosition(
      pos => {

        currentUserLocation = L.latLng(
          pos.coords.latitude,
          pos.coords.longitude
        );

        if (liveMarker)
          liveMarker.setLatLng(currentUserLocation);
        else
          liveMarker = L.marker(currentUserLocation).addTo(map);

        map.setView(currentUserLocation);

        calculateSafetyScore(currentUserLocation);

      },
      err => console.error(err),
      { enableHighAccuracy: true }
    );

    isTracking = true;
    alert("Live Tracking ON");

  } else {

    navigator.geolocation.clearWatch(watchId);
    isTracking = false;
    alert("Live Tracking OFF");
  }
}



// ================= INCIDENT SYSTEM =================
function enableIncidentReporting() {

  map.on("click", function (e) {

    clickedLocation = e.latlng;

    document.getElementById("incidentForm").style.display = "block";
    document.getElementById("overlay").style.display = "block";
  });
}

function closeIncidentForm() {
  document.getElementById("incidentForm").style.display = "none";
  document.getElementById("overlay").style.display = "none";
}

function submitIncident() {

  const category =
    document.getElementById("incidentCategory").value;

  const description =
    document.getElementById("incidentDescription").value;

  if (!description.trim())
    return alert("Enter description");

  db.collection("incidents").add({
    lat: clickedLocation.lat,
    lng: clickedLocation.lng,
    category,
    description,
    time: new Date()
  });

  document.getElementById("incidentDescription").value = "";
  closeIncidentForm();
}



// ================= LOAD INCIDENTS =================
function loadIncidents() {

  db.collection("incidents")
    .onSnapshot(snapshot => {

      incidentMarkers.forEach(m => map.removeLayer(m));
      incidentMarkers = [];
      allIncidents = [];

      snapshot.forEach(doc => {

        const data = doc.data();
        allIncidents.push(data);

        const marker = L.circleMarker(
          [data.lat, data.lng],
          {
            radius:8,
            color:"red",
            fillColor:"red",
            fillOpacity:0.7
          }
        )
        .addTo(map)
        .bindPopup(`<b>${data.category}</b><br>${data.description}`);

        incidentMarkers.push(marker);
      });

      if (currentUserLocation)
        calculateSafetyScore(currentUserLocation);
    });
}



// ================= AI SAFETY SCORE =================
function calculateSafetyScore(userLoc) {

  let nearby = 0;

  allIncidents.forEach(incident => {

    const loc = L.latLng(incident.lat, incident.lng);

    if (map.distance(userLoc, loc) <= 500)
      nearby++;
  });

  let score = 100 - (nearby * 15);
  if (score < 0) score = 0;

  const el =
    document.getElementById("safetyScore");

  el.innerText = score + "/100";

  el.style.color =
    score > 80 ? "green" :
    score > 50 ? "orange" : "red";
}



// ================= SOS =================
function sendSOS() {

  if (!currentUserLocation)
    return alert("Location not ready");

  const sound =
    document.getElementById("alertSound");

  sound.loop = true;
  sound.play();

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
