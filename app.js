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

viewer.camera.setView({
  destination: Cesium.Cartesian3.fromDegrees(0, 20, 20000000)
});

viewer.scene.globe.baseColor = Cesium.Color.BLACK;

let aircraft = {};
let selected = null;

/* =========================
   MODE SYSTEM
========================= */
function applyMode(mode) {
  document.body.classList.toggle("radar-mode", mode === "radar");
  document.body.classList.toggle("ife-mode", mode === "ife");

  viewer.scene.globe.enableLighting = mode === "ife";
}

document.getElementById("mode").addEventListener("change", e => {
  applyMode(e.target.value);
});

applyMode("radar");

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
   AIRCRAFT STYLE
========================= */
function createAircraft(f, pos) {
  return viewer.entities.add({
    position: pos,
    billboard: {
      image: "https://cdn-icons-png.flaticon.com/512/684/684908.png",
      scale: 0.03,
      color: Cesium.Color.WHITE
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
   LOAD DATA
========================= */
async function loadFlights() {
  try {
    const sessions = await (await fetch(
      `https://api.infiniteflight.com/public/v2/sessions?apikey=${API_KEY}`
    )).json();

    if (!sessions.result) return;

    const session = sessions.result[0];

    const flights = await (await fetch(
      `https://api.infiniteflight.com/public/v2/sessions/${session.id}/flights?apikey=${API_KEY}`
    )).json();

    if (!flights.result) return;

    const activeIds = new Set(flights.result.map(f => f.id));

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
    });

    // cleanup
    Object.keys(aircraft).forEach(id => {
      if (!activeIds.has(id)) {
        viewer.entities.remove(aircraft[id]);
        delete aircraft[id];
      }
    });

  } catch (err) {
    console.error(err);
  }
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
   COUNTRY BORDERS + LABELS
========================= */
async function loadCountries() {
  const dataSource = await Cesium.GeoJsonDataSource.load(
    "https://raw.githubusercontent.com/datasets/geo-countries/master/data/countries.geojson"
  );

  viewer.dataSources.add(dataSource);

  dataSource.entities.values.forEach(entity => {
    entity.polygon.material = Cesium.Color.TRANSPARENT;
    entity.polygon.outline = true;
    entity.polygon.outlineColor = Cesium.Color.WHITE.withAlpha(0.2);

    entity.label = {
      text: entity.name,
      font: "12px sans-serif",
      fillColor: Cesium.Color.WHITE,
      outlineColor: Cesium.Color.BLACK,
      outlineWidth: 2,
      style: Cesium.LabelStyle.FILL_AND_OUTLINE,
      scale: 0.5
    };
  });
}

loadCountries();

/* =========================
   MAIN LOOP
========================= */
setInterval(() => {
  loadFlights();
}, 2000);
