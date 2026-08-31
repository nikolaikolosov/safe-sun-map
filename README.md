# Safe Sun Map

**Live: [nikolaikolosov.github.io/safe-sun-map](https://nikolaikolosov.github.io/safe-sun-map/)**

Open it on your phone and it washes the map in one of five colours — the UV index where you
are standing. Green means go outside. Violet means don't.

| UV index | Colour | Meaning   |
| -------- | ------ | --------- |
| 0 – 2.9  | green  | low       |
| 3 – 5.9  | yellow | moderate  |
| 6 – 7.9  | orange | high      |
| 8 – 10.9 | red    | very high |
| 11 +     | violet | extreme   |

The bands are the WHO/WMO Global Solar UV Index scale. The wash gets heavier as the index
climbs: the safe end sits lightly over a map you can still read, the extreme end is hard to
look past.

## How it works

1. The browser reports a coarse position — deliberately coarse: the UV index is uniform over
   tens of kilometres, so a GPS fix would buy no accuracy that changes the colour, and would
   cost a cold-start wait and the receiver's battery.
2. That position goes to [Open-Meteo's air-quality API](https://open-meteo.com/en/docs/air-quality-api)
   (no key, no quota registration), which answers with the current UV index and the IANA
   timezone of the coordinate — which is what makes the clock on the card local to _there_
   rather than to the device.
3. The reading is refreshed every 10 minutes, whenever the visitor moves more than 10 km, and
   whenever a parked tab comes back to the foreground.

A second card under the reading gives the day its own shape: a bar of the 24 hours divided
into night, astronomical, nautical and civil twilight and daylight, and behind a tap the same
phases as rows with their hours — the layout
[timeanddate.com](https://www.timeanddate.com/astronomy/) uses. The bar answers at a glance
and stays; the nine rows are reference, and on a small phone they were most of the screen. The date comes from the device
clock and everything else is computed on the device from that date and the position
([src/sun.js](src/sun.js), NOAA's solar algorithm): no extra network call, and the numbers
roll over at midnight on their own.

Times are shown in the location's timezone, like the clock, so a traveller reads the sunset of
the place they are standing in. Only the phases a day actually has appear — high summer at
78°N is civil twilight, daylight, civil twilight and nothing else — so polar latitudes get a
shorter table rather than impossible numbers.

There is no dark mode by design: the five bands are only distinguishable from one another over
a light, low-saturation basemap. Tiles are Esri's World Light Gray Base — no API key, no
account, and a grey canvas by design, so nothing has to be desaturated to keep the five washes
apart. It is the same basemap as the sibling
[Montevideo bus map](https://nikolaikolosov.github.io/montevideo-bus-map/), which means a
provider that breaks breaks both projects at once, and gets fixed once.

Copy is in English, Spanish and Russian. The page opens in whichever of those the browser asks
for, and the EN | ES | RU control on the card overrides that for good — a stored choice beats
the browser on every later visit, because someone who tapped RU on a Spanish phone meant it.
The reading redraws in place on a switch, decimal separator included (`4.0` / `4,2`).

The ⓘ control in the bottom-right opens a one-screen explainer: what the index measures, the
five levels as a colour legend, and what UV does to skin and eyes. The legend is generated from
the same band table the map is coloured from, so it cannot drift from the behaviour.

Bottom-left is a quiet link to the author's Ko-fi page. It is markup and CSS only — no script, no
third-party widget, nothing loaded from a payment host.

## Layout

Buildless static site. GitHub Pages serves `main` as it stands — no build step, no bundler,
no server; `npm` is dev tooling only. A merge reaches
[the live site](https://nikolaikolosov.github.io/safe-sun-map/) a minute or two later, and
returning visitors keep the previous copy for up to ten more (Pages sends
`Cache-Control: max-age=600`).

```
index.html          markup and the meta-tag CSP
css/styles.css      one screen's worth of styles
src/uv.js           the domain model: bands, rounding, formatting, the API call
src/sun.js          the sun's phases for a date and a coordinate, computed on the device
src/daylight.js     the daylight card: the 24-hour bar and the phase table
src/map.js          Leaflet — basemap, "you are here", the bottom-right controls
src/help.js         the ⓘ sheet: what the index is, the levels, what it does
src/i18n.js         copy in en/es/ru, and the language runtime
src/app.js          wiring: position → reading → wash, and the switcher
tests/uv.test.js    band boundaries, formatting, API failure modes
tests/i18n.test.js  language resolution, persistence, copy completeness
tests/sun.test.js   solar anchors, day ordering, polar and white-night cases
tests/daylight.test.js  axis coverage, zone offsets, published-times agreement
```

## Verification

```bash
npm ci && npm run lint && npm run format:check && npm test
```

To run it locally, serve the directory over HTTP — `file://` will not do, because the app is
made of ES modules:

```bash
python -m http.server 4173
```

Geolocation needs a secure context, so `localhost` works but a LAN IP does not.

## Licence

MIT — see [LICENSE](LICENSE). Basemap tiles © Esri — Esri, HERE, Garmin,
© OpenStreetMap contributors.
UV data © Open-Meteo (CC BY 4.0).
