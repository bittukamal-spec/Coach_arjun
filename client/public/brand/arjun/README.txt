ARJUN BRAND MARK — favicon / PWA / Apple touch icon asset set

This is the pre-refresh Arjun symbol (a bow-and-arrow / brain-arc mark),
restored from git history and recoloured to one consistent Arjun-blue
family. The in-app logo (client/src/components/ArjunLogo.jsx) renders this
same symbol as inline SVG directly — the files here exist only because
browsers require real raster files for the favicon, PWA/install icons and
the Apple touch icon.

Source of truth:
  arjun-mark.svg            — rounded-square field (rx=96), edge to edge.
                               Rasterised for: favicon-16/32/48.png,
                               favicon.ico, pwa-icon-192.png, pwa-icon-512.png
  arjun-mark-maskable.svg   — full-bleed square (no baked corner radius) —
                               the OS applies its own mask shape, per the
                               W3C maskable-icon spec and Apple's touch-icon
                               guidance. Rasterised for:
                               pwa-icon-maskable-512.png,
                               apple-touch-icon-180.png

Colours (all in the Arjun blue/navy family — see --brand-logo in index.css):
  Background         #185FA5  (var(--brand-logo) in the in-app component)
  Primary strokes     #FFFFFF
  Accent stroke       #8ECBFF  (solid, not translucent — stays clean at
                                 small sizes instead of reading muddy)

Regenerating a raster file: open the relevant .svg above, render it at the
target pixel size (e.g. via a headless browser screenshot), save as PNG.
favicon.ico packs the 16/32/48px PNGs into one file (PNG-in-ICO, the format
every current browser reads).

Files:
  favicon-16.png
  favicon-32.png
  favicon-48.png
  (favicon.ico lives at the public root — client/public/favicon.ico —
   because browsers request /favicon.ico directly, by convention)
  pwa-icon-192.png
  pwa-icon-512.png
  pwa-icon-maskable-512.png
  apple-touch-icon-180.png
