/*
 * GEO/LAB — a self-contained 3D GeoJSON playground.
 *
 * MapLibre renders the dark basemap, deck.gl renders the data. Both libraries
 * are loaded lazily: deck.gl and the 700 KB footprint dataset only arrive when
 * the playground approaches the viewport.
 *
 * Everything the visitor can play with ships with the page:
 *   · 2,503 real building footprints around Mannheim's Innenstadt (OSM, ODbL)
 *   · 24 synthetic mobility corridors (regenerated on shuffle)
 *   · 320 synthetic heat sensors (regenerated on shuffle)
 */
(function () {
    "use strict";

    const $ = (s, c) => (c || document).querySelector(s);
    const $$ = (s, c) => Array.from((c || document).querySelectorAll(s));
    const lab = $("#lab");
    if (!lab) return;

    const RM = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const DESKTOP = () => innerWidth > 860;
    const DECK_URL = "https://unpkg.com/deck.gl@9.0.35/dist.min.js";
    const BUILDINGS_URL = "assets/data/mannheim-buildings.geojson";

    const CENTER = [8.4740, 49.4853];
    const MOBILE_CENTER = [8.4759, 49.4859];
    const BBOX = { west: 8.4615, south: 49.4805, east: 8.4835, north: 49.4935 };
    const CYCLE = 240;
    const PHASE = 80;

    const LANDMARKS = [
        { name: "Wasserturm", pos: [8.47340, 49.48486] },
        { name: "Kunsthalle", pos: [8.47520, 49.48276] },
        { name: "Rosengarten", pos: [8.47743, 49.48503] },
        { name: "Nationaltheater", pos: [8.47760, 49.48833] },
        { name: "Christuskirche", pos: [8.48075, 49.48465] },
        { name: "Konkordien", pos: [8.46892, 49.48885] },
        { name: "Schloss", pos: [8.46355, 49.48497] },
        { name: "Rathaus", pos: [8.46280, 49.48953] },
        { name: "Universität", pos: [8.46510, 49.48248] },
        { name: "Musikhochschule", pos: [8.47078, 49.48385] }
    ];

    const PALETTES = {
        mint: {
            label: "MINT",
            accent: "#4DEFC0",
            building: [[3, 15, 12], [8, 52, 42], [28, 158, 121], [255, 220, 145]],
            route: [[63, 224, 175], [143, 255, 224], [255, 210, 110], [90, 200, 255]],
            heat: [[4, 18, 15, 0], [8, 63, 50, 110], [18, 122, 95, 185], [45, 190, 150, 225], [120, 255, 220, 240], [225, 255, 247, 255]],
            hex: [[6, 40, 34], [10, 90, 72], [24, 160, 120], [80, 220, 170], [180, 255, 220], [255, 228, 150]],
            specular: [110, 240, 208]
        },
        magma: {
            label: "MAGMA",
            accent: "#FF7C9E",
            building: [[22, 6, 30], [88, 14, 58], [198, 38, 96], [255, 215, 140]],
            route: [[255, 72, 118], [255, 150, 90], [255, 220, 130], [210, 110, 255]],
            heat: [[20, 4, 24, 0], [70, 10, 40, 120], [150, 20, 86, 190], [230, 60, 100, 220], [255, 150, 120, 240], [255, 236, 200, 255]],
            hex: [[30, 8, 38], [90, 14, 60], [170, 24, 80], [240, 60, 90], [255, 150, 90], [255, 238, 170]],
            specular: [255, 150, 170]
        },
        ice: {
            label: "ICE",
            accent: "#6DD9FF",
            building: [[4, 14, 38], [14, 55, 120], [48, 145, 235], [185, 246, 255]],
            route: [[74, 191, 255], [150, 240, 255], [215, 250, 255], [130, 160, 255]],
            heat: [[3, 10, 30, 0], [7, 36, 80, 110], [18, 84, 160, 180], [40, 150, 230, 220], [120, 220, 255, 240], [225, 250, 255, 255]],
            hex: [[5, 20, 50], [10, 60, 120], [25, 110, 200], [70, 180, 240], [160, 230, 255], [245, 255, 255]],
            specular: [150, 220, 255]
        },
        solar: {
            label: "SOLAR",
            accent: "#FFC24A",
            building: [[28, 17, 4], [100, 50, 10], [205, 105, 20], [255, 235, 160]],
            route: [[255, 184, 64], [255, 124, 32], [255, 228, 140], [255, 90, 60]],
            heat: [[20, 10, 2, 0], [60, 30, 5, 110], [130, 60, 10, 180], [210, 120, 20, 220], [255, 190, 60, 240], [255, 245, 200, 255]],
            hex: [[40, 22, 4], [110, 55, 10], [190, 90, 15], [235, 140, 30], [255, 195, 70], [255, 245, 200]],
            specular: [255, 210, 130]
        }
    };

    const SCENES = {
        city: {
            label: "Skyline",
            paramLabel: "ELEVATION SCALE",
            min: 0.4, max: 2.2, step: 0.05,
            format: v => v.toFixed(2) + "×",
            zoom: 14.82, pitch: 57, bearing: -23
        },
        flow: {
            label: "Flow",
            paramLabel: "TRAIL LENGTH",
            min: 0.35, max: 1.6, step: 0.05,
            format: v => v.toFixed(2) + "×",
            zoom: 14.42, pitch: 50, bearing: -10
        },
        heat: {
            label: "Heat",
            paramLabel: "HEX RADIUS",
            min: 32, max: 150, step: 4,
            format: v => Math.round(v) + " M",
            zoom: 14.18, pitch: 39, bearing: -5
        }
    };

    const state = {
        booted: false,
        ready: false,
        map: null,
        deck: null,
        overlay: null,
        buildings: null,
        trips: [],
        arcs: [],
        sensors: [],
        maxHeight: 95,
        cityJitter: null,
        jitterMax: 1,
        scene: "city",
        palette: "mint",
        params: { city: 1, flow: 0.9, heat: 68 },
        sceneLayers: [],
        routeCount: 24,
        sensorSeed: 11,
        flowSeed: 7,
        flowTime: 0,
        orbit: false,
        orbitBearing: 0,
        flying: false,
        raf: 0,
        lastFrame: 0,
        lastTrip: 0,
        renderTimer: 0,
        resizeTimer: 0,
        shuffleTimer: 0,
        visible: true,
        basemap: "openfreemap",
        watchdog: 0,
        failed: false
    };

    /* --------------------------------------------------------------------- */
    /* utilities                                                             */
    /* --------------------------------------------------------------------- */

    const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

    function mulberry32(seed) {
        let a = seed >>> 0;
        return function () {
            a |= 0;
            a = (a + 0x6D2B79F5) | 0;
            let t = Math.imul(a ^ (a >>> 15), 1 | a);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    function mix(a, b, t) {
        return [
            Math.round(a[0] + (b[0] - a[0]) * t),
            Math.round(a[1] + (b[1] - a[1]) * t),
            Math.round(a[2] + (b[2] - a[2]) * t)
        ];
    }

    function ramp(stops, t) {
        const n = stops.length - 1;
        if (n <= 0) return stops[0].slice();
        t = clamp(t, 0, 1) * n;
        const i = Math.min(Math.floor(t), n - 1);
        return mix(stops[i], stops[i + 1], t - i);
    }

    const rgb = c => `rgb(${c[0]},${c[1]},${c[2]})`;

    function esc(value) {
        return String(value == null ? "" : value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    }

    const fmtInt = n => Math.round(n).toLocaleString("en-US");

    function gaussian(rng) {
        let u = 0, v = 0;
        while (!u) u = rng();
        while (!v) v = rng();
        return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    }

    function debounceRender() {
        clearTimeout(state.renderTimer);
        state.renderTimer = setTimeout(() => {
            updateLegend();
            renderScene();
        }, 45);
    }

    /* --------------------------------------------------------------------- */
    /* data                                                                  */
    /* --------------------------------------------------------------------- */

    async function loadBuildings() {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 12000);
        try {
            const res = await fetch(BUILDINGS_URL, { cache: "default", signal: controller.signal });
            clearTimeout(timer);
            if (!res.ok) throw new Error("HTTP " + res.status);
            const data = await res.json();
            const features = (data.features || []).filter(f =>
                f && f.geometry && f.geometry.type === "Polygon" &&
                Array.isArray(f.geometry.coordinates) && f.geometry.coordinates[0] &&
                f.geometry.coordinates[0].length > 3
            );
            if (!features.length) throw new Error("empty dataset");
            return { type: "FeatureCollection", features };
        } catch (err) {
            clearTimeout(timer);
            console.warn("GEO/LAB · footprint dataset unavailable, using procedural city", err);
            return proceduralCity();
        }
    }

    function proceduralCity() {
        const rng = mulberry32(1979);
        const features = [];
        for (let gx = -6; gx <= 6; gx++) {
            for (let gy = -5; gy <= 5; gy++) {
                if (rng() < 0.12) continue;
                const lng = CENTER[0] + gx * 0.00112 + (gy % 2 ? 0.00018 : 0);
                const lat = CENTER[1] + gy * 0.00092;
                const w = 0.00040 + rng() * 0.00020;
                const h = 0.00033 + rng() * 0.00017;
                features.push({
                    type: "Feature",
                    properties: { height: Math.round(8 + rng() * 34), kind: "other" },
                    geometry: {
                        type: "Polygon",
                        coordinates: [[
                            [lng - w, lat - h], [lng + w, lat - h],
                            [lng + w, lat + h], [lng - w, lat + h],
                            [lng - w, lat - h]
                        ]]
                    }
                });
            }
        }
        return { type: "FeatureCollection", features };
    }

    function makeSensors(seed) {
        const rng = mulberry32(seed * 104729 + 7);
        const hotspots = [
            { p: [8.4742, 49.4847], r: 0.0022, w: 1.45 },
            { p: [8.4684, 49.4887], r: 0.0020, w: 1.15 },
            { p: [8.4776, 49.4879], r: 0.0018, w: 0.95 },
            { p: [8.4632, 49.4850], r: 0.0022, w: 0.80 },
            { p: [8.4800, 49.4848], r: 0.0016, w: 0.70 },
            { p: [8.4705, 49.4820], r: 0.0018, w: 0.85 },
            { p: [8.4745, 49.4905], r: 0.0020, w: 0.75 },
            { p: [8.4660, 49.4815], r: 0.0016, w: 0.60 }
        ];
        const totalW = hotspots.reduce((sum, h) => sum + h.w, 0);
        const sensors = [];
        for (let i = 0; i < 320; i++) {
            let pick = rng() * totalW;
            let spot = hotspots[0];
            for (const h of hotspots) {
                pick -= h.w;
                if (pick <= 0) { spot = h; break; }
            }
            let lng = spot.p[0] + gaussian(rng) * spot.r;
            let lat = spot.p[1] + gaussian(rng) * spot.r * 0.78;
            if (rng() > 0.82) {
                lng = BBOX.west + rng() * (BBOX.east - BBOX.west);
                lat = BBOX.south + rng() * (BBOX.north - BBOX.south);
            }
            lng = clamp(lng, BBOX.west, BBOX.east);
            lat = clamp(lat, BBOX.south, BBOX.north);

            let value = 23.1;
            for (const h of hotspots) {
                const dx = (lng - h.p[0]) * Math.cos(lat * Math.PI / 180);
                const dy = lat - h.p[1];
                const d2 = (dx * dx + dy * dy) / (h.r * h.r);
                value += h.w * 7.4 * Math.exp(-d2 * 1.55);
            }
            value += (rng() - 0.5) * 2.6;

            sensors.push({
                type: "Feature",
                properties: {
                    sensor: "S-" + String(i + 1).padStart(3, "0"),
                    value: Math.round(clamp(value, 20.4, 39.8) * 10) / 10
                },
                geometry: { type: "Point", coordinates: [lng, lat] }
            });
        }
        return sensors;
    }

    function curvedPath(a, b, curve, rng) {
        const segments = 34;
        const mx = (a[0] + b[0]) / 2;
        const my = (a[1] + b[1]) / 2;
        const dx = b[0] - a[0];
        const dy = b[1] - a[1];
        const len = Math.hypot(dx, dy) || 1;
        const nx = -dy / len;
        const ny = dx / len;
        const cx = mx + nx * curve;
        const cy = my + ny * curve;
        const zBase = 50 + rng() * 26;
        const zAmp = 46 + rng() * 70;
        const pts = [];
        for (let i = 0; i <= segments; i++) {
            const t = i / segments;
            const mt = 1 - t;
            pts.push([
                mt * mt * a[0] + 2 * mt * t * cx + t * t * b[0],
                mt * mt * a[1] + 2 * mt * t * cy + t * t * b[1],
                zBase + Math.sin(Math.PI * t) * zAmp
            ]);
        }
        return pts;
    }

    function makeTrips(seed) {
        const rng = mulberry32(seed * 7919 + 13);
        const trips = [];
        const n = LANDMARKS.length;
        for (let i = 0; i < state.routeCount; i++) {
            let ai = Math.floor(rng() * n);
            let bi = Math.floor(rng() * n);
            if (ai === bi) bi = (bi + 1 + Math.floor(rng() * (n - 1))) % n;
            const a = LANDMARKS[ai];
            const b = LANDMARKS[bi];
            const curve = (rng() - 0.5) * 0.0038;
            const path = curvedPath(a.pos, b.pos, curve, rng);
            const tone = rng();
            const value = Math.round(120 + rng() * 820);
            const name = a.name + " → " + b.name;
            for (let phase = 0; phase < 3; phase++) {
                const offset = phase * PHASE;
                const timestamps = path.map((_, k) => offset + (k / (path.length - 1)) * PHASE);
                trips.push({ name, path, timestamps, tone, value, route: i, phase });
            }
        }
        return trips;
    }

    /* --------------------------------------------------------------------- */
    /* lazy boot                                                             */
    /* --------------------------------------------------------------------- */

    let deckPromise = null;
    let buildingsPromise = null;

    function ensureBuildings() {
        if (!buildingsPromise) buildingsPromise = loadBuildings();
        return buildingsPromise;
    }

    function prefetchPlayground() {
        if (state.booted) return;
        try {
            if (navigator.connection && navigator.connection.saveData) return;
            if (matchMedia("(prefers-reduced-data: reduce)").matches) return;
        } catch (err) { /* optional hints */ }
        ensureDeck().catch(() => { });
        ensureBuildings();
    }

    function ensureDeck() {
        if (window.deck) return Promise.resolve(window.deck);
        if (deckPromise) return deckPromise;
        deckPromise = new Promise((resolve, reject) => {
            let settled = false;
            const finish = (fn, arg) => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                fn(arg);
            };
            const timer = setTimeout(() => finish(reject, new Error("deck.gl timed out")), 16000);
            const script = document.createElement("script");
            script.src = DECK_URL;
            script.async = true;
            script.crossOrigin = "anonymous";
            script.onload = () => {
                if (window.deck) finish(resolve, window.deck);
                else finish(reject, new Error("deck.gl global missing"));
            };
            script.onerror = () => finish(reject, new Error("deck.gl could not be loaded"));
            document.head.appendChild(script);
        });
        return deckPromise;
    }

    function boot() {
        if (state.booted) return;
        state.booted = true;
        initLab().catch(err => {
            console.error("GEO/LAB · unexpected boot failure", err);
            labFail("The 3D playground could not start. Check the connection and reload the page.");
        });
    }

    if (document.readyState === "complete") {
        setTimeout(prefetchPlayground, 1600);
    } else {
        addEventListener("load", () => setTimeout(prefetchPlayground, 1600), { once: true });
    }

    const bootObserver = new IntersectionObserver(entries => {
        if (entries.some(entry => entry.isIntersecting)) {
            bootObserver.disconnect();
            boot();
        }
    }, { rootMargin: "760px 0px" });
    bootObserver.observe(lab);

    new IntersectionObserver(entries => {
        state.visible = entries.some(entry => entry.isIntersecting);
        if (state.ready) syncLoop();
    }, { threshold: 0.02 }).observe(lab);

    /* --------------------------------------------------------------------- */
    /* map                                                                   */
    /* --------------------------------------------------------------------- */

    const BASEMAP_STYLE_URL = "https://tiles.openfreemap.org/styles/dark";

    function tintBaseStyle(style) {
        const layers = style && style.layers;
        if (!Array.isArray(layers)) return style;
        const set = (id, key, value) => {
            const layer = layers.find(l => l.id === id);
            if (!layer) return;
            layer.paint = layer.paint || {};
            layer.paint[key] = value;
        };

        /* ground + water */
        set("background", "background-color", "#05140f");
        set("water", "fill-color", "#071e19");
        set("waterway", "line-color", "#0a2a22");
        set("water_name", "text-color", "#4e8374");
        set("water_name", "text-halo-color", "#04130f");

        /* parks + woods */
        set("landcover_wood", "fill-color", "#081d15");
        const wood = layers.find(l => l.id === "landcover_wood");
        if (wood && wood.paint) delete wood.paint["fill-pattern"];
        set("landuse_park", "fill-color", "#0a2118");
        set("landuse_residential", "fill-color", "#071711");

        /* context buildings (the 3D data sits on top of these) */
        set("building", "fill-color", "#071a13");
        set("building", "fill-outline-color", "#0c271e");

        /* road network — faint mint infrastructure */
        set("highway_motorway_casing", "line-color", "rgba(55, 205, 165, .18)");
        set("highway_motorway_inner", "line-color", "#0d241c");
        set("highway_major_casing", "line-color", "rgba(55, 205, 165, .14)");
        set("highway_major_inner", "line-color", "#0c2119");
        set("highway_major_subtle", "line-color", "#0a1d16");
        set("highway_motorway_subtle", "line-color", "#0a1d16");
        set("highway_minor", "line-color", "#0a1b14");
        set("highway_path", "line-color", "#0b221a");
        set("road_pier", "line-color", "#071a14");
        set("road_area_pier", "fill-color", "#071a14");

        /* rails */
        ["railway_transit", "railway_minor", "railway"].forEach(id => set(id, "line-color", "#10271f"));
        ["railway_transit_dashline", "railway_minor_dashline", "railway_dashline"].forEach(id => set(id, "line-color", "#061511"));

        /* labels */
        ["place_other", "place_suburb", "place_village", "place_town", "place_city", "place_city_large", "place_state", "place_country_other", "place_country_minor", "place_country_major"].forEach(id => {
            set(id, "text-color", "#668f81");
            set(id, "text-halo-color", "#03110c");
        });
        set("highway_name_other", "text-color", "#4f7569");
        set("highway_name_other", "text-halo-color", "#03110c");
        set("highway_name_motorway", "text-color", "#4f7569");
        set("highway_name_motorway", "text-halo-color", "#03110c");
        set("boundary_state", "line-color", "#163a2e");

        return style;
    }

    function fallbackStyle() {
        return {
            version: 8,
            sources: {
                esri: {
                    type: "raster",
                    tileSize: 256,
                    tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}"],
                    attribution: "Esri, HERE, Garmin, © OpenStreetMap contributors"
                }
            },
            layers: [
                { id: "background", type: "background", paint: { "background-color": "#04130f" } },
                {
                    id: "basemap",
                    type: "raster",
                    source: "esri",
                    paint: {
                        "raster-opacity": 0.9,
                        "raster-saturation": -0.6,
                        "raster-contrast": 0.1,
                        "raster-brightness-max": 0.6
                    }
                }
            ]
        };
    }

    async function loadBaseStyle() {
        try {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 8500);
            const res = await fetch(BASEMAP_STYLE_URL, {
                signal: controller.signal,
                cache: "force-cache"
            });
            clearTimeout(timer);
            if (!res.ok) throw new Error("HTTP " + res.status);
            const style = await res.json();
            state.basemap = "openfreemap";
            return tintBaseStyle(style);
        } catch (err) {
            console.warn("GEO/LAB · vector basemap unavailable, using raster fallback", err);
            state.basemap = "esri";
            return fallbackStyle();
        }
    }

    function cameraFor(scene) {
        const cfg = SCENES[scene];
        const mobile = !DESKTOP();
        return {
            center: mobile ? MOBILE_CENTER : CENTER,
            zoom: cfg.zoom - (mobile ? 0.38 : 0),
            pitch: cfg.pitch - (mobile ? 7 : 0),
            bearing: cfg.bearing
        };
    }

    function currentPadding() {
        return DESKTOP() ? { left: 306, top: 0, right: 0, bottom: 0 } : { left: 0, top: 0, right: 0, bottom: 0 };
    }

    function updateBasemapCredit() {
        const el = $("#labBasemapCredit");
        const mapCredit = $("#labMapCredit");
        if (state.basemap === "esri") {
            if (el) el.innerHTML = 'BASEMAP © <a href="https://www.esri.com" target="_blank" rel="noopener">ESRI</a> · HERE · GARMIN · © OPENSTREETMAP CONTRIBUTORS · MAPLIBRE GL JS + DECK.GL';
            if (mapCredit) mapCredit.innerHTML = '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap</a><span>·</span><a href="https://www.esri.com" target="_blank" rel="noopener">Esri</a><span>·</span><span>HERE · Garmin</span><span>·</span><span>ODbL data</span>';
        } else {
            if (el) el.innerHTML = 'BASEMAP © <a href="https://openfreemap.org" target="_blank" rel="noopener">OPENFREEMAP</a> · © OPENMAPTILES · MAPLIBRE GL JS + DECK.GL';
            if (mapCredit) mapCredit.innerHTML = '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap</a><span>·</span><a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a><span>·</span><span>ODbL data</span>';
        }
    }

    async function initLab() {
        const mapEl = $("#geoMap");
        if (!mapEl) return;

        if (!window.maplibregl) {
            labFail("MapLibre GL JS could not be loaded. Check the connection and reload the page.");
            return;
        }

        try {
            const probe = document.createElement("canvas");
            if (!probe.getContext("webgl2")) {
                labFail("This browser does not expose WebGL2, which MapLibre and deck.gl need for the 3D scene.");
                return;
            }
        } catch (err) {
            labFail("WebGL2 is unavailable in this browser, so the 3D scene cannot start.");
            return;
        }

        state.watchdog = setTimeout(() => {
            if (!state.ready && $("#labFallback").hidden) {
                labFail("The 3D scene is taking too long to start. Check the connection and reload the page.");
            }
        }, 24000);

        const deckReady = ensureDeck();
        deckReady.catch(() => { });
        const dataReady = ensureBuildings();
        const style = await loadBaseStyle();
        updateBasemapCredit();
        const cam = cameraFor("city");
        try {
            state.map = new maplibregl.Map({
                container: mapEl,
                style,
                center: cam.center,
                zoom: cam.zoom,
                pitch: cam.pitch,
                bearing: cam.bearing,
                minZoom: 11.4,
                maxZoom: 18.6,
                maxPitch: 82,
                dragRotate: true,
                pitchWithRotate: true,
                touchPitch: true,
                renderWorldCopies: false,
                attributionControl: false,
                fadeDuration: 120,
                padding: currentPadding()
            });
        } catch (err) {
            console.error("GEO/LAB · map init failed", err);
            labFail("The MapLibre scene could not be created in this browser.");
            return;
        }

        state.map.on("error", err => console.warn("GEO/LAB · map warning", err && err.error));

        state.map.on("load", async () => {
            try {
                const [deckLib, buildings] = await Promise.all([deckReady, dataReady]);
                if (state.failed) return;

                state.deck = deckLib;
                state.buildings = buildings;
                state.cityJitter = buildings.features.map(() => 1);
                state.jitterMax = 1;
                state.maxHeight = buildings.features.reduce((max, f) =>
                    Math.max(max, (f.properties && +f.properties.height) || 0), 0) || 95;
                state.trips = makeTrips(state.flowSeed);
                state.arcs = state.trips
                    .filter(t => t.phase === 0)
                    .map(t => ({
                        source: t.path[0],
                        target: t.path[t.path.length - 1],
                        tone: t.tone,
                        value: t.value,
                        name: t.name
                    }));
                state.sensors = makeSensors(state.sensorSeed);

                attachMapEvents();
                addLandmarkMarkers();
                createOverlay();
                setupControls();
                setScene("city", { initial: true });
                finishBoot();
            } catch (err) {
                console.error("GEO/LAB · boot failed", err);
                labFail(err && /deck\.gl/.test(err.message)
                    ? "The deck.gl renderer could not be loaded. Check the connection and reload the page."
                    : "The 3D playground could not finish booting. Check the connection and reload the page.");
            }
        });
    }

    function finishBoot() {
        refreshHud();
        const bootEl = $("#labBoot");
        const body = $("#labBody");
        const reveal = () => {
            if (state.failed) return;
            clearTimeout(state.watchdog);
            state.ready = true;
            renderScene();
            updateLegend();
            body.setAttribute("aria-busy", "false");
            bootEl.classList.add("is-done");
            $("#labStatus").textContent = "WEBGL · LIVE";
        };
        requestAnimationFrame(() => requestAnimationFrame(() => {
            setTimeout(reveal, RM ? 60 : 420);
        }));
    }

    function labFail(message) {
        state.failed = true;
        clearTimeout(state.watchdog);
        const bootEl = $("#labBoot");
        if (bootEl) bootEl.classList.add("is-done");
        const fallback = $("#labFallback");
        if (fallback) fallback.hidden = false;
        const msg = $("#labFallbackMsg");
        if (msg) msg.textContent = message;
        const status = $("#labStatus");
        if (status) status.textContent = "ENGINE OFFLINE";
        const body = $("#labBody");
        if (body) {
            body.setAttribute("aria-busy", "false");
            body.classList.add("is-failed");
        }
        $$("#labDeck button, #labDeck input, .lab-tool").forEach(el => { el.disabled = true; });
    }

    function attachMapEvents() {
        const map = state.map;
        map.on("dragstart", () => { if (state.orbit) setOrbit(false); });
        map.on("move", refreshHud);
        map.on("rotate", refreshHud);
        map.on("pitch", refreshHud);
        map.on("mousemove", e => {
            const coord = $("#labHudCoord");
            if (coord) coord.textContent = `E ${e.lngLat.lng.toFixed(5)} · N ${e.lngLat.lat.toFixed(5)}`;
        });
        map.on("mouseout", refreshHud);

        let resizeTimer = 0;
        addEventListener("resize", () => {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(() => {
                if (!state.map) return;
                state.map.setPadding(currentPadding());
                state.map.resize();
            }, 160);
        });
    }

    function refreshHud() {
        if (!state.map) return;
        const c = state.map.getCenter();
        const coord = $("#labHudCoord");
        const view = $("#labHudView");
        if (coord) coord.textContent = `E ${c.lng.toFixed(5)} · N ${c.lat.toFixed(5)}`;
        const bearing = Math.round(((state.map.getBearing() % 360) + 360) % 360);
        if (view) view.textContent = `Z ${state.map.getZoom().toFixed(1)} · P ${Math.round(state.map.getPitch())}° · B ${bearing}°`;
    }

    function addLandmarkMarkers() {
        LANDMARKS.slice(0, 7).forEach(landmark => {
            const el = document.createElement("div");
            el.className = "lab-marker";
            el.innerHTML = `<i aria-hidden="true"></i><span>${esc(landmark.name)}</span>`;
            new maplibregl.Marker({ element: el, anchor: "left" })
                .setLngLat(landmark.pos)
                .addTo(state.map);
        });
    }

    /* --------------------------------------------------------------------- */
    /* deck.gl                                                               */
    /* --------------------------------------------------------------------- */

    function createOverlay() {
        state.overlay = new state.deck.MapboxOverlay({
            interleaved: false,
            layers: [],
            getTooltip
        });
        state.map.addControl(state.overlay);
    }

    function buildingHeight(feature, index, scale) {
        const base = (feature && feature.properties && +feature.properties.height) || 8;
        const jitter = state.cityJitter && index != null
            ? (state.cityJitter[index] || 1)
            : 1;
        return base * jitter * (scale == null ? 1 : scale);
    }

    function createBuildings(interactive, opacity) {
        const pal = PALETTES[state.palette];
        const scale = state.scene === "city" ? state.params.city : 1;
        const maxHeight = Math.max(1, state.maxHeight * state.jitterMax * scale);
        const layers = [];

        if (state.scene === "city") {
            layers.push(new state.deck.GeoJsonLayer({
                id: "lab-ground",
                data: state.buildings,
                extruded: false,
                filled: true,
                stroked: false,
                pickable: false,
                opacity: 0.5,
                getFillColor: [...pal.building[0], 64],
                updateTriggers: { getFillColor: state.palette }
            }));
        }

        layers.push(new state.deck.GeoJsonLayer({
            id: "lab-buildings",
            data: state.buildings,
            extruded: true,
            filled: true,
            stroked: false,
            wireframe: false,
            opacity,
            getElevation: (f, info) => buildingHeight(f, info && info.index, scale),
            getFillColor: (f, info) => {
                const h = buildingHeight(f, info && info.index, scale);
                const t = Math.pow(clamp(h / maxHeight, 0, 1), 0.78);
                return [...ramp(pal.building, t), 255];
            },
            material: {
                ambient: 0.16,
                diffuse: 0.82,
                shininess: 58,
                specularColor: pal.specular
            },
            pickable: interactive,
            autoHighlight: interactive,
            highlightColor: [210, 255, 240, 80],
            updateTriggers: {
                getFillColor: [state.palette, state.scene, state.params.city, state.cityJitter],
                getElevation: [state.scene, state.params.city, state.cityJitter]
            }
        }));

        if (state.scene === "city") {
            layers.push(new state.deck.GeoJsonLayer({
                id: "lab-outlines",
                data: state.buildings,
                extruded: false,
                filled: false,
                stroked: true,
                pickable: false,
                opacity: 0.42,
                getLineColor: [...pal.building[pal.building.length - 1], 100],
                updateTriggers: { getLineColor: state.palette },
                getLineWidth: 1,
                lineWidthUnits: "pixels",
                lineWidthMinPixels: 0.5
            }));
        }

        return layers;
    }

    function createArcLayer() {
        const pal = PALETTES[state.palette];
        return new state.deck.ArcLayer({
            id: "lab-arcs",
            data: state.arcs,
            getSourcePosition: d => d.source,
            getTargetPosition: d => d.target,
            getSourceColor: d => [...ramp(pal.route, d.tone), 170],
            getTargetColor: d => [...ramp(pal.route, d.tone), 28],
            getWidth: 1.5,
            widthUnits: "pixels",
            getHeight: 0.3,
            opacity: 0.82,
            pickable: false,
            updateTriggers: {
                getSourceColor: state.palette,
                getTargetColor: state.palette
            }
        });
    }

    function createTripLayers() {
        const pal = PALETTES[state.palette];
        const trail = state.params.flow * 40;
        const common = {
            data: state.trips,
            getPath: d => d.path,
            getTimestamps: d => d.timestamps,
            currentTime: state.flowTime,
            trailLength: trail,
            fadeTrail: true,
            updateTriggers: {
                getColor: state.palette,
                getTimestamps: state.flowTime
            },
            jointRounded: true,
            capRounded: true
        };
        const glow = new state.deck.TripsLayer(Object.assign({}, common, {
            id: "lab-trips-glow",
            getColor: d => [...ramp(pal.route, d.tone), 255],
            widthMinPixels: 13,
            opacity: 0.2,
            pickable: false,
            parameters: { depthTest: true }
        }));
        const main = new state.deck.TripsLayer(Object.assign({}, common, {
            id: "lab-trips",
            getColor: d => [...ramp(pal.route, d.tone), 255],
            widthMinPixels: 3.1,
            opacity: 0.97,
            pickable: true
        }));
        return [glow, main];
    }

    function createHeatLayers() {
        const pal = PALETTES[state.palette];
        const hexes = new state.deck.HexagonLayer({
            id: "lab-heat-hex",
            data: state.sensors,
            getPosition: d => d.geometry.coordinates,
            getColorWeight: d => d.properties.value,
            colorAggregation: "MEAN",
            getElevationWeight: () => 1,
            elevationAggregation: "SUM",
            radius: state.params.heat,
            coverage: 0.82,
            elevationRange: [0, 150],
            elevationScale: 1,
            extruded: true,
            colorRange: pal.hex,
            colorDomain: [23.5, 32.5],
            opacity: 0.92,
            pickable: true,
            autoHighlight: true,
            highlightColor: [255, 255, 255, 90],
            material: {
                ambient: 0.24,
                diffuse: 0.68,
                shininess: 50,
                specularColor: pal.specular
            }
        });
        const dots = new state.deck.ScatterplotLayer({
            id: "lab-sensors",
            data: state.sensors,
            getPosition: d => d.geometry.coordinates,
            getRadius: 2,
            radiusUnits: "pixels",
            radiusMinPixels: 1.2,
            radiusMaxPixels: 3.4,
            getFillColor: [240, 255, 250, 190],
            pickable: true,
            autoHighlight: true,
            highlightColor: [255, 255, 255, 140]
        });
        return [hexes, dots];
    }

    function createLandmarkHalo() {
        const pal = PALETTES[state.palette];
        return new state.deck.ScatterplotLayer({
            id: "lab-landmark-halo",
            data: LANDMARKS.slice(0, 7),
            getPosition: d => d.pos,
            getRadius: 10,
            radiusUnits: "pixels",
            stroked: true,
            filled: true,
            getFillColor: [...pal.building[pal.building.length - 1], 24],
            getLineColor: [...pal.building[pal.building.length - 1], 200],
            lineWidthMinPixels: 1.2,
            pickable: false,
            opacity: 0.95,
            updateTriggers: {
                getFillColor: state.palette,
                getLineColor: state.palette
            }
        });
    }

    function buildLayers() {
        let layers = [];
        if (state.scene === "city") {
            layers = createBuildings(true, 1);
            layers.push(createLandmarkHalo());
        } else if (state.scene === "flow") {
            layers = createBuildings(false, 0.34);
            layers.push(createArcLayer());
            layers = layers.concat(createTripLayers());
        } else {
            layers = createBuildings(false, 0.22);
            layers = layers.concat(createHeatLayers());
        }
        return layers;
    }

    function renderScene() {
        if (!state.overlay || !state.ready) return;
        state.sceneLayers = buildLayers();
        state.overlay.setProps({ layers: state.sceneLayers });
    }

    function updateTrips() {
        if (!state.overlay || state.scene !== "flow" || !state.ready) return;
        const fresh = createTripLayers();
        const staticLayers = state.sceneLayers.filter(l => l.id !== "lab-trips" && l.id !== "lab-trips-glow");
        state.sceneLayers = staticLayers.concat(fresh);
        state.overlay.setProps({ layers: state.sceneLayers });
    }

    /* --------------------------------------------------------------------- */
    /* tooltip                                                               */
    /* --------------------------------------------------------------------- */

    function getTooltip({ object, layer, index }) {
        if (!object || !layer) return null;
        const pal = PALETTES[state.palette];
        const style = {
            backgroundColor: "transparent",
            padding: "0",
            boxShadow: "none",
            color: "#eafff8",
            zIndex: "40"
        };

        if (layer.id === "lab-buildings") {
            const p = object.properties || {};
            const height = Math.round(buildingHeight(object, index, state.params.city));
            const base = Math.round(+p.height || 0);
            const kind = p.kind && p.kind !== "other" ? p.kind : "footprint";
            const label = p.name || "Footprint " + String((index || 0) + 1).padStart(4, "0");
            return {
                className: "lab-tip",
                style,
                html: `<div class="lab-tip-card">
                    <span class="lab-tip-kicker">${esc(kind)}${p.levels ? " · " + p.levels + " LEVELS" : ""}</span>
                    <b>${esc(label)}</b>
                    <div class="lab-tip-meta">
                        <span><i></i>${height} m rendered</span>
                        <span><i></i>${base} m base</span>
                    </div>
                </div>`
            };
        }

        if (layer.id === "lab-heat-hex") {
            const count = object.points ? object.points.length : 0;
            const raw = object.colorValue;
            const value = Array.isArray(raw) ? raw[0] : raw;
            const avg = Number.isFinite(+value) ? (+value).toFixed(1) : "—";
            return {
                className: "lab-tip",
                style,
                html: `<div class="lab-tip-card">
                    <span class="lab-tip-kicker">heat cell · ${count} sensor${count === 1 ? "" : "s"}</span>
                    <b>${avg} °C</b>
                    <div class="lab-tip-meta">
                        <span><i></i>mean surface temperature</span>
                        <span><i></i>height = density</span>
                    </div>
                </div>`
            };
        }

        if (layer.id === "lab-sensors") {
            const p = object.properties || {};
            return {
                className: "lab-tip",
                style,
                html: `<div class="lab-tip-card">
                    <span class="lab-tip-kicker">sensor ${esc(p.sensor)} · surface temp</span>
                    <b>${(+p.value).toFixed(1)} °C</b>
                    <div class="lab-tip-meta">
                        <span><i></i>built-in synthetic field</span>
                    </div>
                </div>`
            };
        }

        if (layer.id.startsWith("lab-trips")) {
            return {
                className: "lab-tip",
                style,
                html: `<div class="lab-tip-card">
                    <span class="lab-tip-kicker">mobility corridor · live</span>
                    <b>${esc(object.name)}</b>
                    <div class="lab-tip-meta">
                        <span><i></i>${fmtInt(object.value)} travellers / h</span>
                    </div>
                </div>`
            };
        }

        return null;
    }

    /* --------------------------------------------------------------------- */
    /* scene / UI state                                                      */
    /* --------------------------------------------------------------------- */

    function setScene(scene, opts) {
        if (!SCENES[scene]) return;
        state.scene = scene;
        clearTimeout(state.renderTimer);
        const cfg = SCENES[scene];
        const stage = $("#labStage");
        if (stage) stage.dataset.scene = scene;

        $$(".deck-scene").forEach(btn => {
            const active = btn.dataset.scene === scene;
            btn.classList.toggle("is-active", active);
            btn.setAttribute("aria-pressed", String(active));
        });

        const input = $("#labParam");
        if (input) {
            input.min = cfg.min;
            input.max = cfg.max;
            input.step = cfg.step;
            input.value = state.params[scene];
            syncRange(input);
        }
        const label = $("#labParamLabel");
        if (label) label.textContent = cfg.paramLabel;
        const output = $("#labParamValue");
        if (output) output.textContent = cfg.format(state.params[scene]);
        const note = $("#labSceneNote");
        if (note) note.textContent = sceneNote(scene);

        if (scene === "flow") {
            state.flowTime = RM ? 100 : 0;
            state.lastTrip = 0;
        }

        updateLegend();
        renderScene();
        syncLoop();

        if (state.map && !opts?.initial) {
            flyToView(cameraFor(scene), RM ? 0 : 1500);
        } else if (state.map) {
            state.orbitBearing = state.map.getBearing();
        }
    }

    function setPalette(name) {
        if (!PALETTES[name]) return;
        state.palette = name;
        const pal = PALETTES[name];
        lab.style.setProperty("--lab-accent", pal.accent);
        $$(".palette").forEach(btn => {
            const active = btn.dataset.palette === name;
            btn.classList.toggle("is-active", active);
            btn.setAttribute("aria-pressed", String(active));
        });
        const label = $("#labPaletteName");
        if (label) label.textContent = pal.label;
        updateLegend();
        if (state.ready) renderScene();
    }

    function syncRange(input) {
        if (!input) return;
        const min = +input.min;
        const max = +input.max;
        const pct = max > min ? ((+input.value - min) / (max - min)) * 100 : 0;
        input.style.setProperty("--fill", pct.toFixed(2) + "%");
    }

    function updateLegend() {
        const pal = PALETTES[state.palette];
        const title = $("#labLegendTitle");
        const count = $("#labLegendCount");
        const min = $("#labLegendMin");
        const max = $("#labLegendMax");
        const bar = $("#labLegendBar");
        if (!title || !bar) return;

        if (state.scene === "city") {
            const renderedMax = Math.round(state.maxHeight * state.jitterMax * state.params.city);
            title.textContent = "ELEVATION";
            count.textContent = fmtInt(state.buildings ? state.buildings.features.length : 0);
            min.textContent = "0 M";
            max.textContent = renderedMax + " M";
            bar.style.background = `linear-gradient(90deg, ${pal.building.map(rgb).join(", ")})`;
            bar.style.boxShadow = `0 0 16px ${pal.accent}38`;
        } else if (state.scene === "flow") {
            title.textContent = "MOBILITY FLOW";
            count.textContent = fmtInt(state.routeCount);
            min.textContent = "ORIGIN";
            max.textContent = "LIVE";
            bar.style.background = `linear-gradient(90deg, ${pal.route.map(rgb).join(", ")})`;
            bar.style.boxShadow = `0 0 16px ${pal.accent}38`;
        } else {
            const values = state.sensors.map(s => +s.properties.value);
            const lo = Math.floor(Math.min(...values));
            const hi = Math.ceil(Math.max(...values));
            title.textContent = "SURFACE HEAT";
            count.textContent = fmtInt(state.sensors.length);
            min.textContent = lo + " °C";
            max.textContent = hi + " °C";
            bar.style.background = `linear-gradient(90deg, ${pal.hex.map(rgb).join(", ")})`;
            bar.style.boxShadow = `0 0 16px ${pal.accent}38`;
        }
    }

    function sceneNote(scene) {
        if (scene === "city") {
            return fmtInt(state.buildings ? state.buildings.features.length : 0) +
                " OSM footprints, extruded by height. Hover a block to inspect.";
        }
        if (scene === "flow") {
            return state.routeCount + " animated corridors. Hover a trail for trip details.";
        }
        return fmtInt(state.sensors.length) +
            " sensors in 3D hex bins. Height = density, colour = temperature.";
    }

    function updateHeaderCounts() {
        const buildings = state.buildings ? state.buildings.features.length : 0;
        const metaB = $("#metaBuildings");
        const metaF = $("#metaFlows");
        const metaS = $("#metaSensors");
        if (metaB) metaB.textContent = fmtInt(buildings);
        if (metaF) metaF.textContent = fmtInt(state.routeCount);
        if (metaS) metaS.textContent = fmtInt(state.sensors.length);
    }

    /* --------------------------------------------------------------------- */
    /* animation                                                             */
    /* --------------------------------------------------------------------- */

    function wantsLoop() {
        return state.visible && !RM && (state.orbit || state.scene === "flow");
    }

    function syncLoop() {
        if (wantsLoop()) startLoop();
        else stopLoop();
    }

    function startLoop() {
        if (state.raf) return;
        state.lastFrame = performance.now();
        state.raf = requestAnimationFrame(tick);
    }

    function stopLoop() {
        if (state.raf) cancelAnimationFrame(state.raf);
        state.raf = 0;
        state.lastFrame = 0;
    }

    function tick(now) {
        state.raf = 0;
        if (!wantsLoop()) {
            state.lastFrame = 0;
            return;
        }
        if (document.hidden) {
            state.lastFrame = now;
            state.raf = requestAnimationFrame(tick);
            return;
        }
        const dt = state.lastFrame ? Math.min(64, now - state.lastFrame) : 16;
        state.lastFrame = now;

        if (state.orbit && state.map && !state.flying) {
            /* gentle continuous orbit: ~2°/s */
            state.orbitBearing = (state.orbitBearing + dt * 0.002) % 360;
            state.map.setBearing(state.orbitBearing);
        }

        if (state.scene === "flow" && state.ready) {
            state.flowTime = (state.flowTime + dt * 0.02) % CYCLE;
            if (now - state.lastTrip > 32) {
                state.lastTrip = now;
                updateTrips();
            }
        }

        state.raf = requestAnimationFrame(tick);
    }

    function setOrbit(on) {
        state.orbit = !!on;
        const btn = $("#labOrbit");
        if (btn) btn.setAttribute("aria-pressed", String(state.orbit));
        if (state.orbit && state.map) {
            state.orbitBearing = state.map.getBearing();
            state.flying = false;
        }
        syncLoop();
    }

    function flyToView(view, duration) {
        if (!state.map) return;
        state.flying = true;
        state.map.flyTo(Object.assign({}, view, { duration, essential: true }));
        let settled = false;
        const settle = () => {
            if (settled) return;
            settled = true;
            state.flying = false;
            if (state.map) state.orbitBearing = state.map.getBearing();
        };
        state.map.once("moveend", settle);
        setTimeout(settle, duration + 400);
    }

    function resetView() {
        flyToView(cameraFor(state.scene), RM ? 0 : 1400);
    }

    /* --------------------------------------------------------------------- */
    /* actions                                                              */
    /* --------------------------------------------------------------------- */

    function shuffleData() {
        if (!state.ready) return;
        if (state.scene === "city") {
            const rng = mulberry32((Date.now() & 0x7fffffff) + 1);
            state.cityJitter = state.buildings.features.map(f => {
                if (f.properties && f.properties.name) return 1;
                return 0.58 + rng() * 0.92;
            });
            state.jitterMax = state.cityJitter.reduce((m, v) => Math.max(m, v), 1);
        } else if (state.scene === "flow") {
            state.flowSeed = (state.flowSeed + 13) % 997;
            state.trips = makeTrips(state.flowSeed);
            state.arcs = state.trips
                .filter(t => t.phase === 0)
                .map(t => ({
                    source: t.path[0],
                    target: t.path[t.path.length - 1],
                    tone: t.tone,
                    value: t.value,
                    name: t.name
                }));
            state.flowTime = 0;
        } else {
            state.sensorSeed = (state.sensorSeed + 17) % 997;
            state.sensors = makeSensors(state.sensorSeed);
        }
        updateHeaderCounts();
        updateLegend();
        renderScene();

        const btn = $("#labShuffle");
        if (btn) {
            const label = btn.querySelector("span");
            if (label) {
                clearTimeout(state.shuffleTimer);
                btn.classList.add("is-done");
                label.textContent = "DATA SHUFFLED ✓";
                state.shuffleTimer = setTimeout(() => {
                    btn.classList.remove("is-done");
                    label.textContent = "SHUFFLE THE DATA";
                }, 1500);
            }
        }
    }

    function exportGeoJSON() {
        if (!state.ready) return;
        let data, filename;
        if (state.scene === "city") {
            data = {
                type: "FeatureCollection",
                attribution: "© OpenStreetMap contributors (ODbL)",
                generated_by: "GEO/LAB · MapLibre GL JS + deck.gl",
                features: state.buildings.features.map((f, i) => ({
                    type: "Feature",
                    properties: Object.assign({}, f.properties, {
                        height: Math.round((+f.properties.height || 0) * (state.cityJitter ? state.cityJitter[i] || 1 : 1))
                    }),
                    geometry: f.geometry
                }))
            };
            filename = "geolab-mannheim-buildings.geojson";
        } else if (state.scene === "flow") {
            data = {
                type: "FeatureCollection",
                generated_by: "GEO/LAB · MapLibre GL JS + deck.gl",
                features: state.trips.filter(t => t.phase === 0).map(t => ({
                    type: "Feature",
                    properties: {
                        route: t.route + 1,
                        name: t.name,
                        travellers_per_hour: t.value
                    },
                    geometry: {
                        type: "LineString",
                        coordinates: t.path.map(p => [p[0], p[1]])
                    }
                }))
            };
            filename = "geolab-mobility-corridors.geojson";
        } else {
            data = {
                type: "FeatureCollection",
                generated_by: "GEO/LAB · synthetic sensor field",
                features: state.sensors
            };
            filename = "geolab-heat-sensors.geojson";
        }

        try {
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/geo+json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 1500);

            const btn = $("#labExport");
            if (btn) {
                const old = btn.textContent;
                btn.textContent = "EXPORTED ✓";
                setTimeout(() => { btn.textContent = old; }, 1500);
            }
        } catch (err) {
            console.warn("GEO/LAB · export failed", err);
        }
    }

    function toggleFullscreen() {
        const body = $("#labBody");
        if (!body) return;
        if (!document.fullscreenElement) {
            const request = body.requestFullscreen && body.requestFullscreen();
            if (request && request.catch) request.catch(() => { });
        } else if (document.exitFullscreen) {
            document.exitFullscreen().catch(() => { });
        }
    }

    document.addEventListener("fullscreenchange", () => {
        const active = document.fullscreenElement === $("#labBody");
        const btn = $("#labFull");
        if (btn) {
            btn.setAttribute("aria-pressed", String(active));
            btn.setAttribute("aria-label", active ? "Exit fullscreen" : "Enter fullscreen");
        }
        setTimeout(() => {
            if (state.map) {
                state.map.resize();
                state.map.setPadding(currentPadding());
            }
        }, 90);
    });

    /* --------------------------------------------------------------------- */
    /* controls                                                              */
    /* --------------------------------------------------------------------- */

    function setupControls() {
        updateHeaderCounts();

        $$(".deck-scene").forEach(btn => {
            btn.addEventListener("click", () => {
                if (btn.dataset.scene !== state.scene) setScene(btn.dataset.scene);
            });
        });

        $$(".palette").forEach(btn => {
            btn.addEventListener("click", () => setPalette(btn.dataset.palette));
        });

        const input = $("#labParam");
        if (input) {
            syncRange(input);
            input.addEventListener("input", () => {
                const cfg = SCENES[state.scene];
                const value = +input.value;
                state.params[state.scene] = value;
                const output = $("#labParamValue");
                if (output) output.textContent = cfg.format(value);
                syncRange(input);
                debounceRender();
            });
        }

        const orbit = $("#labOrbit");
        if (orbit) {
            if (RM) {
                orbit.disabled = true;
                orbit.setAttribute("aria-label", "Auto orbit disabled by reduced-motion preference");
                orbit.dataset.tip = "REDUCED MOTION";
            } else {
                orbit.addEventListener("click", () => setOrbit(!state.orbit));
            }
        }
        const reset = $("#labReset");
        if (reset) reset.addEventListener("click", resetView);
        const full = $("#labFull");
        if (full) {
            if (document.fullscreenEnabled) full.addEventListener("click", toggleFullscreen);
            else full.hidden = true;
        }
        const shuffle = $("#labShuffle");
        if (shuffle) shuffle.addEventListener("click", shuffleData);
        const exp = $("#labExport");
        if (exp) exp.addEventListener("click", exportGeoJSON);

        addEventListener("keydown", e => {
            if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
            const tag = (document.activeElement && document.activeElement.tagName) || "";
            if (/^(INPUT|TEXTAREA|SELECT)$/.test(tag)) return;
            if (e.key.toLowerCase() !== "r") return;
            const r = lab.getBoundingClientRect();
            if (r.bottom < 0 || r.top > innerHeight) return;
            shuffleData();
        });
    }

})();
