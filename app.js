const API_KEY = "tyy8znhl0u5kbbb2vuvdhfetmsil041u";
Cesium.Ion.defaultAccessToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiI3MDU4NWI1YS03ZGUxLTRmMzEtODEwZi01MDNlM2QyMTg5MzAiLCJpZCI6NDExNTkzLCJpYXQiOjE3NzQ5MjgxNjh9.NeKegq8BpQ4KqIs2hJWNgoEy2c0vidgNg869ldUVFew";

async function init() {
  const viewer = new Cesium.Viewer("cesiumContainer", {
    terrainProvider: await Cesium.CesiumTerrainProvider.fromIonAssetId(1),
    baseLayerPicker: false,
    geocoder: false,
    animation: false,
    timeline: false
  });

  viewer.scene.globe.baseColor = Cesium.Color.BLACK;

  viewer.camera.setView({
    destination: Cesium.Cartesian3.fromDegrees(0, 20, 20000000)
  });

  return viewer;
}

const viewer = await init();

/* =========================
   MODE SYSTEM
========================= */
function setMode(mode) {
  document.body.classList.toggle("ife-mode", mode === "ife");
  document.body.classList.toggle("radar-mode", mode === "radar");

  viewer.scene.globe.enableLighting = mode === "ife";
}

document.getElementById("mode").addEventListener("change", e => {
  setMode(e.target.value);
});

setMode("ife");

/* =========================
   AIRCRAFT
========================= */
let aircraft = {};

function createAircraft(f, pos) {
  return viewer.entities.add({
    position: pos,

    billboard: {
      image: "https://cdn-icons-png.flaticon.com/512/0/619.png",
      scale: 0.04,
      color: Cesium.Color.WHITE
    },

    label: {
      text: f.callsign || "FLIGHT",
      font: "11px monospace",
      fillColor: Cesium.Color.WHITE,
      outlineColor: Cesium.Color.BLACK,
      outlineWidth: 2,
      pixelOffset: new Cesium.Cartesian2(0, -30)
    },

    path: {
      material: Cesium.Color.CYAN.withAlpha(0.6),
      width: 2,
      leadTime: 0,
      trailTime: 300
    }
  });
}

function updateInfo(f) {
  document.getElementById("callsign").textContent = f.callsign || "—";
  document.getElementById("alt").textContent = f.altitude ? `${Math.round(f.altitude)} ft` : "—";
  document.getElementById("speed").textContent = f.groundSpeed ? `${Math.round(f.groundSpeed)} kts` : "—";
  document.getElementById("heading").textContent = f.heading ? `${Math.round(f.heading)}°` : "—";
}

/* =========================
   SMOOTH MOVE
========================= */
function smoothMove(entity, pos) {
  const now = Cesium.JulianDate.now();

  const prop = new Cesium.SampledPositionProperty();
  const current = entity.position.getValue(now);

  if (!current) return;

  prop.addSample(now, current);

  const future = Cesium.JulianDate.addSeconds(now, 2, new Cesium.JulianDate());
  prop.addSample(future, pos);

  entity.position = prop;
}

/* =========================
   LOAD REAL FLIGHTS (IF)
========================= */
async function loadFlights() {
  try {
    const res = await fetch("https://api.infiniteflight.com/public/v2/flights?apikey=YOUR_API_KEY");
    const data = await res.json();

    if (!data.result) return;

    data.result.forEach(f => {
      if (!f.latitude || !f.longitude) return;

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

      updateInfo(f);
    });

  } catch (err) {
    console.error(err);
  }
}

setInterval(loadFlights, 3000);

/* =========================
   COUNTRY LAYERS
========================= */
async function loadCountries() {
  const ds = await Cesium.GeoJsonDataSource.load(
    "https://raw.githubusercontent.com/datasets/geo-countries/master/data/countries.geojson"
  );

  viewer.dataSources.add(ds);

  ds.entities.values.forEach(e => {
    e.polygon.material = Cesium.Color.TRANSPARENT;
    e.polygon.outline = true;
    e.polygon.outlineColor = Cesium.Color.WHITE.withAlpha(0.15);

    e.label = {
      text: e.name,
      font: "10px sans-serif",
      fillColor: Cesium.Color.WHITE,
      outlineColor: Cesium.Color.BLACK,
      outlineWidth: 2,
      scale: 0.6
    };
  });
}

loadCountries();
