(function () {
    "use strict";
    document.documentElement.classList.remove('no-js');
    const $ = (s, c) => (c || document).querySelector(s);
    const $$ = (s, c) => Array.from((c || document).querySelectorAll(s));
    const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const COARSE = matchMedia('(pointer: coarse)').matches || matchMedia('(hover: none)').matches;

    $('#year').textContent = new Date().getFullYear();

    const nav = $('#nav'), burger = $('#burger'), navPanel = $('.nav-panel');
    const setMenu = (open, restoreFocus) => {
        nav.classList.toggle('nav-open', open);
        burger.setAttribute('aria-expanded', String(open));
        burger.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
        document.body.classList.toggle('menu-open', open);
        if (open) {
            const first = navPanel.querySelector('a');
            first && first.focus({ preventScroll: true });
        } else if (restoreFocus) {
            burger.focus({ preventScroll: true });
        }
    };
    const menuOpen = () => nav.classList.contains('nav-open');
    burger.addEventListener('click', () => setMenu(!menuOpen()));
    $$('#navLinks a, .nav-cta').forEach(a => a.addEventListener('click', () => setMenu(false)));
    addEventListener('keydown', e => { if (e.key === 'Escape' && menuOpen()) setMenu(false, true) });
    document.addEventListener('click', e => { if (menuOpen() && !nav.contains(e.target)) setMenu(false) });
    matchMedia('(min-width:921px)').addEventListener('change', e => { if (e.matches && menuOpen()) setMenu(false) });

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
    /* tile.openstreetmap.org enforces its referrer policy and answers with a
       "403 Access blocked" tile whenever it can't verify the referrer — e.g.
       in local file previews or browsers that strip it. FOSSGIS serves the
       same OpenStreetMap Carto style without that check. */
    const TILE_URL = 'https://tile.openstreetmap.de/{z}/{x}/{y}.png';
    const osmStyle = () => ({
        version: 8, sources: {
            osm: {
                type: 'raster', tileSize: 256,
                tiles: [TILE_URL], attribution: '© OpenStreetMap contributors'
            }
        },
        layers: [{ id: 'bg', type: 'background', 'paint': { 'background-color': '#E4F1EA' } },
        { id: 'osm', type: 'raster', source: 'osm' }]
    });

    let heroMap = null, orbitOn = false;

    function startOrbit() {
        if (RM || COARSE) return;
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
        if (!window.maplibregl) { fallbackCanvas(); return; }
        try {
            heroMap = new maplibregl.Map({ container: $('#heroMap'), style: osmStyle(), center: CENTER, zoom: 10.6, pitch: 42, bearing: -22, attributionControl: { compact: true }, scrollZoom: false, touchZoom: false, dragRotate: false, interactive: !COARSE });
            heroMap.on('load', () => {
                ['scrollZoom', 'touchZoom', 'dragRotate'].forEach(m => heroMap[m]?.disable());
                try { heroMap.setPaintProperty('osm', 'raster-saturation', -0.5); } catch (e) { }
                const el = document.createElement('div'); el.className = 'pin-chip'; el.textContent = 'ME';
                new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat(CENTER).addTo(heroMap);
                if (RM || COARSE) {
                    /* phones: no orbit loop, no wasted frames — just settle on the composition */
                    heroMap.jumpTo(HOME);
                } else {
                    const home = () => heroMap.flyTo({ ...HOME, duration: 3400, essential: true });
                    setTimeout(home, 250);
                    setTimeout(() => { orbitOn = true; startOrbit(); setInterval(tickReadout, 700) }, 3800);
                }
            });
            new IntersectionObserver(en => en.forEach(e => orbitOn = e.isIntersecting), { threshold: .1 }).observe($('.hero'));
        } catch (err) { console.warn('Map init failed →', err); fallbackCanvas(); }
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