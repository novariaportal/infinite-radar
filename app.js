 /**
 * Infinite Tracker - Ultimate Edition
 * Full replacement app.js
 *
 * Features:
 * - Guaranteed Aircraft Render (No time-desync vanishing)
 * - Split-Screen IFE & Floating Panel sizing logic
 * - Heavy Aviation Math (ETA, Distance, Duration, Pitch, Roll, OAT)
 * - Live CSS Transform PFD (Artificial Horizon)
 * - Flightplan & Route endpoint deep parsing
 */

const APP_NAME = "Infinite Tracker";
const DEFAULT_API_KEY = "tyy8znhl0u5kbbb2vuvdhfetmsil041u";
const CESIUM_ION_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiI3MDU4NWI1YS03ZGUxLTRmMzEtODEwZi01MDNlM2QyMTg5MzAiLCJpZCI6NDExNTkzLCJpYXQiOjE3NzQ5MjgxNjh9.NeKegq8BpQ4KqIs2hJWNgoEy2c0vidgNg869ldUVFew";
const API_BASE = "https://api.infiniteflight.com/public/v2";

const POLL_MS = 5000;
const TRAIL_LENGTH = 140;

const state = {
  apiKey: DEFAULT_API_KEY,
  sessionId: "",
  sessionName: "",
  mode: "radar", 
  
  viewer: null,
  polling: null,

  aircraftMap: new Map(), // flightId -> record
  selectedFlightId: null,
  followSelected: false,

  labelsEnabled: true,
  boundariesEnabled: true,
  didInitialZoom: false,

  ifeStarted: false,
  ifeView: "flightInfo",

  flightPlanCache: new Map(),
  flightRouteCache: new Map(),
  pendingDetailFetch: new Set(),
  
  // Store previous states for math (turn rates, pitch physics)
  physicsMap: new Map()
};

const byId = (id) => document.getElementById(id);

const els = {
  controlShell: byId("controlShell"),
  serverSelect: byId("serverSelect"),
  connectBtn: byId("connectBtn"),
  refreshBtn: byId("refreshBtn"),
  openRandomBtn: byId("openRandomBtn"),
  status: byId("status"),

  ifeModeBtn: byId("ifeModeBtn"),
  radarModeBtn: byId("radarModeBtn"),

  topMode: byId("topMode"),
  topServer: byId("topServer"),
  followBtn: byId("followBtn"),
  togglePanelBtn: byId("togglePanelBtn"),
  boundariesToggleBtn: byId("boundariesToggleBtn"),
  labelsToggleBtn: byId("labelsToggleBtn"),

  drawer: byId("flightDrawer"),
  drawerCloseBtn: byId("drawerCloseBtn"),
  tabFlightInfo: byId("tabFlightInfo"),
  tabGlass: byId("tabGlass"),
  panelFlightInfo: byId("panelFlightInfo"),
  panelGlass: byId("panelGlass"),

  fiCallsign: byId("fiCallsign"), 
  fiUser: byId("fiUser"), 
  fiAlt: byId("fiAlt"), 
  fiSpd: byId("fiSpd"), 
  fiHdg: byId("fiHdg"), 
  fiVs: byId("fiVs"), 
  fiLat: byId("fiLat"), 
  fiLon: byId("fiLon"),

  selectedStrip: byId("selectedStrip"), 
  stripCallsign: byId("stripCallsign"), 
  stripType: byId("stripType"), 
  stripPilot: byId("stripPilot"), 
  stripGs: byId("stripGs"), 
  stripAlt: byId("stripAlt"), 
  stripVs: byId("stripVs"),

  hudCallsign: byId("hudCallsign"), 
  hudAlt: byId("hudAlt"), 
  hudSpd: byId("hudSpd"), 
  hudHdg: byId("hudHdg"),

  gcSpeedTape: byId("gcSpeedTape"), 
  gcAltTape: byId("gcAltTape"), 
  gcNeedle: byId("gcNeedle"), 
  gcNDR: byId("gcNDR"), 
  gcN1L: byId("gcN1L"), 
  gcN1R: byId("gcN1R"), 
  gcEgtL: byId("gcEgtL"), 
  gcEgtR: byId("gcEgtR"), 
  gcFpln: byId("gcFpln"),

  ifeOverlay: byId("ifeOverlay"), 
  ifeWelcome: byId("ifeWelcome"), 
  ifePanel: byId("ifePanel"), 
  ifeStartBtn: byId("ifeStartBtn"), 
  ifeCloseBtn: byId("ifeCloseBtn"), 
  changeViewBtn: byId("changeViewBtn"),

  welcomeCallsign: byId("welcomeCallsign"), 
  fromCode: byId("fromCode"), 
  toCode: byId("toCode"),
  ifeTitle: byId("ifeTitle"), 
  ifeSub: byId("ifeSub"),
  ifeTabFlightInfo: byId("ifeTabFlightInfo"), 
  ifeTabGlass: byId("ifeTabGlass"), 
  ifeFlightInfoView: byId("ifeFlightInfoView"), 
  ifeGlassView: byId("ifeGlassView"),

  ifeSpd: byId("ifeSpd"), 
  ifeAlt: byId("ifeAlt"), 
  ifeHdg: byId("ifeHdg"), 
  ifeVs: byId("ifeVs"), 
  ifeDep: byId("ifeDep"), 
  ifeArr: byId("ifeArr"), 
  ifeRoute: byId("ifeRoute"),

  ifeGcSpeed: byId("ifeGcSpeed"), 
  ifeGcAlt: byId("ifeGcAlt"), 
  ifeGcNeedle: byId("ifeGcNeedle"), 
  ifeGcNdr: byId("ifeGcNdr"), 
  ifeGcN1L: byId("ifeGcN1L"), 
  ifeGcN1R: byId("ifeGcN1R"), 
  ifeGcEgtL: byId("ifeGcEgtL"), 
  ifeGcEgtR: byId("ifeGcEgtR"), 
  ifeGcFpln: byId("ifeGcFpln")
};

/* -------------------------------------------------------------------------- */
/* HEAVY AVIATION MATH PIPELINE */
/* -------------------------------------------------------------------------- */

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371; 
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(lat1 * Math.PI / 180) * 
            Math.cos(lat2 * Math.PI / 180) * 
            Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function computeEtaDetails(distKm, gsKts) {
  if (!Number.isFinite(distKm) || !Number.isFinite(gsKts) || gsKts < 30) {
    return { etaLocal: "--:--", durationText: "-- h -- min" };
  }
  const speedKmh = gsKts * 1.852;
  const hours = distKm / speedKmh;
  const totalMin = Math.max(0, Math.round(hours * 60));
  
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  
  const etaDate = new Date(Date.now() + totalMin * 60000);
  return {
    etaLocal: etaDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    durationText: `${h} h ${m} min`
  };
}

function calculateOAT(altitudeFeet) {
  return Math.round(15 - (altitudeFeet / 1000) * 1.98);
}

function updateAircraftPhysics(flightId, heading, speedKts, vsFpm, altitude) {
  const now = Date.now();
  let phys = state.physicsMap.get(flightId) || { lastHdg: heading, lastTs: now, roll: 0, pitch: 0 };

  const dtSec = (now - phys.lastTs) / 1000;
  if (dtSec > 0 && dtSec < 10) {
    let hdgDiff = heading - phys.lastHdg;
    if (hdgDiff > 180) hdgDiff -= 360;
    if (hdgDiff < -180) hdgDiff += 360;
    
    const turnRate = hdgDiff / dtSec; 
    let targetRoll = turnRate * (Math.max(speedKts, 100) / 15);
    targetRoll = Math.max(-45, Math.min(45, targetRoll)); 
    phys.roll += (targetRoll - phys.roll) * 0.5;
  }
  
  let targetPitch = 0;
  if (speedKts > 30) {
    const gsFpm = speedKts * 101.268; 
    let pitchRads = Math.asin(vsFpm / gsFpm);
    if (!isNaN(pitchRads)) {
      targetPitch = (pitchRads * 180 / Math.PI);
      if (altitude > 10000 && vsFpm > -500 && vsFpm < 500) targetPitch += 2.5; 
    }
  }
  
  phys.pitch += (targetPitch - phys.pitch) * 0.5; 
  phys.lastHdg = heading;
  phys.lastTs = now;
  
  state.physicsMap.set(flightId, phys);
  return phys;
}

/* -------------------------------------------------------------------------- */
/* UTILITIES & API */
/* -------------------------------------------------------------------------- */

function setStatus(msg, isError = false) {
  if (!els.status) return;
  els.status.textContent = msg;
  els.status.style.color = isError ? "#ff9f9f" : "var(--warn)";
}

function fmt(val, digits = 0) {
  return Number.isFinite(Number(val)) ? Number(val).toFixed(digits) : "-";
}

function headers() {
  return { Authorization: `Bearer ${state.apiKey}`, "Content-Type": "application/json" };
}

async function apiGet(path) {
  const res = await fetch(`${API_BASE}${path}`, { headers: headers() });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  if (json.errorCode !== 0) throw new Error(`API errorCode=${json.errorCode}`);
  return json.result;
}

/* -------------------------------------------------------------------------- */
/* FLIGHT PLAN PARSING */
/* -------------------------------------------------------------------------- */

function collectWaypointsDeep(items, out = []) {
  if (!Array.isArray(items)) return out;
  for (const it of items) {
    if (it?.location) {
      const lat = Number(it.location.latitude);
      const lon = Number(it.location.longitude);
      if (Number.isFinite(lat) && Number.isFinite(lon) && !(lat === 0 && lon === 0)) {
        out.push({ name: it.name || it.identifier || "WP", lat, lon });
      }
    }
    if (Array.isArray(it?.children)) collectWaypointsDeep(it.children, out);
  }
  return out;
}

function extractDepArrFromFlightPlan(fp) {
  const fallback = { dep: "DEP", arr: "NA", routeNames: [], points: [] };
  if (!fp || !Array.isArray(fp.flightPlanItems)) return fallback;

  const points = collectWaypointsDeep(fp.flightPlanItems);
  if (!points.length) return fallback;

  const dep = points[0].name || "DEP";
  const arr = points.length > 1 ? points[points.length - 1].name : "NA";

  return { dep, arr: arr || "NA", routeNames: points.map(p => p.name), points };
}

function resolveAircraftType(f, fp) {
  const c = [fp?.aircraftType, fp?.aircraftName, f?.aircraftName, f?.aircraftType, f?.aircraftId].filter(Boolean);
  return c.length ? String(c[0]) : "Unknown Type";
}

/* -------------------------------------------------------------------------- */
/* CESIUM & MAP INITIALIZATION */
/* -------------------------------------------------------------------------- */

function initCesium() {
  if (!window.Cesium) throw new Error("Cesium not loaded");
  if (CESIUM_ION_TOKEN && !CESIUM_ION_TOKEN.startsWith("PASTE_")) Cesium.Ion.defaultAccessToken = CESIUM_ION_TOKEN;

  state.viewer = new Cesium.Viewer("cesiumContainer", {
    animation: false, timeline: false, sceneModePicker: false, baseLayerPicker: false,
    geocoder: false, homeButton: true, navigationHelpButton: false, selectionIndicator: false, infoBox: false,
    terrain: Cesium.Terrain.fromWorldTerrain()
  });

  state.viewer.scene.globe.depthTestAgainstTerrain = false;

  state.viewer.screenSpaceEventHandler.setInputAction((click) => {
    const picked = state.viewer.scene.pick(click.position);
    if (picked?.id?.id && state.aircraftMap.has(picked.id.id)) selectFlight(picked.id.id);
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
}

async function applyGlobeStyle() {
  const style = state.labelsEnabled ? Cesium.IonWorldImageryStyle.AERIAL_WITH_LABELS : Cesium.IonWorldImageryStyle.AERIAL;
  const layer = await Cesium.ImageryLayer.fromProviderAsync(Cesium.createWorldImageryAsync({ style }));
  state.viewer.imageryLayers.removeAll();
  state.viewer.imageryLayers.add(layer);
  state.viewer.scene.globe.showGroundAtmosphere = !!state.boundariesEnabled;
  state.viewer.scene.globe.enableLighting = true;
  state.viewer.scene.skyAtmosphere.show = true;
  state.viewer.scene.fog.enabled = true;
}

/* -------------------------------------------------------------------------- */
/* GUARANTEED AIRCRAFT RENDERING (No time-desync vanishing) */
/* -------------------------------------------------------------------------- */

function createAircraftEntity(f, pos) {
  return state.viewer.entities.add({
    id: f.flightId,
    position: pos, // Strict position assignment, no interpolation

    // Point ensures it is ALWAYS visible from any distance
    point: {
      show: true,
      pixelSize: 10,
      color: Cesium.Color.fromCssColorString("#40e0ff"),
      outlineColor: Cesium.Color.BLACK,
      outlineWidth: 2,
      disableDepthTestDistance: Number.POSITIVE_INFINITY
    },

    // Label gives us the airplane icon without CORS or texture decode failures
    label: {
      text: "✈",
      font: "22px sans-serif",
      fillColor: Cesium.Color.WHITE,
      outlineColor: Cesium.Color.BLACK,
      outlineWidth: 4,
      style: Cesium.LabelStyle.FILL_AND_OUTLINE,
      pixelOffset: new Cesium.Cartesian2(0, -8),
      disableDepthTestDistance: Number.POSITIVE_INFINITY
    },

    polyline: {
      positions: [pos],
      width: 2,
      material: Cesium.Color.fromCssColorString("#7ec8ff").withAlpha(0.35)
    }
  });
}

function upsertAircraft(f) {
  const alt = Math.max(0, (Number(f.altitude) || 0) * 0.3048);
  const pos = Cesium.Cartesian3.fromDegrees(Number(f.longitude), Number(f.latitude), alt);

  let rec = state.aircraftMap.get(f.flightId);
  if (!rec) {
    rec = {
      entity: createAircraftEntity(f, pos),
      trail: [pos],
      last: f
    };
    state.aircraftMap.set(f.flightId, rec);
  } else {
    // Force immediate position update to bypass clock issues
    rec.entity.position = pos;
    rec.trail.push(pos);
    if (rec.trail.length > TRAIL_LENGTH) rec.trail.shift();
    rec.entity.polyline.positions = rec.trail;
    rec.last = f;
  }
}

/* -------------------------------------------------------------------------- */
/* UI BINDINGS & GLASS COCKPIT */
/* -------------------------------------------------------------------------- */

function bindHud(f) {
  if (!f) {
    els.hudCallsign.textContent = "-"; els.hudAlt.textContent = "- ft";
    els.hudSpd.textContent = "- kts"; els.hudHdg.textContent = "-°";
    return;
  }
  els.hudCallsign.textContent = f.callsign || "-";
  els.hudAlt.textContent = `${Math.round(f.altitude || 0)} ft`;
  els.hudSpd.textContent = `${Math.round(f.speed || 0)} kts`;
  els.hudHdg.textContent = `${Math.round(f.heading || 0)}°`;
}

function bindGlass(prefix, f, fp, phys) {
  const speed = Math.round(f?.speed || 0), alt = Math.round(f?.altitude || 0), hdg = Math.round(f?.heading || 0), vs = Math.round(f?.verticalSpeed || 0);
  const type = resolveAircraftType(f, fp);
  const q = (id) => byId(`${prefix}${id}`);

  if (q('Speed') || q('SpeedTape')) (q('Speed') || q('SpeedTape')).textContent = `GS ${speed}`;
  if (q('Alt') || q('AltTape')) (q('Alt') || q('AltTape')).textContent = `ALT ${alt}`;
  if (q('Ndr') || q('NDR')) (q('Ndr') || q('NDR')).textContent = `HDG ${String(hdg).padStart(3, "0")}`;
  if (q('Needle')) q('Needle').style.transform = `translate(-50%, -100%) rotate(${hdg}deg)`;

  const n1 = Math.max(20, Math.min(106, speed / 5 + 20));
  if (q('N1L')) q('N1L').textContent = n1.toFixed(1);
  if (q('N1R')) q('N1R').textContent = n1.toFixed(1);

  const egt = Math.max(18, Math.min(95, Math.abs(vs) / 40 + 35));
  if (q('EgtL')) q('EgtL').style.height = `${egt}%`;
  if (q('EgtR')) q('EgtR').style.height = `${egt}%`;

  if (q('Fpln') || q('FPLN')) {
    (q('Fpln') || q('FPLN')).innerHTML = `
      <div>CALLSIGN ${f?.callsign || "-"}</div><div>TYPE ${type}</div>
      <div>HDG ${hdg} • GS ${speed} • ALT ${alt}</div><div>V/S ${vs} fpm</div>
    `;
  }

  // --- LIVE PFD CSS TRANSFORM ---
  if (phys) {
    const PITCH_SCALE = 3.6; 
    const pitchPx = Math.max(-100, Math.min(100, phys.pitch * PITCH_SCALE));
    
    const pfdContainer = document.querySelector(prefix === 'ifeGc' ? '#ifeGlassView .pfd-face' : '#panelGlass .pfd-face');
    if (pfdContainer) {
      const transformString = `rotate(${phys.roll}deg) translateY(${pitchPx}px)`;
      const elements = ['.sky', '.ground', '.horizon-line', '.pitch-ladder'];
      elements.forEach(selector => {
        const el = pfdContainer.querySelector(selector);
        if (el) el.style.transform = transformString;
      });
    }
  }
}

function updatePanelsFromSelected() {
  const rec = state.selectedFlightId ? state.aircraftMap.get(state.selectedFlightId) : null;
  const f = rec?.last;
  if (!f) return;

  const fp = state.flightPlanCache.get(f.flightId);
  const route = state.flightRouteCache.get(f.flightId);
  const aType = resolveAircraftType(f, fp);
  const phys = updateAircraftPhysics(f.flightId, f.heading, f.speed, f.verticalSpeed, f.altitude);

  // Radar drawer
  els.fiCallsign.textContent = f.callsign || "-"; els.fiUser.textContent = f.username || "-";
  els.fiSpd.textContent = `${Math.round(f.speed || 0)} kts`; els.fiAlt.textContent = `${Math.round(f.altitude || 0)} ft`;
  els.fiHdg.textContent = `${Math.round(f.heading || 0)}°`; els.fiVs.textContent = `${Math.round(f.verticalSpeed || 0)} fpm`;

  // Strip
  els.stripCallsign.textContent = f.callsign || "-"; els.stripType.textContent = aType;
  els.stripPilot.textContent = f.username || "-"; els.stripGs.textContent = `${Math.round(f.speed || 0)} kts`;

  // HUD & Glass
  bindHud(f); bindGlass("gc", f, fp, phys); bindGlass("ifeGc", f, fp, phys);

  // IFE Top Section
  els.ifeTitle.textContent = f.callsign || "--"; els.ifeSub.textContent = `${aType} • ${f.username || "-"}`;
  els.welcomeCallsign.textContent = f.callsign || "--";
  els.ifeSpd.textContent = `${Math.round(f.speed || 0)} kts`; els.ifeAlt.textContent = `${Math.round(f.altitude || 0)} ft`;
  els.ifeHdg.textContent = `${Math.round(f.heading || 0)}°`; els.ifeVs.textContent = `${Math.round(f.verticalSpeed || 0)} fpm`;

  // Route & Math Injection
  const parsed = extractDepArrFromFlightPlan(fp);
  const oat = calculateOAT(f.altitude || 0);

  if (els.ifeDep) els.ifeDep.textContent = parsed.dep;
  if (els.ifeArr) els.ifeArr.textContent = parsed.arr;
  if (els.fromCode) els.fromCode.textContent = parsed.dep;
  if (els.toCode) els.toCode.textContent = parsed.arr;

  if (parsed.points.length >= 1) {
    const dest = parsed.points[parsed.points.length - 1];
    const distKm = haversineKm(f.latitude, f.longitude, dest.lat, dest.lon);
    const eta = computeEtaDetails(distKm, f.speed);
    const routeText = parsed.routeNames.length ? parsed.routeNames.join(" → ") : "No route names";

    if (els.ifeRoute) {
      els.ifeRoute.innerHTML = `
        <div style="color:#bcd2ff; font-size:0.9rem; margin-bottom:12px;">${routeText}</div>
        <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:10px; border-top:1px solid rgba(255,255,255,0.1); padding-top:10px;">
          <div style="text-align:center;"><small style="color:#9eb5df;">Dist to Dest</small><br/><strong style="font-size:1.1rem; color:#17dcb2;">${Math.round(distKm)} km</strong></div>
          <div style="text-align:center;"><small style="color:#9eb5df;">ETA (Local)</small><br/><strong style="font-size:1.1rem; color:#17dcb2;">${eta.etaLocal}</strong></div>
          <div style="text-align:center;"><small style="color:#9eb5df;">Time to Arr</small><br/><strong style="font-size:1.1rem; color:#17dcb2;">${eta.durationText}</strong></div>
          <div style="text-align:center; grid-column: 1 / span 3; margin-top:5px;"><small style="color:#9eb5df;">OAT: ${oat}°C • Arrival: ${parsed.arr}</small></div>
        </div>
      `;
    }
  } else {
    if (els.ifeRoute) {
      els.ifeRoute.innerHTML = `
        <div>No valid flight plan waypoints available</div>
        <div style="margin-top:8px;">ETA (Local): <b>--:--</b></div>
        <div>Time to Arrival: <b>-- h -- min</b></div>
        <div>Arrival: <b>NA</b></div>
      `;
    }
  }
}

/* -------------------------------------------------------------------------- */
/* POLLING & SELECTION */
/* -------------------------------------------------------------------------- */

async function fetchSelectedFlightDetails(flightId) {
  if (!state.sessionId || !flightId) return;
  if (state.pendingDetailFetch.has(flightId)) return;
  state.pendingDetailFetch.add(flightId);

  try {
    try {
      const fp = await apiGet(`/sessions/${state.sessionId}/flights/${flightId}/flightplan`);
      state.flightPlanCache.set(flightId, fp);
    } catch { state.flightPlanCache.set(flightId, null); }

    try {
      const route = await apiGet(`/sessions/${state.sessionId}/flights/${flightId}/route`);
      state.flightRouteCache.set(flightId, Array.isArray(route) ? route : []);
    } catch { state.flightRouteCache.set(flightId, null); }

    if (state.selectedFlightId === flightId) updatePanelsFromSelected();
  } finally {
    state.pendingDetailFetch.delete(flightId);
  }
}

async function pollFlights() {
  if (!state.sessionId) return;
  try {
    const flights = await apiGet(`/sessions/${state.sessionId}/flights`);
    const activeIds = new Set();

    flights.forEach((f) => {
      activeIds.add(f.flightId);
      upsertAircraft(f);
    });

    for (const [id, rec] of state.aircraftMap.entries()) {
      if (!activeIds.has(id)) {
        state.viewer.entities.remove(rec.entity);
        state.aircraftMap.delete(id);
        if (state.selectedFlightId === id) state.selectedFlightId = null;
      }
    }

    if (!state.didInitialZoom && flights.length > 0) {
      const seed = flights[Math.floor(Math.random() * flights.length)];
      state.viewer.camera.flyTo({ destination: Cesium.Cartesian3.fromDegrees(Number(seed.longitude), Number(seed.latitude), 2500000), duration: 1.2 });
      state.didInitialZoom = true;
    }

    if (state.selectedFlightId) updatePanelsFromSelected();
    if (state.followSelected && state.selectedFlightId) state.viewer.trackedEntity = state.aircraftMap.get(state.selectedFlightId)?.entity;

    setStatus(`Tracking ${flights.length} flights`);
  } catch (e) {
    setStatus(`Polling error: ${e.message}`, true);
  }
}

function selectFlight(flightId) {
  state.selectedFlightId = flightId;
  for (const [id, rec] of state.aircraftMap.entries()) {
    const isSelected = id === flightId;
    rec.entity.point.pixelSize = isSelected ? 14 : 10;
    rec.entity.label.scale = isSelected ? 1.2 : 1.0;
    rec.entity.polyline.width = isSelected ? 3 : 2;
  }
  
  updatePanelsFromSelected();
  fetchSelectedFlightDetails(flightId);

  if (state.mode === "ife") {
    if (!state.ifeStarted) {
      els.ifeOverlay?.classList.remove("hidden"); els.ifeWelcome?.classList.remove("hidden"); els.ifePanel?.classList.add("hidden");
    } else {
      els.ifeOverlay?.classList.remove("hidden"); els.ifeWelcome?.classList.add("hidden"); els.ifePanel?.classList.remove("hidden");
    }
  } else {
    if (els.drawer) els.drawer.style.display = "block";
    if (els.selectedStrip) els.selectedStrip.style.display = "flex";
  }
}

/* -------------------------------------------------------------------------- */
/* INIT & EVENTS */
/* -------------------------------------------------------------------------- */

(async function bootstrap() {
  // Inject CSS to fix PFD background clipping during rotation
  const style = document.createElement('style');
  style.innerHTML = `.pfd-face .sky, .pfd-face .ground { height: 200% !important; width: 200% !important; left: -50% !important; } .pfd-face .sky { top: -100% !important; } .pfd-face .ground { bottom: -100% !important; }`;
  document.head.appendChild(style);

  try {
    document.title = APP_NAME;
    initCesium();
    await applyGlobeStyle();

    // Radar Tabs
    els.tabFlightInfo?.addEventListener("click", () => { els.tabFlightInfo.classList.add("active"); els.tabGlass.classList.remove("active"); els.panelFlightInfo.style.display = "block"; els.panelGlass.style.display = "none"; });
    els.tabGlass?.addEventListener("click", () => { els.tabFlightInfo.classList.remove("active"); els.tabGlass.classList.add("active"); els.panelFlightInfo.style.display = "none"; els.panelGlass.style.display = "block"; });
    
    // Core Buttons
    els.connectBtn?.addEventListener("click", () => { state.sessionId = els.serverSelect?.value; state.sessionName = els.serverSelect?.options[els.serverSelect.selectedIndex]?.text; if(state.polling) clearInterval(state.polling); pollFlights(); state.polling = setInterval(pollFlights, POLL_MS); });
    els.openRandomBtn?.addEventListener("click", () => { const a = Array.from(state.aircraftMap.values()); if(a.length) { const f = a[Math.floor(Math.random()*a.length)].last; state.viewer.camera.flyTo({destination: Cesium.Cartesian3.fromDegrees(Number(f.longitude), Number(f.latitude), 250000), duration: 1.3}); selectFlight(f.flightId); }});
    
    // Modes
    els.radarModeBtn?.addEventListener("click", () => { state.mode = "radar"; document.body.classList.remove("mode-ife"); document.body.classList.add("mode-radar"); els.ifeOverlay?.classList.add("hidden"); els.radarModeBtn.classList.add("active"); els.ifeModeBtn.classList.remove("active"); });
    els.ifeModeBtn?.addEventListener("click", () => { state.mode = "ife"; document.body.classList.add("mode-ife"); document.body.classList.remove("mode-radar"); els.radarModeBtn.classList.remove("active"); els.ifeModeBtn.classList.add("active"); if(state.selectedFlightId) { els.ifeOverlay?.classList.remove("hidden"); if(!state.ifeStarted) { els.ifeWelcome?.classList.remove("hidden"); els.ifePanel?.classList.add("hidden"); } else { els.ifeWelcome?.classList.add("hidden"); els.ifePanel?.classList.remove("hidden"); } } });
    
    // Toggles
    els.followBtn?.addEventListener("click", () => { state.followSelected = !state.followSelected; els.followBtn.classList.toggle("active", state.followSelected); if (!state.followSelected) state.viewer.trackedEntity = undefined; else if(state.selectedFlightId) state.viewer.trackedEntity = state.aircraftMap.get(state.selectedFlightId)?.entity; });
    els.labelsToggleBtn?.addEventListener("click", async () => { state.labelsEnabled = !state.labelsEnabled; els.labelsToggleBtn.textContent = `Map Labels: ${state.labelsEnabled ? "ON" : "OFF"}`; await applyGlobeStyle(); });
    els.boundariesToggleBtn?.addEventListener("click", async () => { state.boundariesEnabled = !state.boundariesEnabled; els.boundariesToggleBtn.textContent = `Boundaries: ${state.boundariesEnabled ? "ON" : "OFF"}`; await applyGlobeStyle(); });
    els.togglePanelBtn?.addEventListener("click", () => { const hidden = els.controlShell?.classList.toggle("hidden"); if (els.togglePanelBtn) els.togglePanelBtn.textContent = hidden ? "Show Panel" : "Hide Panel"; });

    // IFE Panel controls
    els.ifeStartBtn?.addEventListener("click", () => { state.ifeStarted = true; els.ifeWelcome?.classList.add("hidden"); els.ifePanel?.classList.remove("hidden"); });
    els.ifeCloseBtn?.addEventListener("click", () => els.ifeOverlay?.classList.add("hidden"));
    els.changeViewBtn?.addEventListener("click", () => { state.ifeView = state.ifeView === "flightInfo" ? "glass" : "flightInfo"; els.ifeFlightInfoView?.classList.toggle("hidden", state.ifeView !== "flightInfo"); els.ifeGlassView?.classList.toggle("hidden", state.ifeView === "flightInfo"); els.ifeTabFlightInfo?.classList.toggle("active", state.ifeView === "flightInfo"); els.ifeTabGlass?.classList.toggle("active", state.ifeView !== "flightInfo"); });
    els.drawerCloseBtn?.addEventListener("click", () => { if (els.drawer) els.drawer.style.display = "none"; if (els.selectedStrip) els.selectedStrip.style.display = "none"; state.selectedFlightId = null; });

    // Load servers
    const sessions = await apiGet("/sessions");
    els.serverSelect.innerHTML = `<option value="">Select server</option>`;
    sessions.forEach(s => els.serverSelect.innerHTML += `<option value="${s.id}">${s.name} (${s.userCount}/${s.maxUsers})</option>`);
    setStatus("Ready.");
  } catch (e) { setStatus(`Startup error: ${e.message}`, true); }
})();
