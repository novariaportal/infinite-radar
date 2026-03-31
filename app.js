const API_KEY = "tyy8znhl0u5kbbb2vuvdhfetmsil041u";
Cesium.Ion.defaultAccessToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiI3MDU4NWI1YS03ZGUxLTRmMzEtODEwZi01MDNlM2QyMTg5MzAiLCJpZCI6NDExNTkzLCJpYXQiOjE3NzQ5MjgxNjh9.NeKegq8BpQ4KqIs2hJWNgoEy2c0vidgNg869ldUVFew";


/* =========================
   VIEWER
========================= */
const viewer = new Cesium.Viewer("cesiumContainer", {
  terrainProvider: Cesium.createWorldTerrain(),
  baseLayerPicker: false,
  geocoder: false,
  animation: false,
  timeline: false
});

viewer.scene.globe.baseColor = Cesium.Color.BLACK;

/* =========================
   MODE SYSTEM
========================= */
function setMode(mode) {
  document.body.classList.toggle("ife-mode", mode === "ife");
  document.body.classList.toggle("radar-mode", mode === "radar");

  viewer.scene.globe.enableLighting = (mode === "ife");
}

document.getElementById("mode").addEventListener("change", e => {
  setMode(e.target.value);
});

setMode("ife");

/* =========================
   AIRCRAFT SYSTEM
========================= */
let aircraft = {};
let selected = null;

function createAircraft(f, pos) {
  return viewer.entities.add({
    id: f.id,
    position: pos,

    billboard: {
      image: "https://cdn-icons-png.flaticon.com/512/684/684908.png",
      scale: 0.04
    },

    label: {
      text: f.callsign || "",
      font: "10px sans-serif",
      fillColor: Cesium.Color.WHITE,
      outlineColor: Cesium.Color.BLACK,
      outlineWidth: 2,
      pixelOffset: new Cesium.Cartesian2(0, -25)
    },

    path: {
      material: Cesium.Color.CYAN.withAlpha(0.7),
      width: 2,
      trailTime: 300
    }
  });
}

/* =========================
   HUD UPDATE
========================= */
function updateHUD(f) {
  document.getElementById("spd").textContent = Math.round(f.groundSpeed || 0);
  document.getElementById("alt").textContent = Math.round(f.altitude || 0);
  document.getElementById("hdg").textContent = Math.round(f.heading || 0);
}

/* =========================
   SMOOTH MOVEMENT
========================= */
function smoothMove(entity, newPos) {
  const now = Cesium.JulianDate.now();

  const property = new Cesium.SampledPositionProperty();
  const current = entity.position.getValue(now);

  if (!current) return;

  property.addSample(now, current);

  const future = Cesium.JulianDate.addSeconds(now, 2, new Cesium.JulianDate());
  property.addSample(future, newPos);

  entity.position = property;
}

/* =========================
   CLICK SELECT
========================= */
viewer.screenSpaceEventHandler.setInputAction(click => {
  const picked = viewer.scene.pick(click.position);

  if (picked && picked.id) {
    selected = picked.id.id;
  }
}, Cesium.ScreenSpaceEventType.LEFT_CLICK);

/* =========================
   API LOADING (CORRECT)
========================= */
async function loadFlights() {
  try {
    // 1. GET SESSIONS
    const sessionsRes = await fetch(
      `https://api.infiniteflight.com/public/v2/sessions?apikey=${API_KEY}`
    );
    const sessions = await sessionsRes.json();

    if (!sessions.result) {
      console.error("Sessions error:", sessions);
      return;
    }

    // 2. PICK SERVER
    const server = document.getElementById("server").value.toLowerCase();

    const session = sessions.result.find(s =>
      s.name.toLowerCase().includes(server)
    );

    if (!session) {
      console.warn("No session found for:", server);
      return;
    }

    // 3. GET FLIGHTS
    const flightsRes = await fetch(
      `https://api.infiniteflight.com/public/v2/sessions/${session.id}/flights?apikey=${API_KEY}`
    );
    const flights = await flightsRes.json();

    if (!flights.result) {
      console.error("Flights error:", flights);
      return;
    }

    const activeIds = new Set(flights.result.map(f => f.id));

    // 4. RENDER
    flights.result.forEach(f => {
      if (f.latitude == null || f.longitude == null) return;

      const pos = Cesium.Cartesian3.fromDegrees(
        f.longitude,
        f.latitude,
        (f.altitude || 0) * 0.3048
      );

      if (!aircraft[f.id]) {
        aircraft[f.id] = createAircraft(f, pos);
      } else {
        smoothMove(aircraft[f.id], pos);
      }

      if (selected === f.id) {
        updateHUD(f);
      }
    });

    // 5. CLEANUP OLD PLANES
    Object.keys(aircraft).forEach(id => {
      if (!activeIds.has(id)) {
        viewer.entities.remove(aircraft[id]);
        delete aircraft[id];
      }
    });

  } catch (err) {
    console.error("API ERROR:", err);
  }
}

/* =========================
   LOOP
========================= */
setInterval(loadFlights, 3000);
