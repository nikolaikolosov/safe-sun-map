# Safe Sun Map

**[nikolaikolosov.github.io/safe-sun-map](https://nikolaikolosov.github.io/safe-sun-map)**

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

There is no dark mode by design: the five bands are only distinguishable from one another over
a light, low-saturation basemap.

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

Buildless static site, deployed straight from `main` by GitHub Pages. `npm` is dev tooling
only; nothing is bundled and there is no server.

```
index.html          markup and the meta-tag CSP
css/styles.css      one screen's worth of styles
src/uv.js           the domain model: bands, rounding, formatting, the API call
src/map.js          Leaflet — basemap, "you are here", the bottom-right controls
src/help.js         the ⓘ sheet: what the index is, the levels, what it does
src/i18n.js         copy in en/es/ru, and the language runtime
src/app.js          wiring: position → reading → wash, and the switcher
tests/uv.test.js    band boundaries, formatting, API failure modes
tests/i18n.test.js  language resolution, persistence, copy completeness
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

MIT — see [LICENSE](LICENSE). Basemap © OpenStreetMap contributors, © CARTO.
UV data © Open-Meteo (CC BY 4.0).
