(function () {
    "use strict";
    document.documentElement.classList.remove('no-js');
    const $ = (s, c) => (c || document).querySelector(s);
    const $$ = (s, c) => Array.from((c || document).querySelectorAll(s));
    const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;

    $('#year').textContent = new Date().getFullYear();

    const nav = $('#nav'), burger = $('#burger');
    burger.addEventListener('click', () => {
        const open = nav.classList.toggle('nav-open');
        burger.setAttribute('aria-expanded', open);
    });
    $$('#navLinks a').forEach(a => a.addEventListener('click', () => { nav.classList.remove('nav-open'); burger.setAttribute('aria-expanded', 'false') }));

    const progBar = $('#progress i'), toTop = $('#toTop');
    function onScroll() {
        const h = document.documentElement;
        const p = h.scrollTop / ((h.scrollHeight - h.clientHeight) || 1);
        progBar.style.width = (p * 100).toFixed(2) + '%';
        toTop.classList.toggle('show', h.scrollTop > 680);
    }
    addEventListener('scroll', onScroll, { passive: true }); onScroll();
    toTop.addEventListener('click', () => scrollTo({ top: 0, behavior: RM ? 'auto' : 'smooth' }));

    /* scroll spy */
    const spyLinks = $$('#navLinks a');
    const secIO = new IntersectionObserver(en => {
        en.forEach(e => {
            if (!e.isIntersecting) return;
            const id = e.target.id;
            spyLinks.forEach(a => a.classList.toggle('active', a.getAttribute('href') === '#' + id));
        });
    }, { rootMargin: '-40% 0px -55% 0px' });
    ['about', 'experience', 'education', 'skills', 'projects'].forEach(id => { const el = document.getElementById(id); el && secIO.observe(el) });

    const revIO = new IntersectionObserver(en => en.forEach(e => {
        if (!e.isIntersecting) return;
        e.target.classList.add('in'); revIO.unobserve(e.target);
    }), { threshold: .14 });
    $$('.rev, .sec-head, .portrait-wrap').forEach(el => revIO.observe(el));

    const GLYPHS = '!<>-_/[]{}=+*#%&$@01';
    function scramble(el) {
        const txt = el.dataset.text; if (RM || !txt) { el.textContent = txt; return; }
        let f = 0, total = Math.max(16, Math.round(txt.length * 2.4));
        const id = setInterval(() => {
            f++;
            el.textContent = txt.split('').map((c, i) =>
                c === ' ' ? ' ' : (i < (f / total) * txt.length ? c : GLYPHS[(Math.random() * GLYPHS.length) | 0])
            ).join('');
            if (f >= total) { el.textContent = txt; clearInterval(id); }
        }, 42);
    }
    addEventListener('load', () => { $$('[data-scramble]').forEach((el, i) => setTimeout(() => scramble(el), 180 + i * 260)); });

    const CENTER = [8.4719, 49.4881], HOME = { center: CENTER, zoom: 13.4, pitch: 58, bearing: -6 };
    const osmStyle = () => ({
        version: 8, sources: {
            osm: {
                type: 'raster', tileSize: 256,
                tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], attribution: '© OpenStreetMap contributors'
            }
        },
        layers: [{ id: 'bg', type: 'background', 'paint': { 'background-color': '#E4F1EA' } },
        { id: 'osm', type: 'raster', source: 'osm' }]
    });

    let heroMap = null, labMap = null, orbitOn = false;

    function startOrbit() {
        if (RM) return;
        const A = 26, P = 52000, t0 = performance.now(); let last = 0;
        (function loop(now) {
            requestAnimationFrame(loop);
            if (!orbitOn || document.hidden) return;
            if (now - last < 34) return;               // ~30fps is plenty for bearing
            last = now;
            heroMap.setBearing(A * Math.sin((now - t0) / P * 2 * Math.PI));
        })(t0);
    }

    function tickReadout() {
        const c = heroMap.getCenter(); if (!c) return;
        $('#rLat').textContent = c.lat.toFixed(4) + '°';
        $('#rLng').textContent = c.lng.toFixed(4) + '°';
        $('#rZoom').textContent = heroMap.getZoom().toFixed(1);
        $('#rBrg').textContent = Math.round(heroMap.getBearing()) + '°';
    }

    function initMaps() {
        if (!window.maplibregl) { fallbackCanvas(); offlineLab(); return; }
        try {
            heroMap = new maplibregl.Map({ container: $('#heroMap'), style: osmStyle(), center: CENTER, zoom: 10.6, pitch: 42, bearing: -22, attributionControl: { compact: true }, scrollZoom: false, touchZoom: false, dragRotate: false });
            heroMap.on('load', () => {
                ['scrollZoom', 'touchZoom', 'dragRotate'].forEach(m => heroMap[m]?.disable());
                try { heroMap.setPaintProperty('osm', 'raster-saturation', -0.5); } catch (e) { }
                const el = document.createElement('div'); el.className = 'pin-chip'; el.textContent = 'ME';
                new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat(CENTER).addTo(heroMap);
                if (RM) { heroMap.setPitch(HOME.pitch); heroMap.setBearing(HOME.bearing); home(); }
                else {
                    const home = () => heroMap.flyTo({ ...HOME, duration: 3400, essential: true });
                    setTimeout(home, 250);
                    setTimeout(() => { orbitOn = true; startOrbit(); setInterval(tickReadout, 700) }, 3800);
                }
            });
            new IntersectionObserver(en => en.forEach(e => orbitOn = e.isIntersecting), { threshold: .1 }).observe($('.hero'));

            initLab();
        } catch (err) { console.warn('Map init failed →', err); fallbackCanvas(); offlineLab(); }
    }

    const SAMPLE = {
        type: 'FeatureCollection', features: [{
            type: 'Feature', properties: { name: 'Sample — Innenstadt' }, geometry: {
                type: 'Polygon', coordinates: [[
                    [8.4650, 49.4842], [8.4790, 49.4831], [8.4862, 49.4918], [8.4785, 49.5002], [8.4640, 49.4958], [8.4650, 49.4842]]]
            }
        }]
    };

    function polyColor(hue) {
        const h = ((hue % 360) + 360) % 360;            // normalize 0..360
        const s = .64, l = .5;                       // fixed mint-leaning saturation/lightness
        const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
        let r = 0, g = 0, b = 0;
        if (h < 60) { r = c; g = x; } else if (h < 120) { r = x; g = c; }
        else if (h < 180) { g = c; r = x; } else if (h < 240) { g = c; b = x; }
        else if (h < 300) { b = c; g = x; } else { b = c; r = x; }
        const to = v => Math.round((v + m) * 255);      // MapLibre accepts rgb(0-255) strings
        return `rgb(${to(r)},${to(g)},${to(b)})`;
    }


    function initLab() {
        const box = $('#labMap'), readoutEl = $('#labReadout');
        labMap = new maplibregl.Map({ container: box, style: osmStyle(), center: CENTER, zoom: 12.4, pitch: 0, bearing: 0, attributionControl: { compact: true }, dragRotate: false });
        let hasUser = false;
        const removeBtn = $('#removeDataButton'), slider = $('#colorSlider');

        labMap.on('load', () => {
            try { labMap.setPaintProperty('osm', 'raster-saturation', -0.25); } catch (e) { }
            labMap.addSource('user', { type: 'geojson', data: SAMPLE });
            labMap.addLayer({ id: 'user-fill', type: 'fill', source: 'user', 'paint': { 'fill-color': polyColor(168), 'fill-opacity': 0.4 } });
            labMap.addLayer({ id: 'user-line', type: 'line', source: 'user', 'paint': { 'line-color': '#FFFFFF', 'line-width': 2, 'line-dasharray': [1, 0] } });

            /* hue slider */
            slider.addEventListener('input', e => labMap.setPaintProperty('user-fill', 'fill-color', polyColor(+e.target.value)));
            /* remove import */
            $('#fileInput').addEventListener('change', ev => {
                const f = ev.target.files[0]; if (!f) return;
                const r = new FileReader();
                r.onload = () => {
                    try {
                        let d = JSON.parse(r.result);
                        if (d.type !== 'FeatureCollection') d = { type: 'FeatureCollection', features: [d] };
                        labMap.getSource('user').setData(d); hasUser = true; removeBtn.disabled = false; fitData(d);
                    } catch (err) { readoutEl.textContent = '⚠ could not parse file'; setTimeout(() => readoutEl.textContent = 'E — · N —', 2600); }
                };
                r.readAsText(f); ev.target.value = '';
            });
            removeBtn.addEventListener('click', () => { labMap.getSource('user').setData({ type: 'FeatureCollection', features: [] }); hasUser = false; removeBtn.disabled = true; readoutEl.textContent = 'IMPORT CLEARED'; setTimeout(() => readoutEl.textContent = 'E — · N —', 2000); });
            $('#resetView').addEventListener('click', () => { const s = labMap.getSource('user')._data || SAMPLE; fitData(s); });

            function fitData(d) { labMap.fitBounds(d, { padding: 70, duration: RM ? 0 : 900 }); }

            /* live coordinate readout */
            box.addEventListener('mousemove', e => {
                const l = labMap.queryRenderedFeatures([e.offsetX, e.offsetY]); // cheap enough at this size
                const c = labMap.unproject([e.offsetX, e.offsetY]);
                readoutEl.textContent = `E ${c.lng.toFixed(5)} · N ${c.lat.toFixed(5)}`;
            });
            box.addEventListener('mouseleave', () => { readoutEl.textContent = 'MOVE CURSOR OVER MAP'; });
        });

        /* tilt toggle */
        const tilt = document.createElement('button');
        tilt.className = 'btn-mini'; tilt.textContent = 'TILT → 3D'; tilt.style.position = 'absolute'; tilt.style.top = '14px'; tilt.style.right = '14px'; tilt.style.zIndex = '6';
        box.appendChild(tilt);
        let pitched = false;
        tilt.addEventListener('click', () => {
            pitched = !pitched;
            tilt.textContent = pitched ? 'FLAT → 2D' : 'TILT → 3D';
            labMap.easeTo({ center: CENTER, zoom: 12.8, pitch: pitched ? 60 : 0, duration: RM ? 0 : 950, essential: true });
        });
    }

    function offlineLab() {
        const box = $('#labMap'); if (!box) return;
        const d = document.createElement('div'); d.className = 'map-offline';
        d.innerHTML = 'LIVE MAP NEEDS A CONNECTION.<br>THE REAL ONE SHINES ON YOUR NETWORK.';
        box.innerHTML = ''; box.appendChild(d);
    }

    const BLOB1 = new Path2D("M78 232C58 168 108 92 196 74c90-19 160 34 176 104S344 312 258 330C172 348 98 296 78 232Z");
    const BLOB2 = new Path2D("M96 210c-14-52 26-106 96-120S322 118 334 174C346 230 310 278 242 292 174 306 112 268 96 210Z");
    function fallbackCanvas() {
        const old = $('#heroMap'); if (old) old.remove();
        const cv = document.createElement('canvas'); cv.id = 'fallbackCanvas'; $('.hero').prepend(cv);
        const ctx = cv.getContext('2d'), dpr = Math.min(devicePixelRatio || 1, 2);
        const pts = [[.64, .38], [.3, .58], [.76, .66]]; // drifting "data nodes"
        let trails = pts.map(() => []);
        function draw(t) {
            cv.width = cv.clientWidth * dpr; cv.height = cv.clientHeight * dpr; ctx.scale(dpr, dpr);
            const W = cv.clientWidth, H = cv.clientHeight, S = Math.min(W, H) / 360 * 1.4, ox = W / 2 - 200 * S, oy = H / 2 - 180 * S;
            ctx.fillStyle = '#E7F2EC'; ctx.fillRect(0, 0, W, H);
            ctx.strokeStyle = 'rgba(15,120,95,.09)'; ctx.lineWidth = 1;
            for (let x = (W / 2) % 64; x < W; x += 64) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
            for (let y = (H / 2) % 64; y < H; y += 64) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
            /* contours */
            ctx.save(); ctx.translate(ox, oy); ctx.scale(S, S);
            ctx.strokeStyle = 'rgba(37,185,146,.3)'; ctx.lineWidth = 2 / S; ctx.setLineDash([]);
            ctx.stroke(BLOB1); ctx.setLineDash([6, 5]); ctx.stroke(BLOB2); ctx.restore();
            /* radar sweep */
            const cx = W / 2, cy = H / 2, R = Math.min(W, H) * .42, a0 = t * .0009;
            for (let i = 38; i >= 0; i--) {
                ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, R, a0 - i * .02, a0 - .015); ctx.closePath();
                ctx.fillStyle = `rgba(63,224,175,${.05 * (1 - i / 40)})`; ctx.fill();
            }
            /* drifting nodes */
            pts.forEach((p, i) => {
                const x = (p[0] + Math.sin(t * .00021 + i * 2) * .06) * W, y = (p[1] + Math.cos(t * .00017 + i * 3) * .05) * H;
                trails[i].push([x, y]); if (trails[i].length > 26) trails[i].shift();
                ctx.strokeStyle = 'rgba(37,185,146,.35)'; ctx.lineWidth = 1.4; ctx.beginPath();
                trails[i].forEach((q, k) => k ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1])); ctx.stroke();
                ctx.fillStyle = '#25B992'; ctx.beginPath(); ctx.arc(x, y, 3.6, 0, 7); ctx.fill();
                ctx.font = '10px "JetBrains Mono",monospace'; ctx.fillStyle = '#4C6A5F'; ctx.fillText('node_0' + (i + 1), x + 8, y - 6);
            });
            if (!RM) requestAnimationFrame(draw);
        }
        RM ? draw(0) : requestAnimationFrame(draw);
    }

    addEventListener('load', initMaps);

})();