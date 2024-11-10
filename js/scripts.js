/*!
    * Start Bootstrap - Resume v6.0.1 (https://startbootstrap.com/template-overviews/resume)
    * Copyright 2013-2020 Start Bootstrap
    * Licensed under MIT (https://github.com/StartBootstrap/startbootstrap-resume/blob/master/LICENSE)
    */
    (function ($) {
    "use strict"; // Start of use strict

    // Smooth scrolling using jQuery easing
    $('a.js-scroll-trigger[href*="#"]:not([href="#"])').click(function () {
        if (
            location.pathname.replace(/^\//, "") ==
                this.pathname.replace(/^\//, "") &&
            location.hostname == this.hostname
        ) {
            var target = $(this.hash);
            target = target.length
                ? target
                : $("[name=" + this.hash.slice(1) + "]");
            if (target.length) {
                $("html, body").animate(
                    {
                        scrollTop: target.offset().top,
                    },
                    1000,
                    "easeInOutExpo"
                );
                return false;
            }
        }
    });

    // Closes responsive menu when a scroll trigger link is clicked
    $(".js-scroll-trigger").click(function () {
        $(".navbar-collapse").collapse("hide");
    });

    // Activate scrollspy to add active class to navbar items on scroll
    $("body").scrollspy({
        target: "#sideNav",
    });
})(jQuery); // End of use strict

const map = new maplibregl.Map({
    container: 'map',
    // style: 'https://tiles.basemaps.cartocdn.com/gl/voyager-gl-style/style.json',
    style: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
    center: [10.5, 51],
    zoom: 4
});
map.addControl(new maplibregl.NavigationControl());

document.getElementById('fileInput').addEventListener('change', function (event) {
    document.getElementById('colorSlider').value = '0';
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function (e) {
            const contents = e.target.result;
            const data = JSON.parse(contents);
            addDataSource(data);
            document.getElementById('removeDataButton').style.display = 'inline';
            document.getElementById('fileInput').value = '';
        };
        reader.readAsText(file);
    }
});

document.getElementById('removeDataButton').addEventListener('click', function () {
    removeDataSource();
});

document.getElementById('colorSlider').addEventListener('input', function (event) {
    const hue = event.target.value;
    const color = `hsl(${hue}, 100%, 50%)`;
    map.setPaintProperty('data-layer', 'fill-color', color);
});

document.getElementById('resetView').addEventListener('click', function () {
    map.flyTo({
        center: [10.5, 51],
        zoom: 4,
        pitch: 0,
        bearing: 0
    });
})

function addDataSource(data) {
    if (map.getSource('data')) {
        map.removeLayer('data-layer');
        map.removeSource('data');
    }
    map.addSource('data', {
        type: 'geojson',
        data: data
    });

    map.addLayer({
        id: 'data-layer',
        type: 'fill',
        source: 'data',
        paint: {
            'fill-color': 'rgba(128, 128, 128, 0.5)',
            'fill-outline-color': 'red'
        }
    });
}

function removeDataSource() {
    if (map.getSource('data')) {
        map.removeLayer('data-layer');
        map.removeSource('data');
        document.getElementById('removeDataButton').style.display = 'none';
        document.getElementById('colorSlider').value = '0';
    }
}

function updateCoordinates() {
    const coordinatesContainer = document.getElementById('coordinates');
    const { lng, lat } = map.getCenter();
    const zoom = map.getZoom().toFixed(2);
    const pitch = map.getPitch().toFixed(2);
    coordinatesContainer.innerHTML = `Longitude: ${lng.toFixed(3)} | Latitude: ${lat.toFixed(3)} Zoom: ${zoom} | Pitch: ${pitch}`;
}

map.on('move', updateCoordinates);

map.on('load', updateCoordinates);