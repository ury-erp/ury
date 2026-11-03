# Fonts

`almarai-400.woff2`, `almarai-700.woff2`: Almarai (Regular and Bold), the Arabic UI face used when the document direction is RTL (`html[dir='rtl']`, see `src/index.css`).

- Source: https://fonts.google.com/specimen/Almarai (https://github.com/JuergenWillrodt/Almarai)
- Licence: SIL Open Font License 1.1, see `OFL.txt`. The OFL permits bundling, embedding and redistribution with software, including commercial use; the font must not be sold on its own and the licence/copyright notice must travel with it.
- Latin text in RTL mode also renders in Almarai; English/LTR UI keeps Geist and never loads these files (`font-display: swap`, files are fetched only when an RTL page uses them).
