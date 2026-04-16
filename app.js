/**
 * Infinite Tracker v1.4 (Expanded & Readable)
 * Full replacement app.js
 *
 * Includes:
 * - Heavy Aviation Math: Haversine Distances, ETA, Pitch/Roll, OAT
 * - Live PFD Artificial Horizon CSS Transform pipeline
 * - Bulletproof base64 PNG aircraft icon generator
 * - Flight Plan & Route API wiring
 * - Aircraft type inference pipeline
 * - Corrected IFE flow & Sizing guards
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
  
  bulletproofPlaneIconBase64: null,

  // Store previous states for math (turn rates, physics)
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

// 1. Haversine Distance (returns Kilometers)
function getDistanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371; 
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// 2. Outside Air Temperature (OAT)
function calculateOAT(altitudeFeet) {
  // Standard lapse rate: 15°C at MSL, drops ~1.98°C per 1,000ft
  return Math.round(15 - (altitudeFeet / 1000) * 1.98);
}

// 3. Pitch & Roll Physics Engine
function updateAircraftPhysics(flightId, heading, speedKts, vsFpm, altitude) {
  const now = Date.now();
  let phys = state.physicsMap.get(flightId) || { lastHdg: heading, lastTs: now, roll: 0, pitch: 0 };

  // Calculate Roll (Bank Angle) based on Turn Rate
  const dtSec = (now - phys.lastTs) / 1000;
  
  if (dtSec > 0 && dtSec < 10) {
    let hdgDiff = heading - phys.lastHdg;
    if (hdgDiff > 180) hdgDiff -= 360;
    if (hdgDiff < -180) hdgDiff += 360;
    
    const turnRate = hdgDiff / dtSec; // degrees per second
    
    // Approximate bank angle: standard rate (3 deg/sec) is ~25deg bank at 150kts
    let targetRoll = turnRate * (Math.max(speedKts, 100) / 15);
    targetRoll = Math.max(-45, Math.min(45, targetRoll)); // Cap at 45 deg
    
    // Smooth the roll
    phys.roll += (targetRoll - phys.roll) * 0.5;
  }
  
  // Calculate Pitch based on Vertical Speed vs Ground Speed
  let targetPitch = 0;
  if (speedKts > 30) {
    const gsFpm = speedKts * 101.268; // knots to feet per minute
    let pitchRads = Math.asin(vsFpm / gsFpm);
    
    if (!isNaN(pitchRads)) {
      targetPitch = (pitchRads * 180 / Math.PI);
      
      // Add artificial Angle of Attack (airliners pitch up slightly in cruise)
      if (altitude > 10000 && vsFpm > -500 && vsFpm < 500) {
        targetPitch += 2.5; 
      }
    }
  }
  
  phys.pitch += (targetPitch - phys.pitch) * 0.5; // Smooth pitch change
  phys.lastHdg = heading;
  phys.lastTs = now;
  
  state.physicsMap.set(flightId, phys);
  return phys;
}

/* -------------------------------------------------------------------------- */
/* Utilities & API */
/* -------------------------------------------------------------------------- */

function setStatus(msg, isError = false) {
  if (!els.status) return;
  els.status.textContent = msg;
  els.status.style.color = isError ? "#ff9f9f" : "var(--warn)";
}

function fmt(value, digits = 0) {
  if (!Number.isFinite(Number(value))) return "-";
  return Number(value).toFixed(digits);
}

function headers() {
  return { 
    Authorization: `Bearer ${state.apiKey}`, 
    "Content-Type": "application/json" 
  };
}

async function apiGet(path) {
  const res = await fetch(`${API_BASE}${path}`, { headers: headers() });
  
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  
  const json = await res.json();
  if (json.errorCode !== 0) {
    throw new Error(`API errorCode=${json.errorCode}`);
  }
  
  return json.result;
}

async function fetchSelectedFlightDetails(flightId) {
  if (!state.sessionId || !flightId) return;
  if (state.pendingDetailFetch.has(flightId)) return;
  
  state.pendingDetailFetch.add(flightId);

  try {
    try {
      const fp = await apiGet(`/sessions/${state.sessionId}/flights/${flightId}/flightplan`);
      state.flightPlanCache.set(flightId, fp);
    } catch (e) { 
      state.flightPlanCache.set(flightId, null); 
    }

    try {
      const route = await apiGet(`/sessions/${state.sessionId}/flights/${flightId}/route`);
      state.flightRouteCache.set(flightId, Array.isArray(route) ? route : []);
    } catch (e) { 
      state.flightRouteCache.set(flightId, null); 
    }

    if (state.selectedFlightId === flightId) {
      updatePanelsFromSelected();
    }
  } finally {
    state.pendingDetailFetch.delete(flightId);
  }
}

function extractPlanWaypoints(items, out = []) {
  if (!Array.isArray(items)) return out;
  
  for (const item of items) {
    if (item?.name && item?.location) {
      out.push({ 
        name: item.name, 
        lat: item.location.latitude, 
        lon: item.location.longitude 
      });
    }
    if (Array.isArray(item?.children)) {
      extractPlanWaypoints(item.children, out);
    }
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* Bulletproof Base64 PNG Icon */
/* -------------------------------------------------------------------------- */

function getBulletproofPlaneIcon() {
  if (state.bulletproofPlaneIconBase64) {
    return state.bulletproofPlaneIconBase64;
  }
  
  const c = document.createElement("canvas");
  c.width = 64; 
  c.height = 64;
  const g = c.getContext("2d");
  
  g.translate(32, 32);
  g.fillStyle = "#ffffff"; 
  g.strokeStyle = "#000000"; 
  g.lineWidth = 2.5; 
  g.lineJoin = "round";
  
  g.beginPath();
  g.moveTo(0, -26); 
  g.lineTo(5, -10); 
  g.lineTo(26, 4); 
  g.lineTo(26, 9);
  g.lineTo(5, 5); 
  g.lineTo(3, 16); 
  g.lineTo(10, 22); 
  g.lineTo(10, 26);
  g.lineTo(0, 23); 
  g.lineTo(-10, 26); 
  g.lineTo(-10, 22); 
  g.lineTo(-3, 16);
  g.lineTo(-5, 5); 
  g.lineTo(-26, 9); 
  g.lineTo(-26, 4); 
  g.lineTo(-5, -10);
  g.closePath(); 
  
  g.fill(); 
  g.stroke();
  
  state.bulletproofPlaneIconBase64 = c.toDataURL("image/png");
  return state.bulletproofPlaneIconBase64;
}

/* -------------------------------------------------------------------------- */
/* Cesium & Visuals */
/* -------------------------------------------------------------------------- */

function initCesium() {
  if (!window.Cesium) throw new Error("Cesium not loaded");
  
  if (CESIUM_ION_TOKEN && !CESIUM_ION_TOKEN.startsWith("PASTE_")) {
    Cesium.Ion.defaultAccessToken = CESIUM_ION_TOKEN;
  }

  state.viewer = new Cesium.Viewer("cesiumContainer", {
    animation: false, 
    timeline: false, 
    sceneModePicker: false, 
    baseLayerPicker: false,
    geocoder: false, 
    homeButton: true, 
    navigationHelpButton: false, 
    selectionIndicator: false, 
    infoBox: false,
    terrain: Cesium.Terrain.fromWorldTerrain()
  });

  state.viewer.scene.globe.depthTestAgainstTerrain = false;
  
  state.viewer.screenSpaceEventHandler.setInputAction((click) => {
    const picked = state.viewer.scene.pick(click.position);
    if (picked?.id?.id && state.aircraftMap.has(picked.id.id)) {
      selectFlight(picked.id.id);
    }
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
}

async function applyGlobeStyle() {
  const style = state.labelsEnabled 
    ? Cesium.IonWorldImageryStyle.AERIAL_WITH_LABELS 
    : Cesium.IonWorldImageryStyle.AERIAL;
    
  const layer = await Cesium.ImageryLayer.fromProviderAsync(
    Cesium.createWorldImageryAsync({ style })
  );
  
  state.viewer.imageryLayers.removeAll();
  state.viewer.imageryLayers.add(layer);
  
  state.viewer.scene.globe.showGroundAtmosphere = !!state.boundariesEnabled;
  state.viewer.scene.globe.enableLighting = true;
  state.viewer.scene.skyAtmosphere.show = true;
  state.viewer.scene.fog.enabled = true;
}

/* -------------------------------------------------------------------------- */
/* Flow & Panels */
/* -------------------------------------------------------------------------- */

function resolveAircraftType(flight, fp) {
  const c = [
    fp?.aircraftType, 
    fp?.aircraftName, 
    flight?.aircraftName, 
    flight?.aircraftType, 
    flight?.aircraftId
  ].filter(Boolean);
  
  return c.length ? String(c[0]) : "Unknown Type";
}

function bindGlass(prefix, f, fp, phys) {
  const speed = Math.round(f?.speed || 0);
  const alt = Math.round(f?.altitude || 0);
  const hdg = Math.round(f?.heading || 0);
  const vs = Math.round(f?.verticalSpeed || 0);
  const type = resolveAircraftType(f, fp);

  const q = (id) => byId(`${prefix}${id}`);
  
  if (q('Speed') || q('SpeedTape')) {
    (q('Speed') || q('SpeedTape')).textContent = `GS ${speed}`;
  }
  
  if (q('Alt') || q('AltTape')) {
    (q('Alt') || q('AltTape')).textContent = `ALT ${alt}`;
  }
  
  if (q('Ndr') || q('NDR')) {
    (q('Ndr') || q('NDR')).textContent = `HDG ${String(hdg).padStart(3, "0")}`;
  }
  
  if (q('Needle')) {
    q('Needle').style.transform = `translate(-50%, -100%) rotate(${hdg}deg)`;
  }

  const n1 = Math.max(20, Math.min(106, speed / 5 + 20));
  if (q('N1L')) q('N1L').textContent = n1.toFixed(1);
  if (q('N1R')) q('N1R').textContent = n1.toFixed(1);

  const egt = Math.max(18, Math.min(95, Math.abs(vs) / 40 + 35));
  if (q('EgtL')) q('EgtL').style.height = `${egt}%`;
  if (q('EgtR')) q('EgtR').style.height = `${egt}%`;

  if (q('Fpln') || q('FPLN')) {
    (q('Fpln') || q('FPLN')).innerHTML = `
      <div>CALLSIGN ${f?.callsign || "-"}</div>
      <div>TYPE ${type}</div>
      <div>HDG ${hdg} • GS ${speed} • ALT ${alt}</div>
      <div>V/S ${vs} fpm</div>
    `;
  }

  // --- PFD CSS TRANSFORM ENGINE ---
  if (phys) {
    const PITCH_SCALE = 3.6; // pixels per degree of pitch
    const pitchPx = Math.max(-100, Math.min(100, phys.pitch * PITCH_SCALE));
    const rollDeg = phys.roll;
    
    // Find elements matching the prefix context
    const pfdContainer = document.querySelector(
      prefix === 'ifeGc' ? '#ifeGlassView .pfd-face' : '#panelGlass .pfd-face'
    );
    
    if (pfdContainer) {
      const sky = pfdContainer.querySelector('.sky');
      const ground = pfdContainer.querySelector('.ground');
      const line = pfdContainer.querySelector('.horizon-line');
      const ladder = pfdContainer.querySelector('.pitch-ladder');
      
      const transformString = `rotate(${rollDeg}deg) translateY(${pitchPx}px)`;
      
      if (sky) sky.style.transform = transformString;
      if (ground) ground.style.transform = transformString;
      if (line) line.style.transform = transformString;
      if (ladder) ladder.style.transform = transformString;
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
  els.fiCallsign.textContent = f.callsign || "-"; 
  els.fiUser.textContent = f.username || "-";
  els.fiSpd.textContent = `${Math.round(f.speed || 0)} kts`; 
  els.fiAlt.textContent = `${Math.round(f.altitude || 0)} ft`;
  els.fiHdg.textContent = `${Math.round(f.heading || 0)}°`; 
  els.fiVs.textContent = `${Math.round(f.verticalSpeed || 0)} fpm`;

  // IFE Top Section
  els.ifeTitle.textContent = f.callsign || "--";
  els.ifeSub.textContent = `${aType} • ${f.username || "-"}`;
  els.welcomeCallsign.textContent = f.callsign || "--";
  els.ifeSpd.textContent = `${Math.round(f.speed || 0)} kts`;
  els.ifeAlt.textContent = `${Math.round(f.altitude || 0)} ft`;
  els.ifeHdg.textContent = `${Math.round(f.heading || 0)}°`;
  els.ifeVs.textContent = `${Math.round(f.verticalSpeed || 0)} fpm`;

  bindGlass("gc", f, fp, phys);
  bindGlass("ifeGc", f, fp, phys);

  // --- MATH PIPELINE INJECTION (Distance, ETA, OAT) ---
  let distStr = "---";
  let etaStr = "---";
  const oat = calculateOAT(f.altitude || 0);
  let routeText = "No flight plan filed";

  if (fp?.flightPlanItems?.length) {
    const wpts = extractPlanWaypoints(fp.flightPlanItems);
    if (wpts.length > 0) {
      const origin = wpts[0];
      const dest = wpts[wpts.length - 1];
      
      if (els.ifeDep) els.ifeDep.textContent = origin.name;
      if (els.ifeArr) els.ifeArr.textContent = dest.name;
      if (els.fromCode) els.fromCode.textContent = origin.name;
      if (els.toCode) els.toCode.textContent = dest.name;

      // Distance to Dest Math
      if (dest.lat !== 0 && dest.lon !== 0) {
        const distKm = getDistanceKm(f.latitude, f.longitude, dest.lat, dest.lon);
        distStr = `${Math.round(distKm)} km`;

        // ETA Math
        if (f.speed > 50) {
          const speedKmh = f.speed * 1.852; 
          const hoursRem = distKm / speedKmh;
          const etaDate = new Date(Date.now() + hoursRem * 3600000);
          etaStr = etaDate.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        }
      }
      routeText = wpts.map(w => w.name).join(" → ");
    }
  }

  // Inject Math data into UI
  if (els.ifeRoute) {
    els.ifeRoute.innerHTML = `
      <div style="color:#bcd2ff; font-size:0.9rem; margin-bottom:12px; line-height:1.4;">${routeText}</div>
      <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:10px; border-top:1px solid rgba(255,255,255,0.1); padding-top:10px;">
        <div style="text-align:center;"><small style="color:#9eb5df;">Dist to Dest</small><br/><strong style="font-size:1.2rem; color:#17dcb2;">${distStr}</strong></div>
        <div style="text-align:center;"><small style="color:#9eb5df;">ETA</small><br/><strong style="font-size:1.2rem; color:#17dcb2;">${etaStr}</strong></div>
        <div style="text-align:center;"><small style="color:#9eb5df;">OAT</small><br/><strong style="font-size:1.2rem; color:#17dcb2;">${oat}°C</strong></div>
      </div>
    `;
  }
}

/* -------------------------------------------------------------------------- */
/* Main Engine & Polling */
/* -------------------------------------------------------------------------- */

function createAircraftEntity(flight, cartesianPos, sampledPos) {
  return state.viewer.entities.add({
    id: flight.flightId, 
    position: sampledPos,
    billboard: { 
      image: getBulletproofPlaneIcon(), 
      show: true, 
      width: 32, 
      height: 32, 
      rotation: Cesium.Math.toRadians((flight.heading || 0) - 90), 
      verticalOrigin: Cesium.VerticalOrigin.CENTER, 
      horizontalOrigin: Cesium.HorizontalOrigin.CENTER, 
      disableDepthTestDistance: Number.POSITIVE_INFINITY 
    },
    polyline: { 
      positions: [cartesianPos], 
      width: 2, 
      material: Cesium.Color.fromCssColorString("#7ec8ff").withAlpha(0.35) 
    }
  });
}

function upsertAircraft(f) {
  const now = Cesium.JulianDate.now();
  const alt = Math.max(0, (Number(f.altitude) || 0) * 0.3048);
  const pos = Cesium.Cartesian3.fromDegrees(Number(f.longitude), Number(f.latitude), alt);
  let rec = state.aircraftMap.get(f.flightId);

  if (!rec) {
    const sampled = new Cesium.SampledPositionProperty();
    sampled.setInterpolationOptions({ 
      interpolationDegree: 1, 
      interpolationAlgorithm: Cesium.LinearApproximation 
    });
    sampled.addSample(now, pos);
    
    rec = { 
      entity: createAircraftEntity(f, pos, sampled), 
      sampled, 
      trail: [pos], 
      last: f 
    };
    state.aircraftMap.set(f.flightId, rec);
  } else {
    rec.sampled.addSample(now, pos); 
    rec.trail.push(pos); 
    
    if (rec.trail.length > TRAIL_LENGTH) {
      rec.trail.shift();
    }
    
    rec.entity.polyline.positions = rec.trail; 
    rec.entity.billboard.rotation = Cesium.Math.toRadians((f.heading || 0) - 90); 
    rec.last = f;
  }
}

async function pollFlights() {
  if (!state.sessionId) return;
  
  try {
    const flights = await apiGet(`/sessions/${state.sessionId}/flights`);
    const active = new Set();
    
    flights.forEach((f) => { 
      active.add(f.flightId); 
      upsertAircraft(f); 
    });
    
    for (const [id, rec] of state.aircraftMap.entries()) {
      if (!active.has(id)) { 
        state.viewer.entities.remove(rec.entity); 
        state.aircraftMap.delete(id); 
        
        if (state.selectedFlightId === id) {
          state.selectedFlightId = null;
        }
      }
    }
    
    if (!state.didInitialZoom && flights.length > 0) {
      const r = flights[Math.floor(Math.random() * flights.length)];
      state.viewer.camera.flyTo({ 
        destination: Cesium.Cartesian3.fromDegrees(Number(r.longitude), Number(r.latitude), 2500000), 
        duration: 1.2 
      });
      state.didInitialZoom = true;
    }
    
    if (state.selectedFlightId) {
      updatePanelsFromSelected();
    }
    
    if (state.followSelected && state.selectedFlightId) {
      state.viewer.trackedEntity = state.aircraftMap.get(state.selectedFlightId)?.entity;
    }
    
    setStatus(`Tracking ${flights.length} flights`);
  } catch (e) { 
    setStatus(`Polling error: ${e.message}`, true); 
  }
}

function selectFlight(flightId) {
  state.selectedFlightId = flightId;
  
  for (const [id, rec] of state.aircraftMap.entries()) {
    const isSelected = id === flightId;
    rec.entity.billboard.scale = isSelected ? 1.35 : 1.0; 
    rec.entity.polyline.width = isSelected ? 3 : 2;
  }
  
  updatePanelsFromSelected();
  fetchSelectedFlightDetails(flightId);

  if (state.mode === "ife") { 
    if (!state.ifeStarted) { 
      els.ifeOverlay.classList.remove("hidden"); 
      els.ifeWelcome.classList.remove("hidden"); 
      els.ifePanel.classList.add("hidden"); 
    } else { 
      els.ifeOverlay.classList.remove("hidden"); 
      els.ifeWelcome.classList.add("hidden"); 
      els.ifePanel.classList.remove("hidden"); 
      
      els.ifePanel.style.width = "min(1100px, 94vw)"; 
      els.ifePanel.style.maxHeight = "88vh"; 
      els.ifePanel.style.overflow = "auto"; 
    } 
  } else { 
    if (els.drawer) {
      els.drawer.style.display = "block"; 
    }
    if (els.selectedStrip) {
      els.selectedStrip.style.display = "flex"; 
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Flow & Setup Events */
/* -------------------------------------------------------------------------- */

function setupRadarTabs() {
  if (!els.tabFlightInfo || !els.tabGlass) return;
  
  const activate = (flightInfo) => {
    els.tabFlightInfo.classList.toggle("active", flightInfo);
    els.tabGlass.classList.toggle("active", !flightInfo);
    
    if (els.panelFlightInfo) els.panelFlightInfo.style.display = flightInfo ? "block" : "none";
    if (els.panelGlass) els.panelGlass.style.display = flightInfo ? "none" : "block";
  };
  
  els.tabFlightInfo.addEventListener("click", () => activate(true));
  els.tabGlass.addEventListener("click", () => activate(false));
  activate(true);
}

function setupEvents() {
  els.connectBtn?.addEventListener("click", () => { 
    state.sessionId = els.serverSelect?.value; 
    state.sessionName = els.serverSelect?.options[els.serverSelect.selectedIndex]?.text; 
    
    if(state.polling) {
      clearInterval(state.polling); 
    }
    pollFlights(); 
    state.polling = setInterval(pollFlights, POLL_MS); 
  });
  
  els.openRandomBtn?.addEventListener("click", () => { 
    const a = Array.from(state.aircraftMap.values()); 
    if(a.length) { 
      const f = a[Math.floor(Math.random()*a.length)].last; 
      state.viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(Number(f.longitude), Number(f.latitude), 250000), 
        duration: 1.3
      }); 
      selectFlight(f.flightId); 
    }
  });
  
  els.radarModeBtn?.addEventListener("click", () => { 
    state.mode = "radar"; 
    document.body.classList.remove("mode-ife"); 
    document.body.classList.add("mode-radar"); 
    els.ifeOverlay.classList.add("hidden"); 
  });
  
  els.ifeModeBtn?.addEventListener("click", () => { 
    state.mode = "ife"; 
    document.body.classList.add("mode-ife"); 
    document.body.classList.remove("mode-radar"); 
    
    if(state.selectedFlightId) { 
      if (!state.ifeStarted) { 
        els.ifeOverlay.classList.remove("hidden"); 
        els.ifeWelcome.classList.remove("hidden"); 
        els.ifePanel.classList.add("hidden"); 
      } else { 
        els.ifeOverlay.classList.remove("hidden"); 
        els.ifeWelcome.classList.add("hidden"); 
        els.ifePanel.classList.remove("hidden"); 
      } 
    } 
  });
  
  els.ifeStartBtn?.addEventListener("click", () => { 
    state.ifeStarted = true; 
    els.ifeWelcome.classList.add("hidden"); 
    els.ifePanel.classList.remove("hidden"); 
    els.ifePanel.style.width = "min(1100px, 94vw)"; 
    els.ifePanel.style.maxHeight = "88vh"; 
    els.ifePanel.style.overflow = "auto"; 
  });
  
  els.changeViewBtn?.addEventListener("click", () => { 
    state.ifeView = state.ifeView === "flightInfo" ? "glass" : "flightInfo"; 
    
    els.ifeFlightInfoView.classList.toggle("hidden", state.ifeView !== "flightInfo"); 
    els.ifeGlassView.classList.toggle("hidden", state.ifeView === "flightInfo"); 
    
    els.ifeTabFlightInfo.classList.toggle("active", state.ifeView === "flightInfo"); 
    els.ifeTabGlass.classList.toggle("active", state.ifeView !== "flightInfo"); 
  });
}

/* -------------------------------------------------------------------------- */
/* Bootstrap */
/* -------------------------------------------------------------------------- */

(async function bootstrap() {
  // Inject Dynamic CSS to ensure PFD backgrounds don't clip during rotation
  const style = document.createElement('style');
  style.innerHTML = `
    .pfd-face .sky, .pfd-face .ground { 
      height: 200% !important; 
      width: 200% !important; 
      left: -50% !important; 
    } 
    .pfd-face .sky { top: -100% !important; } 
    .pfd-face .ground { bottom: -100% !important; }
  `;
  document.head.appendChild(style);

  try {
    document.title = APP_NAME;
    
    initCesium();
    await applyGlobeStyle();
    
    setupRadarTabs();
    setupEvents();
    
    // Fetch sessions
    const sessions = await apiGet("/sessions");
    els.serverSelect.innerHTML = `<option value="">Select server</option>`;
    
    sessions.forEach(s => {
      els.serverSelect.innerHTML += `<option value="${s.id}">${s.name}</option>`;
    });
    
    setStatus("Ready.");
  } catch (e) { 
    setStatus(`Startup error: ${e.message}`, true); 
  }
})();
