"""Build the feature illustrations in ury/public/illustrations.

    python3 scripts/illustrations/build.py

Every illustration shares one stage — the travertine plinth, the dotted
orbit, the palette and the shadows of the sign-in artwork — so the set reads
as one family. Each feature only describes its subject. The kitchen pieces
(kitchen-*.svg) are drawn by hand and are not generated here.

Palette: ivory and travertine for surfaces, terracotta clay for the primary
accent, sage for "done / good", honey for "in progress / time".
"""

import math
from pathlib import Path

OUT = Path(__file__).resolve().parents[2] / "ury" / "public" / "illustrations"
W, H = 420, 300

DEFS = """
  <defs>
    <linearGradient id="ivory" x1="0" y1="0" x2="1" y2="1">
      <stop stop-color="#fffefb"/><stop offset=".55" stop-color="#f8f4ec"/><stop offset="1" stop-color="#e3d6c6"/>
    </linearGradient>
    <linearGradient id="paper" x1="0" y1="0" x2="1" y2="1">
      <stop stop-color="#fffefb"/><stop offset="1" stop-color="#f1e9dd"/>
    </linearGradient>
    <linearGradient id="clay" x1="0" y1="0" x2="1" y2="1">
      <stop stop-color="#fba98b"/><stop offset=".45" stop-color="#dc7355"/><stop offset="1" stop-color="#ad482f"/>
    </linearGradient>
    <linearGradient id="clayDeep" x1="0" y1="0" x2="1" y2="1">
      <stop stop-color="#e98c69"/><stop offset=".5" stop-color="#cf6a4b"/><stop offset="1" stop-color="#a5452e"/>
    </linearGradient>
    <linearGradient id="sage" x1="0" y1="0" x2="1" y2="1">
      <stop stop-color="#d5e1c3"/><stop offset=".5" stop-color="#a0b38d"/><stop offset="1" stop-color="#748e68"/>
    </linearGradient>
    <linearGradient id="honey" x1="0" y1="0" x2="1" y2="1">
      <stop stop-color="#ffe6ae"/><stop offset=".5" stop-color="#f2be62"/><stop offset="1" stop-color="#d4953b"/>
    </linearGradient>
    <linearGradient id="kraftTop" x1="0" y1="0" x2="1" y2="1">
      <stop stop-color="#fae6cf"/><stop offset="1" stop-color="#ecd0ae"/>
    </linearGradient>
    <linearGradient id="kraftLeft" x1="0" y1="0" x2="1" y2="1">
      <stop stop-color="#ecd1b0"/><stop offset="1" stop-color="#d9b58d"/>
    </linearGradient>
    <linearGradient id="kraftRight" x1="0" y1="0" x2="1" y2="1">
      <stop stop-color="#d7b089"/><stop offset="1" stop-color="#bf946c"/>
    </linearGradient>
    <linearGradient id="platformSide" x1="80" y1="232" x2="330" y2="290" gradientUnits="userSpaceOnUse">
      <stop stop-color="#f1e1ce"/><stop offset=".53" stop-color="#e1cdb7"/><stop offset="1" stop-color="#cab69e"/>
    </linearGradient>
    <linearGradient id="platformTop" x1="90" y1="205" x2="320" y2="262" gradientUnits="userSpaceOnUse">
      <stop stop-color="#fffdf6"/><stop offset="1" stop-color="#efe5d7"/>
    </linearGradient>
    <radialGradient id="orb" cx=".3" cy=".23" r=".85">
      <stop stop-color="#ffead4"/><stop offset=".42" stop-color="#f4b48b"/><stop offset=".8" stop-color="#d87951"/><stop offset="1" stop-color="#b85f3b"/>
    </radialGradient>
    <radialGradient id="sageOrb" cx=".28" cy=".2" r=".87">
      <stop stop-color="#edf2da"/><stop offset=".45" stop-color="#b7c7a5"/><stop offset="1" stop-color="#708a65"/>
    </radialGradient>
    <filter id="groundShadow" x="-40%" y="-100%" width="180%" height="300%"><feGaussianBlur stdDeviation="12"/></filter>
    <filter id="softShadow" x="-35%" y="-30%" width="180%" height="180%" color-interpolation-filters="sRGB">
      <feDropShadow dx="0" dy="10" stdDeviation="9" flood-color="#836b52" flood-opacity=".15"/>
    </filter>
    <filter id="floatShadow" x="-40%" y="-30%" width="190%" height="190%" color-interpolation-filters="sRGB">
      <feDropShadow dx="3" dy="10" stdDeviation="8" flood-color="#916c50" flood-opacity=".15"/>
    </filter>
    <filter id="smallShadow" x="-40%" y="-40%" width="180%" height="200%" color-interpolation-filters="sRGB">
      <feDropShadow dx="0" dy="4" stdDeviation="4" flood-color="#876046" flood-opacity=".17"/>
    </filter>
  </defs>"""

STAGE = """
  <ellipse cx="210" cy="162" rx="172" ry="110" transform="rotate(-11 210 162)" stroke="#dbc8b1" stroke-opacity=".45" stroke-dasharray="3 9"/>
  <circle cx="46" cy="140" r="3.5" fill="#d2b99b"/>
  <circle cx="378" cy="186" r="3" fill="#d9ad8e"/>
  <circle cx="232" cy="30" r="3" fill="#b3be9d"/>
  <path d="M86 50v10m-5-5h10M352 92v10m-5-5h10" stroke="#c8ad8e" stroke-width="1.8" stroke-linecap="round"/>
  <ellipse cx="210" cy="272" rx="140" ry="18" fill="#9a785a" opacity=".16" filter="url(#groundShadow)"/>
  <path d="M70 236c0-27 63-48 140-48s140 21 140 48v13c0 27-63 48-140 48S70 276 70 249v-13Z" fill="url(#platformSide)"/>
  <ellipse cx="210" cy="236" rx="140" ry="48" fill="url(#platformTop)"/>
  <ellipse cx="210" cy="235" rx="138" ry="46" stroke="#fffdf7" stroke-width="1.5"/>"""


def contact(cx, cy, rx, ry=None):
    """A soft shadow where an object meets the plinth."""
    return f'<ellipse cx="{cx}" cy="{cy}" rx="{rx}" ry="{ry or rx * .2:.1f}" fill="#aa8d6e" opacity=".2" filter="url(#groundShadow)"/>'


def tile(x, y, rot, fill, icon, size=48):
    """A floating rounded tile with a white glyph, like the login's approval tile."""
    shade = {"sage": "#7e966e", "clay": "#a5452e", "honey": "#c48a35"}[fill]
    rim = {"sage": "#dfebcd", "clay": "#ffd8c4", "honey": "#fff1cf"}[fill]
    r = size * .32
    s = size / 48
    return (
        f'<g transform="translate({x} {y}) rotate({rot})" filter="url(#floatShadow)">'
        f'<rect x="2" y="4" width="{size}" height="{size}" rx="{r:.1f}" fill="{shade}"/>'
        f'<rect width="{size}" height="{size}" rx="{r:.1f}" fill="url(#{fill})" stroke="{rim}"/>'
        f'<g transform="scale({s:.3f})" stroke="#fffdf0" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" fill="none">{icon}</g>'
        "</g>"
    )


def orb(cx, cy, r, kind="orb"):
    return f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="url(#{kind})" filter="url(#smallShadow)"/>'


def slip(x, y, rot, w=74, h=92, seal=None):
    """A torn-edge order slip with a few printed lines."""
    teeth = int((w - 6) / 7)
    step = (w - 6) / teeth
    zigzag = "".join(f"l-{step / 2:.2f} 5l-{step / 2:.2f} -5" for _ in range(teeth))
    path = f"M6 0h{w - 12}a6 6 0 0 1 6 6v{h - 6}l-3 0{zigzag}V6a6 6 0 0 1 3-6Z"
    lines = (
        f'<rect x="10" y="12" width="{w * .4:.0f}" height="5" rx="2.5" fill="#bda58b"/>'
        f'<rect x="10" y="23" width="{w * .62:.0f}" height="3" rx="1.5" fill="#ddd0bd"/>'
        f'<path d="M10 35h{w - 20}" stroke="#d9cbb8" stroke-dasharray="3 4"/>'
        f'<rect x="10" y="44" width="{w * .45:.0f}" height="3" rx="1.5" fill="#c6b298"/>'
        f'<rect x="{w - 26}" y="44" width="16" height="3" rx="1.5" fill="#c6b298"/>'
        f'<rect x="10" y="55" width="{w * .52:.0f}" height="3" rx="1.5" fill="#c6b298"/>'
        f'<rect x="{w - 26}" y="55" width="16" height="3" rx="1.5" fill="#c6b298"/>'
    )
    mark = ""
    if seal:
        mark = (
            f'<g transform="translate({w - 20} -12)" filter="url(#smallShadow)">'
            f'<circle cx="14" cy="16" r="14" fill="#b95138"/><circle cx="14" cy="14" r="14" fill="url(#clay)"/>'
            '<path d="m8.5 14 4 4 7.5-9" stroke="#fff9e9" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></g>'
        )
    return (
        f'<g transform="translate({x} {y}) rotate({rot})" filter="url(#floatShadow)">'
        f'<path d="{path}" transform="translate(2 3)" fill="#decfbb"/>'
        f'<path d="{path}" fill="url(#paper)" stroke="#fffef8"/>{lines}{mark}</g>'
    )


def box(cx, base_y, w, d, h, tape=True):
    """An isometric kraft carton standing on the plinth."""
    hw, hd = w / 2, d / 2
    # Corners of the top face; the two visible walls hang h below them.
    a = (cx - hw, base_y - h)          # left
    b = (cx, base_y - h - hd)          # back
    c = (cx + hw, base_y - h)          # right
    f = (cx, base_y - h + hd)          # front
    pts = lambda *ps: " ".join(f"{x:.1f},{y:.1f}" for x, y in ps)
    out = [
        f'<polygon points="{pts(a, f, (f[0], f[1] + h), (a[0], a[1] + h))}" fill="url(#kraftLeft)"/>',
        f'<polygon points="{pts(f, c, (c[0], c[1] + h), (f[0], f[1] + h))}" fill="url(#kraftRight)"/>',
        f'<polygon points="{pts(a, b, c, f)}" fill="url(#kraftTop)" stroke="#fff4e6" stroke-width="1.2"/>',
    ]
    if tape:
        m1 = ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
        m2 = ((f[0] + c[0]) / 2, (f[1] + c[1]) / 2)
        out.append(f'<path d="M{m1[0]:.1f} {m1[1]:.1f}L{m2[0]:.1f} {m2[1]:.1f}" stroke="#dc7355" stroke-width="7" stroke-linecap="round" opacity=".9"/>')
        out.append(f'<path d="M{m2[0]:.1f} {m2[1]:.1f}l0 {h * .45:.1f}" stroke="#c9603f" stroke-width="7" stroke-linecap="round" opacity=".85"/>')
    return "".join(out)


def gear(cx, cy, r, teeth, fill, shade, hole):
    """A chunky gear outline built from its teeth."""
    pts = []
    for i in range(teeth * 2):
        ang = math.pi * i / teeth
        rr = r if i % 2 == 0 else r * .8
        a1, a2 = ang - math.pi / teeth * .42, ang + math.pi / teeth * .42
        pts.append((cx + rr * math.cos(a1), cy + rr * math.sin(a1)))
        pts.append((cx + rr * math.cos(a2), cy + rr * math.sin(a2)))
    d = "M" + " L".join(f"{x:.1f} {y:.1f}" for x, y in pts) + "Z"
    return (
        f'<path d="{d}" transform="translate(0 5)" fill="{shade}"/>'
        f'<path d="{d}" fill="{fill}" stroke="#fffaf0" stroke-width="1.5" stroke-linejoin="round"/>'
        f'<circle cx="{cx}" cy="{cy}" r="{r * .36:.1f}" fill="{hole}"/>'
        f'<circle cx="{cx}" cy="{cy}" r="{r * .36:.1f}" stroke="#fffaf0" stroke-opacity=".7"/>'
    )


CHECK = '<path d="m14 25 7 7 13-15"/>'
CLOCK = '<circle cx="24" cy="24" r="11"/><path d="M24 18v6l4 3"/>'
PLUS = '<path d="M24 14v20M14 24h20"/>'
STAR = '<path d="m24 12 3.6 7.4 8 1.2-5.8 5.6 1.4 8-7.2-3.8-7.2 3.8 1.4-8-5.8-5.6 8-1.2Z" stroke-width="3"/>'
ARROW_UP = '<path d="M15 31 31 15M20 15h11v11"/>'
PIN = '<path d="M24 36s9-8 9-15a9 9 0 0 0-18 0c0 7 9 15 9 15Z" stroke-width="3.4"/><circle cx="24" cy="21" r="3" stroke-width="3"/>'
LOCK = '<rect x="14" y="22" width="20" height="14" rx="3.5"/><path d="M18 22v-4a6 6 0 0 1 12 0v4"/>'
GRID = '<rect x="13" y="13" width="9" height="9" rx="2.5"/><rect x="26" y="13" width="9" height="9" rx="2.5"/><rect x="13" y="26" width="9" height="9" rx="2.5"/><rect x="26" y="26" width="9" height="9" rx="2.5"/>'


def menu():
    card = (
        '<g transform="translate(96 62) rotate(-7)" filter="url(#softShadow)">'
        '<rect x="3" y="5" width="112" height="152" rx="14" fill="#d9c8b3"/>'
        '<rect width="112" height="152" rx="14" fill="url(#paper)" stroke="#fffef8" stroke-width="1.5"/>'
        '<rect x="14" y="14" width="84" height="26" rx="8" fill="url(#clay)"/>'
        '<rect x="24" y="24" width="40" height="5" rx="2.5" fill="#fff4ea"/>'
        '<circle cx="86" cy="27" r="5" fill="#fff4ea" opacity=".7"/>'
        + "".join(
            f'<circle cx="26" cy="{62 + i * 28}" r="9" fill="{c}"/>'
            f'<rect x="42" y="{55 + i * 28}" width="{44 - i * 6}" height="4" rx="2" fill="#bda58b"/>'
            f'<rect x="42" y="{64 + i * 28}" width="30" height="3" rx="1.5" fill="#ddd0bd"/>'
            f'<rect x="88" y="{57 + i * 28}" width="12" height="4" rx="2" fill="#d98264"/>'
            for i, c in enumerate(["#f2dfcc", "#e4ead7", "#f4e1d6"])
        )
        + '<path d="M14 140h84" stroke="#e6dac8" stroke-dasharray="3 4"/></g>'
    )
    plate = (
        contact(262, 232, 66, 13)
        + '<g filter="url(#softShadow)">'
        '<ellipse cx="262" cy="222" rx="70" ry="22" fill="#d9c5ad"/>'
        '<ellipse cx="262" cy="218" rx="70" ry="22" fill="url(#ivory)" stroke="#fffaf0" stroke-width="1.5"/>'
        '<ellipse cx="262" cy="217" rx="50" ry="14" stroke="#e2d2bd" stroke-width="1.5"/>'
        '<path d="M228 214c4-20 18-30 34-30s30 10 34 30c-10 6-58 6-68 0Z" fill="#e7c49a"/>'
        '<path d="M236 206c6-12 16-17 26-17" stroke="#f7e3c4" stroke-width="4" stroke-linecap="round"/>'
        '<path d="m244 196 12-8 5 9-11 8-6-9Zm22-6 12 5-6 10-9-6 3-9Z" fill="#96b080"/>'
        '<circle cx="262" cy="192" r="5" fill="#dc7355"/><circle cx="276" cy="201" r="4.5" fill="#df9870"/>'
        "</g>"
    )
    return card + plate + tile(318, 52, 13, "honey", STAR) + orb(352, 226, 13, "sageOrb")


def purchases():
    return (
        contact(214, 238, 76, 15)
        + f'<g filter="url(#softShadow)">{box(214, 240, 128, 52, 74)}</g>'
        + slip(84, 92, -11, seal=True)
        + tile(318, 60, 12, "sage", CHECK)
        + orb(352, 222, 12, "sageOrb")
        + orb(100, 222, 13)
    )


def inventory():
    jar = (
        contact(300, 232, 30, 8)
        + '<g filter="url(#softShadow)">'
        '<path d="M276 176h48v52c0 7-11 12-24 12s-24-5-24-12v-52Z" fill="#f6efe5" stroke="#fffdf8" stroke-width="1.5"/>'
        '<path d="M279 196h42v30c0 5-9 9-21 9s-21-4-21-9v-30Z" fill="#e8c49a"/>'
        '<circle cx="290" cy="206" r="3" fill="#f7e3c4"/><circle cx="304" cy="216" r="3" fill="#f7e3c4"/><circle cx="296" cy="226" r="2.5" fill="#f7e3c4"/>'
        '<path d="M283 182v38" stroke="#fffefb" stroke-width="4" stroke-linecap="round" opacity=".8"/>'
        '<ellipse cx="300" cy="176" rx="26" ry="8" fill="#748e68"/>'
        '<rect x="274" y="164" width="52" height="13" rx="6" fill="url(#sage)" stroke="#dfebcd"/>'
        "</g>"
    )
    crates = (
        contact(180, 240, 90, 16)
        + '<g filter="url(#softShadow)">'
        + box(148, 248, 76, 34, 46, tape=False)
        + box(216, 252, 76, 34, 46, tape=False)
        + box(180, 206, 76, 34, 44, tape=True)
        + "</g>"
    )
    level = '<path d="M15 33V25M24 33V17M33 33V21"/>'
    return crates + jar + tile(76, 70, -12, "sage", level) + orb(352, 120, 12) + orb(86, 214, 11, "sageOrb")


def recipes():
    card = (
        '<g transform="translate(84 66) rotate(-9)" filter="url(#softShadow)">'
        '<rect x="3" y="5" width="104" height="130" rx="14" fill="#d9c8b3"/>'
        '<rect width="104" height="130" rx="14" fill="url(#paper)" stroke="#fffef8" stroke-width="1.5"/>'
        '<rect x="14" y="16" width="52" height="6" rx="3" fill="#bda58b"/>'
        '<rect x="14" y="28" width="34" height="3" rx="1.5" fill="#ddd0bd"/>'
        + "".join(
            f'<circle cx="19" cy="{48 + i * 15}" r="3.5" fill="{c}"/><rect x="28" y="{46 + i * 15}" width="{56 - i * 7}" height="4" rx="2" fill="#c6b298"/>'
            for i, c in enumerate(["#dc7355", "#a0b38d", "#f2be62", "#a0b38d"])
        )
        + '<path d="M14 112h76" stroke="#e6dac8" stroke-dasharray="3 4"/></g>'
    )
    bowl = (
        contact(258, 236, 70, 13)
        + '<g filter="url(#softShadow)">'
        '<path d="M300 164 330 92" stroke="#cfbba4" stroke-width="6" stroke-linecap="round"/>'
        '<path d="M300 164c-14 2-24 14-20 26s19 14 28 4 8-28-8-30Z" stroke="#e4d6c4" stroke-width="3" fill="none"/>'
        '<path d="M300 164c-4 8-6 18-2 28M300 164c6 6 10 16 8 28" stroke="#e4d6c4" stroke-width="2.5" fill="none"/>'
        '<path d="M192 196c4 28 32 44 66 44s62-16 66-44H192Z" fill="url(#clayDeep)"/>'
        '<ellipse cx="258" cy="196" rx="66" ry="18" fill="#f3d4c2" stroke="#fff3e8" stroke-width="1.5"/>'
        '<ellipse cx="258" cy="198" rx="56" ry="13" fill="#f7e6cf"/>'
        '<path d="M210 210c10 18 30 24 50 24" stroke="#f2a383" stroke-width="4" stroke-linecap="round" opacity=".7"/>'
        "</g>"
        '<path d="M232 182c-6-8 10-12 6-22M260 178c-6-8 10-12 6-22" stroke="#d9c6b0" stroke-width="3" stroke-linecap="round" opacity=".7"/>'
    )
    leaf = (
        '<g transform="translate(338 196) rotate(-30)" filter="url(#smallShadow)">'
        '<path d="M0 0c12-16 34-16 40 0-12 14-30 14-40 0Z" fill="url(#sage)"/><path d="M4 0h32" stroke="#e7efd9" stroke-width="2" stroke-linecap="round"/></g>'
    )
    return card + bowl + leaf + tile(316, 40, 12, "honey", CLOCK, 44)


def tables():
    def chair(x, flip=False):
        s = -1 if flip else 1
        return (
            f'<g transform="translate({x} 0) scale({s} 1)">'
            '<path d="M-16 150v62" stroke="#c9b39b" stroke-width="5" stroke-linecap="round"/>'
            '<rect x="-24" y="144" width="14" height="52" rx="7" fill="url(#clayDeep)"/>'
            '<path d="M-22 198h34" stroke="#c9b39b" stroke-width="5" stroke-linecap="round"/>'
            '<path d="M-20 200v26M8 200v26" stroke="#c9b39b" stroke-width="4.5" stroke-linecap="round"/>'
            '<ellipse cx="-6" cy="196" rx="22" ry="8" fill="url(#clay)"/>'
            "</g>"
        )
    table = (
        contact(210, 236, 110, 16)
        + '<g filter="url(#softShadow)">'
        + chair(118)
        + chair(302, True)
        + '<path d="M204 186h12v44h-12z" fill="#d7c7b6"/>'
        '<ellipse cx="210" cy="232" rx="30" ry="8" fill="#e3d6c6" stroke="#fffaf0"/>'
        '<ellipse cx="210" cy="184" rx="78" ry="24" fill="#d9c5ad"/>'
        '<ellipse cx="210" cy="180" rx="78" ry="24" fill="url(#ivory)" stroke="#fffaf0" stroke-width="1.5"/>'
        '<ellipse cx="186" cy="178" rx="16" ry="5" fill="#f1e5d6"/><ellipse cx="236" cy="180" rx="16" ry="5" fill="#f1e5d6"/>'
        '<path d="M206 164v12M214 164v12" stroke="#c9b39b" stroke-width="2.5" stroke-linecap="round"/>'
        '<ellipse cx="210" cy="164" rx="7" ry="3" fill="#a0b38d"/>'
        "</g>"
    )
    return table + tile(310, 54, 12, "sage", GRID) + orb(110, 70, 15) + orb(356, 214, 11, "sageOrb")


def reservations():
    cal = (
        '<g transform="translate(112 54) rotate(-6)" filter="url(#softShadow)">'
        '<rect x="3" y="5" width="132" height="130" rx="18" fill="#d9c8b3"/>'
        '<rect width="132" height="130" rx="18" fill="url(#paper)" stroke="#fffef8" stroke-width="1.5"/>'
        '<path d="M18 0h96a18 18 0 0 1 18 18v14H0V18A18 18 0 0 1 18 0Z" fill="url(#clay)"/>'
        '<rect x="32" y="-8" width="9" height="20" rx="4.5" fill="#a5452e"/><rect x="91" y="-8" width="9" height="20" rx="4.5" fill="#a5452e"/>'
        + "".join(
            f'<rect x="{16 + c * 21}" y="{46 + r * 20}" width="12" height="10" rx="3" fill="{"#efe5d7" if (r, c) != (2, 3) else "none"}"/>'
            for r in range(4) for c in range(5)
        )
        + '<circle cx="85" cy="91" r="11" fill="url(#sage)"/><path d="m80 91 3.5 3.5 6-7" stroke="#fffdf0" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>'
        "</g>"
    )
    # A "reserved" card standing on the table.
    tent = (
        contact(292, 238, 40, 8)
        + '<g transform="translate(262 170) rotate(5)" filter="url(#softShadow)">'
        '<path d="M14 62h36l6 8H8Z" fill="#d7c7b6"/>'
        '<rect x="2" y="4" width="60" height="60" rx="12" fill="#d9c8b3"/>'
        '<rect width="60" height="60" rx="12" fill="url(#paper)" stroke="#fffef8" stroke-width="1.5"/>'
        '<rect x="12" y="14" width="36" height="7" rx="3.5" fill="url(#clay)"/>'
        '<rect x="12" y="29" width="30" height="4" rx="2" fill="#c6b298"/>'
        '<rect x="12" y="39" width="20" height="4" rx="2" fill="#ddd0bd"/>'
        "</g>"
    )
    return cal + tent + tile(304, 40, 12, "honey", CLOCK) + orb(90, 214, 12, "sageOrb") + orb(358, 150, 9)


def delivery():
    route = '<path d="M96 210c30-60 70-10 110-50s70-40 100-20" stroke="#d9b99b" stroke-width="3" stroke-dasharray="2 9" stroke-linecap="round"/>'
    bag = (
        contact(200, 238, 74, 14)
        + '<g filter="url(#softShadow)">'
        + box(200, 244, 110, 56, 78, tape=False).replace("kraftTop", "clay").replace("kraftLeft", "clayDeep").replace("kraftRight", "clayDeep")
        + '<path d="M172 176c0-20 56-20 56 0" stroke="#8f3c27" stroke-width="7" stroke-linecap="round" fill="none"/>'
        '<path d="M150 200l50 26 50-26" stroke="#fff1e6" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" opacity=".85" fill="none"/>'
        "</g>"
    )
    pin = (
        '<g transform="translate(270 48)" filter="url(#floatShadow)">'
        '<path d="M26 82S0 52 0 28a26 26 0 0 1 52 0c0 24-26 54-26 54Z" fill="#a5452e" transform="translate(2 4)"/>'
        '<path d="M26 82S0 52 0 28a26 26 0 0 1 52 0c0 24-26 54-26 54Z" fill="url(#clay)" stroke="#ffd8c4"/>'
        '<circle cx="26" cy="27" r="10" fill="#fff6ec"/></g>'
        '<ellipse cx="296" cy="146" rx="14" ry="4" fill="#aa8d6e" opacity=".25"/>'
    )
    return route + bag + pin + tile(88, 72, -12, "honey", CLOCK) + orb(352, 222, 12, "sageOrb")


def reports():
    bars = [(-78, 52, "url(#ivory)"), (-34, 84, "url(#clay)"), (10, 66, "url(#ivory)"), (54, 112, "url(#sage)")]
    cols = ""
    for dx, hgt, fill in bars:
        x = 190 + dx
        y = 236 - hgt
        cols += (
            f'<path d="M{x} {y + 6}v{hgt - 6}c0 4 8 7 17 7s17-3 17-7v-{hgt - 6}" fill="#cdb9a2"/>'
            f'<rect x="{x}" y="{y}" width="34" height="{hgt}" rx="10" fill="{fill}" stroke="#fffaf0" stroke-width="1.2"/>'
        )
    trend = '<path d="M118 168 158 134 202 152 262 98" stroke="#8b9f76" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/><circle cx="262" cy="98" r="6" fill="#8b9f76" stroke="#fffaf0" stroke-width="2.5"/>'
    donut = (
        '<g transform="translate(286 42) rotate(10)" filter="url(#floatShadow)">'
        '<rect x="3" y="5" width="76" height="76" rx="20" fill="#d4c4b0"/>'
        '<rect width="76" height="76" rx="20" fill="url(#paper)" stroke="#fffefa" stroke-width="1.5"/>'
        '<circle cx="38" cy="38" r="20" stroke="#efe5d7" stroke-width="10"/>'
        '<circle cx="38" cy="38" r="20" stroke="#dc7355" stroke-width="10" stroke-dasharray="70 126" transform="rotate(-90 38 38)"/>'
        '<circle cx="38" cy="38" r="20" stroke="#a0b38d" stroke-width="10" stroke-dasharray="34 126" stroke-dashoffset="-70" transform="rotate(-90 38 38)"/>'
        "</g>"
    )
    return contact(206, 238, 100, 14) + f'<g filter="url(#softShadow)">{cols}</g>' + trend + donut + tile(70, 76, -12, "sage", ARROW_UP, 44)


def feedback():
    bubble = (
        '<g transform="translate(104 58) rotate(-4)" filter="url(#softShadow)">'
        '<path d="M24 0h150a24 24 0 0 1 24 24v58a24 24 0 0 1-24 24H70l-30 26 4-26H24A24 24 0 0 1 0 82V24A24 24 0 0 1 24 0Z" fill="#d9c8b3" transform="translate(3 5)"/>'
        '<path d="M24 0h150a24 24 0 0 1 24 24v58a24 24 0 0 1-24 24H70l-30 26 4-26H24A24 24 0 0 1 0 82V24A24 24 0 0 1 24 0Z" fill="url(#paper)" stroke="#fffef8" stroke-width="1.5"/>'
        + "".join(
            f'<path transform="translate({22 + i * 32} 26)" d="m14 0 4.1 8.5 9.3 1.3-6.7 6.6 1.6 9.3L14 21.3l-8.3 4.4 1.6-9.3L.6 9.8l9.3-1.3Z" fill="{"url(#honey)" if i < 4 else "#efe5d7"}"/>'
            for i in range(5)
        )
        + '<rect x="24" y="70" width="96" height="5" rx="2.5" fill="#c6b298"/><rect x="24" y="82" width="62" height="4" rx="2" fill="#ddd0bd"/>'
        "</g>"
    )
    heart = (
        '<g transform="translate(300 156)" filter="url(#floatShadow)">'
        '<path d="M26 46S0 30 0 14A13 13 0 0 1 26 8a13 13 0 0 1 26 6c0 16-26 32-26 32Z" fill="#a5452e" transform="translate(1 4)"/>'
        '<path d="M26 46S0 30 0 14A13 13 0 0 1 26 8a13 13 0 0 1 26 6c0 16-26 32-26 32Z" fill="url(#clay)" stroke="#ffd8c4"/>'
        '<path d="M10 14c0-4 3-7 7-7" stroke="#ffe0c5" stroke-width="3" stroke-linecap="round" opacity=".7"/></g>'
    )
    smile = '<path d="M15 27c4 5 14 5 18 0"/><path d="M18 19v1M30 19v1"/>'
    return contact(210, 238, 80, 12) + bubble + heart + tile(84, 168, -10, "sage", smile, 44) + orb(330, 74, 12)


def offers():
    tag = (
        '<g transform="translate(120 70) rotate(-16)" filter="url(#softShadow)">'
        '<path d="M0 22 22 0h92a14 14 0 0 1 14 14v76a14 14 0 0 1-14 14H22L0 82Z" fill="#a5452e" transform="translate(3 5)"/>'
        '<path d="M0 22 22 0h92a14 14 0 0 1 14 14v76a14 14 0 0 1-14 14H22L0 82Z" fill="url(#clay)" stroke="#ffd8c4" stroke-width="1.5"/>'
        '<circle cx="22" cy="52" r="7" fill="#f8efe5"/>'
        '<path d="M58 72 92 32" stroke="#fff6ec" stroke-width="6" stroke-linecap="round"/>'
        '<circle cx="62" cy="38" r="8" stroke="#fff6ec" stroke-width="5"/><circle cx="88" cy="68" r="8" stroke="#fff6ec" stroke-width="5"/>'
        "</g>"
        '<path d="M126 92c-26-10-40 2-46 20" stroke="#c9b39b" stroke-width="2.5" stroke-linecap="round" fill="none"/>'
    )
    coupon = (
        contact(268, 236, 66, 10)
        + '<g transform="translate(206 168) rotate(8)" filter="url(#softShadow)">'
        '<path d="M0 10A10 10 0 0 1 10 0h112a10 10 0 0 1 10 10v12a10 10 0 0 0 0 20v12a10 10 0 0 1-10 10H10A10 10 0 0 1 0 54V42a10 10 0 0 0 0-20Z" fill="url(#paper)" stroke="#fffef8" stroke-width="1.5"/>'
        '<path d="M92 8v48" stroke="#e1d2bf" stroke-width="2" stroke-dasharray="4 4"/>'
        '<rect x="14" y="16" width="56" height="8" rx="4" fill="url(#honey)"/>'
        '<rect x="14" y="32" width="40" height="4" rx="2" fill="#c6b298"/><rect x="14" y="42" width="28" height="4" rx="2" fill="#ddd0bd"/>'
        '<circle cx="112" cy="32" r="9" fill="url(#sage)"/><path d="m108 32 3 3 5-6" stroke="#fffdf0" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>'
        "</g>"
    )
    spark = '<path d="M24 12v8M24 28v8M12 24h8M28 24h8"/>'
    return tag + coupon + tile(310, 48, 12, "honey", spark, 44) + orb(96, 210, 12, "sageOrb")


def orders():
    stack = "".join(slip(140 + i * 26, 96 - i * 12, -8 + i * 7, w=80, h=104, seal=(i == 2)) for i in range(3))
    return contact(214, 236, 90, 14) + stack + tile(76, 70, -12, "honey", CLOCK, 44) + orb(350, 214, 12, "sageOrb") + orb(338, 70, 14)


def setup():
    return (
        contact(200, 236, 84, 14)
        + '<g filter="url(#softShadow)">'
        + gear(186, 168, 62, 10, "url(#ivory)", "#d3c2ad", "#efe5d7")
        + gear(270, 204, 34, 8, "url(#clay)", "#a5452e", "#f3d4c2")
        + "</g>"
        + tile(304, 48, 12, "sage", CHECK)
        + orb(92, 84, 14)
        + orb(102, 222, 10, "sageOrb")
    )


def unavailable():
    sign = (
        '<path d="M210 38 154 96M210 38l56 58" stroke="#c9b39b" stroke-width="3" stroke-linecap="round"/>'
        '<circle cx="210" cy="36" r="6" fill="url(#clay)" stroke="#fff3e8"/>'
        '<g transform="translate(118 92) rotate(-3)" filter="url(#softShadow)">'
        '<rect x="3" y="5" width="184" height="96" rx="22" fill="#d9c8b3"/>'
        '<rect width="184" height="96" rx="22" fill="url(#paper)" stroke="#fffef8" stroke-width="1.5"/>'
        '<rect x="12" y="12" width="160" height="72" rx="14" stroke="#eadbc8" stroke-width="2" stroke-dasharray="4 5"/>'
        '<g transform="translate(26 22)"><rect width="52" height="52" rx="16" fill="url(#clay)"/>'
        '<g transform="translate(2 2)" stroke="#fffdf0" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" fill="none">' + LOCK + "</g></g>"
        '<rect x="92" y="34" width="62" height="7" rx="3.5" fill="#bda58b"/><rect x="92" y="49" width="44" height="5" rx="2.5" fill="#ddd0bd"/>'
        "</g>"
    )
    return contact(210, 240, 70, 10) + sign + orb(326, 210, 14, "sageOrb") + orb(96, 208, 11) + tile(316, 40, 10, "honey", CLOCK, 40)


SUBJECTS = {
    "menu": menu,
    "purchases": purchases,
    "inventory": inventory,
    "recipes": recipes,
    "tables": tables,
    "reservations": reservations,
    "delivery": delivery,
    "reports": reports,
    "feedback": feedback,
    "offers": offers,
    "orders": orders,
    "setup": setup,
    "unavailable": unavailable,
}


def build():
    OUT.mkdir(parents=True, exist_ok=True)
    for name, draw in SUBJECTS.items():
        svg = (
            f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}" fill="none">'
            f"{DEFS}{STAGE}\n  {draw()}\n</svg>\n"
        )
        (OUT / f"{name}.svg").write_text(svg, encoding="utf-8")
        print(f"{name}.svg  {len(svg) / 1024:.1f} KB")


if __name__ == "__main__":
    build()
