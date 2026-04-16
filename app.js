const APP_NAME = "Infinite Tracker";
const DEFAULT_API_KEY = "tyy8znhl0u5kbbb2vuvdhfetmsil041u";
const CESIUM_ION_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiI3MDU4NWI1YS03ZGUxLTRmMzEtODEwZi01MDNlM2QyMTg5MzAiLCJpZCI6NDExNTkzLCJpYXQiOjE3NzQ5MjgxNjh9.NeKegq8BpQ4KqIs2hJWNgoEy2c0vidgNg869ldUVFew";
const API_BASE = "https://api.infiniteflight.com/public/v2";

const POLL_MS = 5000;
const TRAIL_LENGTH = 120;

/**
 * Hosted fallback icon (if generated vector fails for any reason)
 */
const HOSTED_PLANE_ICON_FALLBACK = "https://infinite-tracker.tech/plane.svg";

/**
 * Set to true if you want yellow debug points rendered with each aircraft.
 * Keep false for normal production look.
 */
const DEBUG_FORCE_POINTS = false;

/**
 * ---- App State ----
 */
const state = {
  apiKey: DEFAULT_API_KEY,
  sessionId: "",
  sessionName: "",

  mode: "radar", // "radar" | "ife"

  viewer: null,
  polling: null,

  // flightId -> { entity, sampledPosition, trailPositions[], lastFlightData }
  aircraftMap: new Map(),

  selectedFlightId: null,
  followSelected: false,

  labelsEnabled: true,
  boundariesEnabled: true,

  didInitialZoom: false,

  // IFE flow
  ifeStarted: false,
  ifeView: "flightInfo", // "flightInfo" | "glass"

  // icon assets
  generatedPlaneIconDataUrl: null
};

/**
 * ---- DOM Helper ----
 */
function byId(id) {
  return document.getElementById(id);
}

/**
 * ---- Element Registry ----
 */
const els = {
  // left panel
  controlShell: byId("controlShell"),
  serverSelect: byId("serverSelect"),
  connectBtn: byId("connectBtn"),
  refreshBtn: byId("refreshBtn"),
  openRandomBtn: byId("openRandomBtn"),
  status: byId("status"),

  // mode switches
  ifeModeBtn: byId("ifeModeBtn"),
  radarModeBtn: byId("radarModeBtn"),

  // top bar
  topMode: byId("topMode"),
  topServer: byId("topServer"),
  followBtn: byId("followBtn"),
  togglePanelBtn: byId("togglePanelBtn"),
  boundariesToggleBtn: byId("boundariesToggleBtn"),
  labelsToggleBtn: byId("labelsToggleBtn"),

  // radar drawer
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

  // selected bottom strip
  selectedStrip: byId("selectedStrip"),
  stripCallsign: byId("stripCallsign"),
  stripType: byId("stripType"),
  stripPilot: byId("stripPilot"),
  stripGs: byId("stripGs"),
  stripAlt: byId("stripAlt"),
  stripVs: byId("stripVs"),

  // radar HUD
  hudCard: byId("hudCard"),
  hudCallsign: byId("hudCallsign"),
  hudAlt: byId("hudAlt"),
  hudSpd: byId("hudSpd"),
  hudHdg: byId("hudHdg"),

  // radar glass block
  gcSpeedTape: byId("gcSpeedTape"),
  gcAltTape: byId("gcAltTape"),
  gcNeedle: byId("gcNeedle"),
  gcNDR: byId("gcNDR"),
  gcN1L: byId("gcN1L"),
  gcN1R: byId("gcN1R"),
  gcEgtL: byId("gcEgtL"),
  gcEgtR: byId("gcEgtR"),
  gcFpln: byId("gcFpln"),

  // IFE overlay
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

  // IFE glass block
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

/* ============================================================================
 * Utilities
 * ========================================================================== */

function setStatus(message, isError = false) {
  if (!els.status) return;
  els.status.textContent = message;
  els.status.style.color = isError ? "#ff9f9f" : "var(--warn)";
  console.log("[InfiniteTracker]", message);
}

function getApiHeaders() {
  return {
    Authorization: `Bearer ${state.apiKey}`,
    "Content-Type": "application/json"
  };
}

async function apiGet(path) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: getApiHeaders()
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const payload = await response.json();
  if (payload.errorCode !== 0) {
    throw new Error(`API errorCode=${payload.errorCode}`);
  }

  return payload.result;
}

function makePlaneIconDataUrl(color = "#ffffff") {
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="72" height="72" viewBox="0 0 72 72">
  <g fill="${color}" stroke="#0b0f18" stroke-width="2.2" stroke-linejoin="round">
    <path d="M34 4h4l4 21 18 9v5l-20-3-2 10 7 6v4l-9-3-9 3v-4l7-6-2-10-20 3v-5l18-9z"/>
  </g>
</svg>`;
  return "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(svg);
}

function getAircraftBillboardImage() {
  return state.generatedPlaneIconDataUrl || HOSTED_PLANE_ICON_FALLBACK;
}

function fmtNum(value, digits = 0) {
  if (!Number.isFinite(value)) return "-";
  return Number(value).toFixed(digits);
}

/* ============================================================================
 * Cesium setup and globe style
 * ========================================================================== */

function initCesiumViewer() {
  if (!window.Cesium) {
    throw new Error("Cesium not loaded");
  }

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

  // click pick handler
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

  const baseImageryLayer = await Cesium.ImageryLayer.fromProviderAsync(
    Cesium.createWorldImageryAsync({ style })
  );

  state.viewer.imageryLayers.removeAll();
  state.viewer.imageryLayers.add(baseImageryLayer);

  state.viewer.scene.globe.showGroundAtmosphere = !!state.boundariesEnabled;
  state.viewer.scene.globe.enableLighting = true;
  state.viewer.scene.skyAtmosphere.show = true;
  state.viewer.scene.fog.enabled = true;
}

/* ============================================================================
 * Session and mode control
 * ========================================================================== */

async function loadSessions() {
  setStatus("Loading sessions...");
  const sessions = await apiGet("/sessions");

  els.serverSelect.innerHTML = `<option value="">Select server</option>`;

  sessions.forEach((s) => {
    const option = document.createElement("option");
    option.value = s.id;
    option.dataset.serverName = s.name;
    option.textContent = `${s.name} (${s.userCount}/${s.maxUsers})`;
    els.serverSelect.appendChild(option);
  });

  setStatus(`Loaded ${sessions.length} sessions`);
}

function setMode(mode) {
  state.mode = mode;

  document.body.classList.toggle("mode-ife", mode === "ife");
  document.body.classList.toggle("mode-radar", mode === "radar");

  els.ifeModeBtn?.classList.toggle("active", mode === "ife");
  els.radarModeBtn?.classList.toggle("active", mode === "radar");

  if (els.topMode) {
    els.topMode.textContent = mode === "ife" ? "IFE Mode" : "Radar Mode";
  }

  if (mode === "ife") {
    if (state.selectedFlightId) {
      showIFEWelcome();
    }
  } else {
    hideIFE();
  }
}

/* ============================================================================
 * Aircraft entities and tracking
 * ========================================================================== */

function createAircraftEntity(flight, positionProperty, sampledPosition) {
  return state.viewer.entities.add({
    id: flight.flightId,
    position: sampledPosition,
    billboard: {
      image: getAircraftBillboardImage(),
      show: true,
      width: 34,
      height: 34,
      rotation: Cesium.Math.toRadians((flight.heading || 0) - 90),
      verticalOrigin: Cesium.VerticalOrigin.CENTER,
      horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
      disableDepthTestDistance: Number.POSITIVE_INFINITY
    },
    point: {
      show: DEBUG_FORCE_POINTS,
      pixelSize: 8,
      color: Cesium.Color.YELLOW,
      outlineColor: Cesium.Color.BLACK,
      outlineWidth: 2,
      disableDepthTestDistance: Number.POSITIVE_INFINITY
    },
    polyline: {
      positions: [positionProperty],
      width: 2,
      material: Cesium.Color.fromCssColorString("#7ec8ff").withAlpha(0.35)
    }
  });
}

function upsertAircraft(flight) {
  const now = Cesium.JulianDate.now();

  const altitudeMeters = Math.max(0, (Number(flight.altitude) || 0) * 0.3048);
  const worldPosition = Cesium.Cartesian3.fromDegrees(
    Number(flight.longitude),
    Number(flight.latitude),
    altitudeMeters
  );

  let record = state.aircraftMap.get(flight.flightId);

  if (!record) {
    const sampledPosition = new Cesium.SampledPositionProperty();
    sampledPosition.setInterpolationOptions({
      interpolationDegree: 1,
      interpolationAlgorithm: Cesium.LinearApproximation
    });
    sampledPosition.addSample(now, worldPosition);

    const entity = createAircraftEntity(flight, worldPosition, sampledPosition);

    record = {
      entity,
      sampledPosition,
      trailPositions: [worldPosition],
      lastFlightData: flight
    };

    state.aircraftMap.set(flight.flightId, record);
  } else {
    record.sampledPosition.addSample(now, worldPosition);

    record.trailPositions.push(worldPosition);
    if (record.trailPositions.length > TRAIL_LENGTH) {
      record.trailPositions.shift();
    }

    record.entity.polyline.positions = record.trailPositions;
    record.entity.billboard.rotation = Cesium.Math.toRadians((flight.heading || 0) - 90);

    record.lastFlightData = flight;
  }
}

function removeMissingAircraft(activeFlightIds) {
  for (const [flightId, record] of state.aircraftMap.entries()) {
    if (!activeFlightIds.has(flightId)) {
      state.viewer.entities.remove(record.entity);
      state.aircraftMap.delete(flightId);

      if (state.selectedFlightId === flightId) {
        state.selectedFlightId = null;
      }
    }
  }
}

function updateSelectedEntityStyle() {
  for (const [flightId, record] of state.aircraftMap.entries()) {
    const isSelected = flightId === state.selectedFlightId;
    record.entity.billboard.scale = isSelected ? 1.25 : 1.0;
    record.entity.polyline.width = isSelected ? 3 : 2;
  }
}

function selectFlight(flightId) {
  state.selectedFlightId = flightId;
  updateSelectedEntityStyle();
  updateAllPanelsFromSelected();

  if (state.mode === "ife") {
    showIFEWelcome();
  } else {
    if (els.drawer) els.drawer.style.display = "block";
    if (els.selectedStrip) els.selectedStrip.style.display = "flex";
  }
}

function openRandomAircraft() {
  const records = Array.from(state.aircraftMap.values());
  if (!records.length) {
    setStatus("No aircraft loaded yet", true);
    return;
  }

  const randomRecord = records[Math.floor(Math.random() * records.length)];
  const flight = randomRecord.lastFlightData;

  state.viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(
      Number(flight.longitude),
      Number(flight.latitude),
      250000
    ),
    duration: 1.3
  });

  selectFlight(flight.flightId);
}

function updateFollowCamera() {
  if (!state.followSelected || !state.selectedFlightId) return;

  const selectedRecord = state.aircraftMap.get(state.selectedFlightId);
  if (selectedRecord) {
    state.viewer.trackedEntity = selectedRecord.entity;
  }
}

/* ============================================================================
 * UI updates (Radar + IFE panels)
 * ========================================================================== */

function updateHud(flight) {
  if (!flight) {
    els.hudCallsign.textContent = "-";
    els.hudAlt.textContent = "- ft";
    els.hudSpd.textContent = "- kts";
    els.hudHdg.textContent = "-°";
    return;
  }

  els.hudCallsign.textContent = flight.callsign || "-";
  els.hudAlt.textContent = `${Math.round(flight.altitude || 0)} ft`;
  els.hudSpd.textContent = `${Math.round(flight.speed || 0)} kts`;
  els.hudHdg.textContent = `${Math.round(flight.heading || 0)}°`;
}

/**
 * Updates a glass block set by prefix:
 * Example prefixes:
 *   radar: gc -> gcSpeedTape, gcAltTape, ...
 *   ife:   ifeGc -> ifeGcSpeed, ifeGcAlt, ...
 */
function updateGlassBlock(prefix, flight) {
  const speed = Math.round(flight?.speed || 0);
  const altitude = Math.round(flight?.altitude || 0);
  const heading = Math.round(flight?.heading || 0);
  const vs = Math.round(flight?.verticalSpeed || 0);

  const speedEl = byId(`${prefix}Speed`) || byId(`${prefix}SpeedTape`);
  const altEl = byId(`${prefix}Alt`) || byId(`${prefix}AltTape`);
  const ndrEl = byId(`${prefix}Ndr`) || byId(`${prefix}NDR`);
  const needleEl = byId(`${prefix}Needle`);

  const n1lEl = byId(`${prefix}N1L`);
  const n1rEl = byId(`${prefix}N1R`);
  const egtLEl = byId(`${prefix}EgtL`);
  const egtREl = byId(`${prefix}EgtR`);
  const fplnEl = byId(`${prefix}Fpln`) || byId(`${prefix}FPLN`);

  if (speedEl) speedEl.textContent = `GS ${speed}`;
  if (altEl) altEl.textContent = `ALT ${altitude}`;
  if (ndrEl) ndrEl.textContent = `HDG ${String(heading).padStart(3, "0")}`;
  if (needleEl) needleEl.style.transform = `translate(-50%, -100%) rotate(${heading}deg)`;

  const n1 = Math.max(20, Math.min(106, speed / 5 + 20));
  if (n1lEl) n1lEl.textContent = n1.toFixed(1);
  if (n1rEl) n1rEl.textContent = n1.toFixed(1);

  const egtPercent = Math.max(18, Math.min(95, Math.abs(vs) / 40 + 35));
  if (egtLEl) egtLEl.style.height = `${egtPercent}%`;
  if (egtREl) egtREl.style.height = `${egtPercent}%`;

  if (fplnEl) {
    fplnEl.innerHTML = `
      <div>CALLSIGN ${flight?.callsign || "-"}</div>
      <div>HDG ${heading} • GS ${speed} • ALT ${altitude}</div>
      <div>V/S ${vs} fpm</div>
      <div>LIVE TRACK</div>
    `;
  }
}

function updateAllPanelsFromSelected() {
  const record = state.selectedFlightId
    ? state.aircraftMap.get(state.selectedFlightId)
    : null;

  const flight = record?.lastFlightData;

  if (!flight) {
    updateHud(null);
    return;
  }

  // Radar drawer info
  els.fiCallsign.textContent = flight.callsign || "-";
  els.fiUser.textContent = flight.username || "-";
  els.fiAlt.textContent = `${Math.round(flight.altitude || 0)} ft`;
  els.fiSpd.textContent = `${Math.round(flight.speed || 0)} kts`;
  els.fiHdg.textContent = `${Math.round(flight.heading || 0)}°`;
  els.fiVs.textContent = `${Math.round(flight.verticalSpeed || 0)} fpm`;
  els.fiLat.textContent = fmtNum(flight.latitude, 4);
  els.fiLon.textContent = fmtNum(flight.longitude, 4);

  // bottom strip
  els.stripCallsign.textContent = flight.callsign || "-";
  els.stripType.textContent = "Infinite Flight Aircraft";
  els.stripPilot.textContent = flight.username || "-";
  els.stripGs.textContent = `${Math.round(flight.speed || 0)} kts`;
  els.stripAlt.textContent = `${Math.round(flight.altitude || 0)} ft`;
  els.stripVs.textContent = `${Math.round(flight.verticalSpeed || 0)} fpm`;

  // radar hud + radar glass
  updateHud(flight);
  updateGlassBlock("gc", flight);

  // IFE info
  els.ifeTitle.textContent = flight.callsign || "--";
  els.ifeSub.textContent = `${flight.username || "-"} • Live`;
  els.welcomeCallsign.textContent = flight.callsign || "--";

  els.ifeSpd.textContent = `${Math.round(flight.speed || 0)} kts`;
  els.ifeAlt.textContent = `${Math.round(flight.altitude || 0)} ft`;
  els.ifeHdg.textContent = `${Math.round(flight.heading || 0)}°`;
  els.ifeVs.textContent = `${Math.round(flight.verticalSpeed || 0)} fpm`;

  // placeholders for dep/arr/route until route endpoint wired
  if (els.ifeDep && els.ifeDep.textContent === "----") els.ifeDep.textContent = "DEP";
  if (els.ifeArr && els.ifeArr.textContent === "----") els.ifeArr.textContent = "ARR";
  if (els.ifeRoute && els.ifeRoute.textContent.includes("unavailable")) {
    els.ifeRoute.textContent = "LIVE ROUTE: route data can be wired here from additional IF endpoints.";
  }

  updateGlassBlock("ifeGc", flight);
}

/* ============================================================================
 * IFE flow
 * ========================================================================== */

function showIFEWelcome() {
  if (!els.ifeOverlay || !els.ifeWelcome || !els.ifePanel) return;
  els.ifeOverlay.classList.remove("hidden");
  els.ifeWelcome.classList.remove("hidden");
  els.ifePanel.classList.add("hidden");
  state.ifeStarted = false;
}

function showIFEPanel() {
  if (!els.ifeOverlay || !els.ifeWelcome || !els.ifePanel) return;
  els.ifeOverlay.classList.remove("hidden");
  els.ifeWelcome.classList.add("hidden");
  els.ifePanel.classList.remove("hidden");
  state.ifeStarted = true;
}

function hideIFE() {
  if (!els.ifeOverlay) return;
  els.ifeOverlay.classList.add("hidden");
}

function setIFEView(view) {
  state.ifeView = view;
  const isFlightInfo = view === "flightInfo";

  els.ifeTabFlightInfo?.classList.toggle("active", isFlightInfo);
  els.ifeTabGlass?.classList.toggle("active", !isFlightInfo);

  els.ifeFlightInfoView?.classList.toggle("hidden", !isFlightInfo);
  els.ifeGlassView?.classList.toggle("hidden", isFlightInfo);
}

/* ============================================================================
 * Polling lifecycle
 * ========================================================================== */

async function pollFlights() {
  if (!state.sessionId) return;

  try {
    const flights = await apiGet(`/sessions/${state.sessionId}/flights`);
    const activeIds = new Set();

    flights.forEach((f) => {
      activeIds.add(f.flightId);
      upsertAircraft(f);
    });

    removeMissingAircraft(activeIds);

    if (!state.didInitialZoom && flights.length > 0) {
      const random = flights[Math.floor(Math.random() * flights.length)];
      state.viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(
          Number(random.longitude),
          Number(random.latitude),
          2500000
        ),
        duration: 1.2
      });
      state.didInitialZoom = true;
    }

    if (state.selectedFlightId) {
      updateAllPanelsFromSelected();
    }

    updateFollowCamera();
    setStatus(`Tracking ${flights.length} flights on ${state.sessionName || "server"}`);
  } catch (error) {
    setStatus(`Polling error: ${error.message}`, true);
  }
}

function startPolling() {
  if (state.polling) {
    clearInterval(state.polling);
  }

  pollFlights();
  state.polling = setInterval(pollFlights, POLL_MS);
}

function clearAllAircraft() {
  for (const record of state.aircraftMap.values()) {
    state.viewer.entities.remove(record.entity);
  }
  state.aircraftMap.clear();

  state.selectedFlightId = null;
  state.viewer.trackedEntity = undefined;
  state.didInitialZoom = false;
}

function connectToSelectedServer() {
  state.apiKey = (DEFAULT_API_KEY || "").trim();
  if (!state.apiKey || state.apiKey.startsWith("PASTE_")) {
    setStatus("Set API key in app.js", true);
    return;
  }

  state.sessionId = els.serverSelect?.value || "";

  const selectedOption =
    els.serverSelect?.options?.[els.serverSelect.selectedIndex];
  state.sessionName =
    selectedOption?.dataset?.serverName ||
    selectedOption?.textContent ||
    "";

  if (!state.sessionId) {
    setStatus("Please select a server", true);
    return;
  }

  clearAllAircraft();
  if (els.topServer) {
    els.topServer.textContent = state.sessionName || "Unknown server";
  }

  startPolling();
}

/* ============================================================================
 * Tabs and events
 * ========================================================================== */

function setupRadarDrawerTabs() {
  if (!els.tabFlightInfo || !els.tabGlass) return;

  const setRadarTab = (isFlightInfo) => {
    els.tabFlightInfo.classList.toggle("active", isFlightInfo);
    els.tabGlass.classList.toggle("active", !isFlightInfo);

    if (els.panelFlightInfo) {
      els.panelFlightInfo.style.display = isFlightInfo ? "block" : "none";
    }
    if (els.panelGlass) {
      els.panelGlass.style.display = isFlightInfo ? "none" : "block";
    }
  };

  els.tabFlightInfo.addEventListener("click", () => setRadarTab(true));
  els.tabGlass.addEventListener("click", () => setRadarTab(false));

  setRadarTab(true);
}

function setupEventHandlers() {
  els.connectBtn?.addEventListener("click", connectToSelectedServer);

  els.refreshBtn?.addEventListener("click", () => {
    loadSessions().catch((error) => {
      setStatus(`Refresh error: ${error.message}`, true);
    });
  });

  els.openRandomBtn?.addEventListener("click", openRandomAircraft);

  els.ifeModeBtn?.addEventListener("click", () => setMode("ife"));
  els.radarModeBtn?.addEventListener("click", () => setMode("radar"));

  els.togglePanelBtn?.addEventListener("click", () => {
    if (!els.controlShell) return;
    const hidden = els.controlShell.classList.toggle("hidden");
    els.togglePanelBtn.textContent = hidden ? "Show Panel" : "Hide Panel";
  });

  els.followBtn?.addEventListener("click", () => {
    state.followSelected = !state.followSelected;
    els.followBtn.classList.toggle("active", state.followSelected);

    if (!state.followSelected) {
      state.viewer.trackedEntity = undefined;
    } else {
      updateFollowCamera();
    }
  });

  els.labelsToggleBtn?.addEventListener("click", async () => {
    state.labelsEnabled = !state.labelsEnabled;
    els.labelsToggleBtn.textContent = `Map Labels: ${state.labelsEnabled ? "ON" : "OFF"}`;
    await applyGlobeStyle();
  });

  els.boundariesToggleBtn?.addEventListener("click", async () => {
    state.boundariesEnabled = !state.boundariesEnabled;
    els.boundariesToggleBtn.textContent = `Boundaries: ${state.boundariesEnabled ? "ON" : "OFF"}`;
    await applyGlobeStyle();
  });

  els.ifeStartBtn?.addEventListener("click", showIFEPanel);
  els.ifeCloseBtn?.addEventListener("click", hideIFE);

  els.changeViewBtn?.addEventListener("click", () => {
    setIFEView(state.ifeView === "flightInfo" ? "glass" : "flightInfo");
  });

  els.ifeTabFlightInfo?.addEventListener("click", () => setIFEView("flightInfo"));
  els.ifeTabGlass?.addEventListener("click", () => setIFEView("glass"));

  els.drawerCloseBtn?.addEventListener("click", () => {
    if (els.drawer) els.drawer.style.display = "none";
    if (els.selectedStrip) els.selectedStrip.style.display = "none";
    state.selectedFlightId = null;
    updateSelectedEntityStyle();
  });
}

/* ============================================================================
 * Bootstrap
 * ========================================================================== */

(async function bootstrap() {
  try {
    document.title = APP_NAME;

    // Generate robust primary icon
    state.generatedPlaneIconDataUrl = makePlaneIconDataUrl("#ffffff");

    initCesiumViewer();
    await applyGlobeStyle();

    setupRadarDrawerTabs();
    setupEventHandlers();

    setIFEView("flightInfo");
    setMode("radar");

    await loadSessions();

    setStatus("Ready. Select server and connect.");
  } catch (error) {
    console.error(error);
    setStatus(`Startup error: ${error.message}`, true);
  }
})();
