# URY SAR Sign (one-glyph web font)

U+20C1 SAUDI RIYAL SIGN is not in any common UI font yet. The apps ship a one-glyph font,
`URY SAR Sign` (unicode-range U+20C1, ~1.6 KB WOFF, inlined as base64 in `pos/src/index.css`,
`frontend/src/index.css` and `serve/src/index.css`), used only when the currency is SAR.

## Source and licence

The outline is built by `make_sar_font.py` (fontTools) from the stroke geometry of the Lucide
`saudi-riyal` icon, https://github.com/lucide-icons/lucide (icons/saudi-riyal.svg), taken from the
`lucide-react` 0.525.0 package (`dist/esm/icons/saudi-riyal.js`).
That icon is not one of the Feather-derived icons, so it is covered by Lucide's ISC licence only
(permissive; allows use, modification and redistribution, including embedded in a font, provided
the notice below is kept):

    ISC License

    Copyright (c) for portions of Lucide are held by Cole Bemis 2013-2022 as part of Feather (MIT). All other copyright (c) for Lucide are held by Lucide Contributors 2022.

    Permission to use, copy, modify, and/or distribute this software for any
    purpose with or without fee is hereby granted, provided that the above
    copyright notice and this permission notice appear in all copies.

    THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
    WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
    MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
    ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
    WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
    ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
    OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.

The glyph approximates, and is not, the official SAMA artwork. To use the exact artwork, replace
the outline in `make_sar_font.py` and re-embed the output. The text stays real U+20C1, so a font
that gains the code point natively will take over.

## If the licence is ever a problem

Replace the web font with an inline SVG component for the sign (same Lucide paths); the formatter
output (`SAR_SIGN`) is the only coupling.
