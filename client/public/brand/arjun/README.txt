ARJUN LOGO — Teer's head (founder pick "Calm smile", Nov 2026)

The logo is a flat drawing of Teer, Arjun's mascot: round blue head, sun
headband with a white arrow, golden feather, calm smile. The in-app logo
(client/src/components/ArjunLogo.jsx) draws the same shapes inline; the
files here exist because browsers, phones and email clients need real files.

Source of truth (regenerate the PNGs from these by rendering them at the
target size, e.g. a headless-browser screenshot with a transparent background):
  teer-mark.svg             — head only, transparent. → favicon-16/32/48.png,
                              favicon.ico (client/public/favicon.ico, 16/32/48)
  arjun-mark.svg            — head on a white rounded square (rx 112/512).
                              → pwa-icon-192.png, pwa-icon-512.png. Also the
                              logo in founder emails (server/src/services/
                              founderEmail.js uses pwa-icon-192.png).
  arjun-mark-maskable.svg   — full-bleed white square, head inside the 70%
                              safe zone (the phone applies its own mask).
                              → pwa-icon-maskable-512.png, apple-touch-icon-180.png

The founder dashboard has its own copy: founder-dashboard/public/teer-mark.svg.
Colours: blue #1B4DFF, shade #1238C9, sun #FFC629, ink #101533, iris #6B3A1E.
