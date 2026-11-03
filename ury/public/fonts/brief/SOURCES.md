# Font sources (downloaded 2026-11-03, SIL OFL 1.1, owner approved)

Static TTFs from the official notofonts org (https://github.com/notofonts/notofonts.github.io), path fonts/<Family>/full/ttf/.

| File | URL | Bytes | sha256 |
|---|---|---|---|
| NotoSans-Bold.ttf | https://raw.githubusercontent.com/notofonts/notofonts.github.io/main/fonts/NotoSans/full/ttf/NotoSans-Bold.ttf | 838072 | 3a08a47daa00cade516425c15c57615aef2fd418ec9811a7b9f465088f92cc05 |
| NotoSans-Regular.ttf | https://raw.githubusercontent.com/notofonts/notofonts.github.io/main/fonts/NotoSans/full/ttf/NotoSans-Regular.ttf | 825628 | f5f552c8c5edb61fe6efb824baf4d4de47b1a8689ab4925ff43f7bd6a4ebece5 |
| NotoSansArabic-Bold.ttf | https://raw.githubusercontent.com/notofonts/notofonts.github.io/main/fonts/NotoSansArabic/full/ttf/NotoSansArabic-Bold.ttf | 298372 | 5ccd1a8914f7c7e8aa8050f2c7c37b10fc5e855f06583c2a2248a436aad3fc0f |
| NotoSansArabic-Regular.ttf | https://raw.githubusercontent.com/notofonts/notofonts.github.io/main/fonts/NotoSansArabic/full/ttf/NotoSansArabic-Regular.ttf | 271652 | 7ed3fe069312aceac454f17cf613a30f95271d6ed7ce58005ed4d016bd3823d7 |
| NotoSansDevanagari-Bold.ttf | https://raw.githubusercontent.com/notofonts/notofonts.github.io/main/fonts/NotoSansDevanagari/full/ttf/NotoSansDevanagari-Bold.ttf | 274920 | 6caddbb6add29ac171bc243181647fe427f4a7ed35c47cad42e3f79b37305373 |
| NotoSansDevanagari-Regular.ttf | https://raw.githubusercontent.com/notofonts/notofonts.github.io/main/fonts/NotoSansDevanagari/full/ttf/NotoSansDevanagari-Regular.ttf | 277680 | 573e525d9f4923d34645fe752475419f45f8dec5a8e43f3e83c5c5f43d1f2ff9 |
| NotoSansMalayalam-Bold.ttf | https://raw.githubusercontent.com/notofonts/notofonts.github.io/main/fonts/NotoSansMalayalam/full/ttf/NotoSansMalayalam-Bold.ttf | 155584 | a6832b5b45e271240967cb7c941f37788486710e25973f7400d26ec14ad33d2e |
| NotoSansMalayalam-Regular.ttf | https://raw.githubusercontent.com/notofonts/notofonts.github.io/main/fonts/NotoSansMalayalam/full/ttf/NotoSansMalayalam-Regular.ttf | 150284 | d18b5c10d85bba3d3d89775484bcfa731112f501ac070793ddbda5a36992520f |

Licences (from the per-script repos in the same org):

- OFL-latin-greek-cyrillic.txt: https://raw.githubusercontent.com/notofonts/latin-greek-cyrillic/main/OFL.txt sha256 cee9892f9f0cc8fe882c9e9537ee6a89621d86ee7ceaf70b02e2b2b1c25c061a (OFL.txt is a copy of the latin one)
- OFL-devanagari.txt: https://raw.githubusercontent.com/notofonts/devanagari/main/OFL.txt sha256 a216f6f8d85c7228093e0ee5e258d9d377e6671f68acb4db1930b29583d0f331 (OFL.txt is a copy of the latin one)
- OFL-arabic.txt: https://raw.githubusercontent.com/notofonts/arabic/main/OFL.txt sha256 a7a5a25eb188bf1cd96982030d53e23c33485c69b1044a562254226857ee13af (OFL.txt is a copy of the latin one)
- OFL-malayalam.txt: https://raw.githubusercontent.com/notofonts/malayalam/main/OFL.txt sha256 1df18163a0bf60f02131401ba1609df90051f40c4047684dda1c8a2e9586f7f2 (OFL.txt is a copy of the latin one)

Verified with Pillow ImageFont: each face loads and has glyphs for the Rupee sign (NotoSans), Devanagari, Arabic and Malayalam samples. The repo-root LICENSE of notofonts.github.io is Apache-2.0 (tooling), so it was not used as the font licence.
