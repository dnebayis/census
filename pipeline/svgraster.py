"""A tiny SVG rasteriser built on Pillow alone.

SVG is an accepted input, and reading one should not require a system library:
cairosvg wants libcairo, rsvg-convert wants librsvg, Inkscape wants Inkscape, and on a
fresh machine all three are a detour before anything can be drawn.

Handles a deliberate subset — rect, circle, ellipse, line, polyline, polygon, and path
with M/L/H/V/C/Q/Z, flat fills only. Flat shapes are what survives a 40x40 reduction
anyway. `generate.py` falls back to cairosvg when it is installed and something outside
the subset comes back.
"""

import re
import xml.etree.ElementTree as ET

from PIL import Image, ImageDraw

_NUM = re.compile(r"-?\d*\.?\d+(?:[eE][-+]?\d+)?")

_NAMED = {
    "white": (255, 255, 255), "black": (0, 0, 0),
    "grey": (128, 128, 128), "gray": (128, 128, 128),
}


def _floats(s):
    return [float(x) for x in _NUM.findall(s or "")]


def _colour(v, default=None):
    if not v or v.strip().lower() in ("none", "transparent"):
        return default
    v = v.strip()
    if v.startswith("#"):
        h = v[1:]
        if len(h) == 3:
            h = "".join(c * 2 for c in h)
        if len(h) == 6:
            return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))
    if v.lower().startswith("rgb"):
        n = _floats(v)
        if len(n) >= 3:
            return tuple(int(x) for x in n[:3])
    return _NAMED.get(v.lower(), default)


def _bezier(p0, p1, p2, p3, steps=14):
    out = []
    for i in range(1, steps + 1):
        t = i / steps
        u = 1 - t
        out.append((
            u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t ** 3 * p3[0],
            u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t ** 3 * p3[1],
        ))
    return out


def _path_points(d):
    """Flatten a path into polylines, resolving relative commands."""
    tokens = re.findall(r"[MmLlHhVvCcQqZz]|-?\d*\.?\d+(?:[eE][-+]?\d+)?", d or "")
    subpaths, cur, pos, start = [], [], (0.0, 0.0), (0.0, 0.0)
    i, cmd = 0, None

    def nums(n):
        nonlocal i
        vals = [float(tokens[i + k]) for k in range(n)]
        i += n
        return vals

    while i < len(tokens):
        t = tokens[i]
        if re.match(r"[A-Za-z]", t):
            cmd = t
            i += 1
            if cmd in "Zz":
                if cur:
                    cur.append(start)
                    subpaths.append(cur)
                    cur = []
                pos = start
                continue
        if cmd is None or i >= len(tokens):
            i += 1
            continue

        rel, c = cmd.islower(), cmd.upper()
        try:
            if c == "M":
                x, y = nums(2)
                pos = (pos[0] + x, pos[1] + y) if rel else (x, y)
                if cur:
                    subpaths.append(cur)
                cur, start = [pos], pos
                cmd = "l" if rel else "L"
            elif c == "L":
                x, y = nums(2)
                pos = (pos[0] + x, pos[1] + y) if rel else (x, y)
                cur.append(pos)
            elif c == "H":
                (x,) = nums(1)
                pos = (pos[0] + x if rel else x, pos[1])
                cur.append(pos)
            elif c == "V":
                (y,) = nums(1)
                pos = (pos[0], pos[1] + y if rel else y)
                cur.append(pos)
            elif c == "C":
                v = nums(6)
                p = [(pos[0] + v[k] if rel else v[k], pos[1] + v[k + 1] if rel else v[k + 1])
                     for k in (0, 2, 4)]
                cur.extend(_bezier(pos, p[0], p[1], p[2]))
                pos = p[2]
            elif c == "Q":
                v = nums(4)
                p = [(pos[0] + v[k] if rel else v[k], pos[1] + v[k + 1] if rel else v[k + 1])
                     for k in (0, 2)]
                c1 = (pos[0] + 2 / 3 * (p[0][0] - pos[0]), pos[1] + 2 / 3 * (p[0][1] - pos[1]))
                c2 = (p[1][0] + 2 / 3 * (p[0][0] - p[1][0]), p[1][1] + 2 / 3 * (p[0][1] - p[1][1]))
                cur.extend(_bezier(pos, c1, c2, p[1]))
                pos = p[1]
            else:
                i += 1
        except (IndexError, ValueError):
            break

    if cur:
        subpaths.append(cur)
    return subpaths


def render(svg, size=1024, background=(255, 255, 255)):
    """SVG text -> a square PIL image."""
    root = ET.fromstring(re.sub(r'\sxmlns="[^"]+"', "", svg, count=1))

    vb = _floats(root.get("viewBox") or "")
    if len(vb) == 4:
        vx, vy, vw, vh = vb
    else:
        vw = (_floats(root.get("width") or "100") or [100])[0]
        vh = (_floats(root.get("height") or "100") or [100])[0]
        vx = vy = 0.0

    k = size / max(vw, vh)
    X = lambda v: (v - vx) * k
    Y = lambda v: (v - vy) * k

    img = Image.new("RGB", (size, size), background)
    d = ImageDraw.Draw(img)

    for el in root.iter():
        tag = el.tag.split("}")[-1]
        if tag == "svg":
            continue
        fill = _colour(el.get("fill"), (0, 0, 0))
        stroke = _colour(el.get("stroke"))
        sw = max(1, int((_floats(el.get("stroke-width") or "1") or [1])[0] * k))

        try:
            if tag == "rect":
                x, y = float(el.get("x", 0)), float(el.get("y", 0))
                w, h = float(el.get("width", 0)), float(el.get("height", 0))
                box = [X(x), Y(y), X(x + w), Y(y + h)]
                r = float(el.get("rx", 0) or 0)
                if r:
                    d.rounded_rectangle(box, radius=r * k, fill=fill, outline=stroke, width=sw)
                else:
                    d.rectangle(box, fill=fill, outline=stroke, width=sw)
            elif tag in ("circle", "ellipse"):
                cx, cy = float(el.get("cx", 0)), float(el.get("cy", 0))
                if tag == "circle":
                    rx = ry = float(el.get("r", 0))
                else:
                    rx, ry = float(el.get("rx", 0)), float(el.get("ry", 0))
                d.ellipse([X(cx - rx), Y(cy - ry), X(cx + rx), Y(cy + ry)],
                          fill=fill, outline=stroke, width=sw)
            elif tag in ("polygon", "polyline"):
                p = _floats(el.get("points"))
                pts = [(X(p[j]), Y(p[j + 1])) for j in range(0, len(p) - 1, 2)]
                if len(pts) >= 2:
                    if tag == "polygon":
                        d.polygon(pts, fill=fill, outline=stroke)
                    else:
                        d.line(pts, fill=stroke or fill, width=sw)
            elif tag == "line":
                d.line([X(float(el.get("x1", 0))), Y(float(el.get("y1", 0))),
                        X(float(el.get("x2", 0))), Y(float(el.get("y2", 0)))],
                       fill=stroke or fill, width=sw)
            elif tag == "path":
                for sp in _path_points(el.get("d", "")):
                    pts = [(X(x), Y(y)) for x, y in sp]
                    if len(pts) < 2:
                        continue
                    if fill is not None and len(pts) >= 3:
                        d.polygon(pts, fill=fill, outline=stroke)
                    elif stroke is not None:
                        d.line(pts, fill=stroke, width=sw)
        except (ValueError, TypeError):
            continue  # one malformed element should not lose the whole drawing

    return img
