# Line 3 ATS track explorer

The protected `/#/ats` page contains the interactive Line 3 diagram. It uses a same-origin copy at `/ats/line3/index.html`, bundled in `public/ats/line3/`, rather than depending on the separately hosted prototype.

The existing protected-page unlock controls whether the ATS page renders the diagram. The existing Cloudflare authentication middleware also applies to the diagram's files; they are not added to the public login asset allowlist.

The diagram includes 22 station areas, 291 track IDs, 139 signal IDs and 29 point numbers transcribed from the supplied ATS photographs. It retains leading zeroes, A/B suffixes, MV signals, the Sultanah centre track and Jarir CS-1 siding. Unreadable labels remain unnumbered. Photographs and uploads are not bundled.

Numbers use large, contrasting labels. The diagram fills the ATS workspace below Railog's navigation, without a section banner or surrounding padding. It opens in an expanded view with station search, pan/zoom, a station navigator, a full-screen button, station notes and an optional illustrative demo. The iframe allows full screen. Browser support determines whether device full screen is available.

Geometry and asset spacing are schematic. The display has no live ATS connection, train control, routing or interlocking. It does not update train-removal or other operational records. Notes and saved stations use browser-local storage under `line3-workspace-v1`; they are not uploaded to Railog.

## Files and maintenance

- `src/components/ATSWorkspace.jsx`: protected section and same-origin viewer.
- `public/ats/line3/data.js`: station names and codes.
- `public/ats/line3/assets-data.js`: verified identifiers and schematic placement data.
- `public/ats/line3/app.js`: SVG drawing, navigation and local interactions.
- `public/ats/line3/style.css`: diagram and label styling, isolated inside the iframe.
- `public/ats/line3/index.html` and `assets/favicon.svg`: standalone entry point.

Vite copies these public files to the production output. Keep asset paths relative to the diagram directory, and retain the existing authentication middleware and protected-page unlock.
