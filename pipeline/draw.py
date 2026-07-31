"""Legacy procedural four-tone drawing helper; excluded from production mint builds.

This remains only to inspect historical artifacts. The active v2 format is a 200-byte
one-bit bitmap built from an IDE agent's normal raster portrait; ``generate.py`` rejects
Python drawing scripts as production input.

The historical helper expected a script defining ``draw(c)``:

    def draw(c):
        c.ellipse(14, 20, 11, 10, c.INK)      # head, outer
        c.ellipse(14, 20, 9, 8, c.MID)        # head, inner
        c.mrect(13, 15, 15, 17, c.INK)        # eyes, mirrored
        c.mouth(21, 4, c.INK)

"""

GRID = 40
BG, LIGHT, MID, INK = 0, 1, 2, 3


class Canvas:
    """A 40x40 grid of tones. Origin top-left, row then column."""

    GRID = GRID
    BG, LIGHT, MID, INK = BG, LIGHT, MID, INK

    def __init__(self):
        self.px = [BG] * (GRID * GRID)

    # ---------------------------------------------------------------- basics

    def put(self, r, c, tone):
        if 0 <= r < GRID and 0 <= c < GRID:
            self.px[r * GRID + c] = tone
        return self

    def get(self, r, c):
        if 0 <= r < GRID and 0 <= c < GRID:
            return self.px[r * GRID + c]
        return BG

    def rect(self, r0, c0, r1, c1, tone):
        for r in range(min(r0, r1), max(r0, r1) + 1):
            for c in range(min(c0, c1), max(c0, c1) + 1):
                self.put(r, c, tone)
        return self

    def row(self, r, c0, c1, tone):
        return self.rect(r, c0, r, c1, tone)

    def col(self, c, r0, r1, tone):
        return self.rect(r0, c, r1, c, tone)

    def fill(self, tone):
        self.px = [tone] * (GRID * GRID)
        return self

    def ellipse(self, cr, cc, rr, rc, tone):
        """Filled ellipse centred on (cr, cc) with radii (rr, rc)."""
        for r in range(GRID):
            for c in range(GRID):
                if rr and rc and ((r - cr) / rr) ** 2 + ((c - cc) / rc) ** 2 <= 1.0:
                    self.put(r, c, tone)
        return self

    def poly(self, points, tone):
        """Filled polygon from [(r, c), …], by scanline."""
        if len(points) < 3:
            return self
        rs = [p[0] for p in points]
        for r in range(int(min(rs)), int(max(rs)) + 1):
            xs = []
            for i in range(len(points)):
                r0, c0 = points[i]
                r1, c1 = points[(i + 1) % len(points)]
                if (r0 <= r < r1) or (r1 <= r < r0):
                    xs.append(c0 + (r - r0) * (c1 - c0) / (r1 - r0))
            xs.sort()
            for i in range(0, len(xs) - 1, 2):
                self.row(r, int(round(xs[i])), int(round(xs[i + 1])), tone)
        return self

    # ---------------------------------------------------------------- symmetry
    #
    # The contract warns when the two halves of the signature differ by more than 10
    # bits of 32. Drawing through these makes that score exactly 0, for free.

    def mirror(self, r, c, tone):
        self.put(r, c, tone)
        self.put(r, GRID - 1 - c, tone)
        return self

    def mrect(self, r0, c0, r1, c1, tone):
        for r in range(min(r0, r1), max(r0, r1) + 1):
            for c in range(min(c0, c1), max(c0, c1) + 1):
                self.mirror(r, c, tone)
        return self

    def mrow(self, r, c0, c1, tone):
        return self.mrect(r, c0, r, c1, tone)

    # ---------------------------------------------------------------- features

    def bust(self, top, tone, inner=None, inner_inset=2):
        """Shoulders that widen to the bottom edge and are cut off by it."""
        for r in range(top, GRID):
            half = 7 + (r - top) * 2
            self.mrect(r, max(0, GRID // 2 - half), r, GRID // 2 - 1, tone)
        if inner is not None:
            for r in range(top + inner_inset, GRID):
                half = 7 + (r - top - inner_inset) * 2 - inner_inset
                if half > 0:
                    self.mrect(r, max(0, GRID // 2 - half), r, GRID // 2 - 1, inner)
        return self

    def eyes(self, r, c_from, c_to, tone, height=3, glint=None):
        """A pair of solid blocks. Never draw eyes as lines — they vanish."""
        self.mrect(r, c_from, r + height - 1, c_to, tone)
        if glint is not None:
            self.mirror(r + height // 2, c_to, glint)
        return self

    def mouth(self, r, half_width, tone, height=1):
        return self.mrect(r, GRID // 2 - half_width, r + height - 1, GRID // 2 - 1, tone)

    def outline(self, tone=INK):
        """Trace every lit region with a heavy border.

        The single most effective thing you can do at this size: without it a shape
        dissolves into the background, with it the silhouette reads instantly.
        """
        edge = []
        for r in range(GRID):
            for c in range(GRID):
                if self.get(r, c):
                    continue
                if any(self.get(r + dr, c + dc)
                       for dr, dc in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                    edge.append((r, c))
        for r, c in edge:
            self.put(r, c, tone)
        return self

    # ---------------------------------------------------------------- output

    def density(self):
        return sum(1 for t in self.px if t)

    def preview(self):
        ramp = " .:#"
        return "\n".join(
            "".join(ramp[self.px[r * GRID + c]] for c in range(GRID)) for r in range(GRID)
        )

    def __str__(self):
        return self.preview()


def run(script_path):
    """Execute an agent's drawing script and return its pixels.

    The script must define `draw(c)`. It is run in its own namespace so a stray import
    or a leftover variable cannot leak into the pipeline.
    """
    ns = {}
    with open(script_path) as f:
        code = f.read()
    exec(compile(code, script_path, "exec"), ns)  # noqa: S102 — the agent's own drawing

    fn = ns.get("draw")
    if not callable(fn):
        raise ValueError(
            f"{script_path} must define `draw(c)` — see pipeline/AGENTS.md"
        )

    c = Canvas()
    fn(c)
    if c.density() == 0:
        raise ValueError("the script drew nothing")
    return c.px
