# Brief card fonts

Used by `ury/ury/api/chairman_card_png.py` to render Chairman Brief cards as PNG.
Nothing here is downloaded automatically; the owner must approve and drop the files in.

Drop these exact files into this folder (static TTF, Regular weight, plus Bold where noted):

- `NotoSans-Regular.ttf`, `NotoSans-Bold.ttf` (Latin, Rupee sign)
- `NotoSansDevanagari-Regular.ttf`, `NotoSansDevanagari-Bold.ttf` (Hindi)
- `NotoSansArabic-Regular.ttf`, `NotoSansArabic-Bold.ttf` (Arabic)
- `NotoSansMalayalam-Regular.ttf`, `NotoSansMalayalam-Bold.ttf` (Malayalam)

Source: https://github.com/notofonts/notofonts.github.io (per-script release zips) or
https://fonts.google.com/noto (use the static instances, not the variable font).

Licence: SIL Open Font License 1.1. Keep the OFL text with the fonts
(add `OFL.txt` next to them). Total size about 2 MB.

Until they are present the renderer falls back to DejaVu, system fonts, then Pillow's
default font; Latin cards still render, Indic/Arabic text may show missing-glyph boxes.
