"""Native 40x40 rollout portrait for the first hardened-core entry."""


def draw(c):
    # Hoodie and shoulders.
    c.bust(27, c.INK, c.MID, 2)
    c.mrect(29, 13, 39, 19, c.LIGHT)

    # Long hair silhouette and face.
    c.ellipse(18, 20, 12, 10, c.INK)
    c.ellipse(18, 20, 9, 7, c.LIGHT)
    c.mrect(17, 10, 29, 12, c.INK)

    # Beanie with a deliberately stepped crown.
    c.mrect(7, 15, 9, 19, c.INK)
    c.mrect(5, 17, 6, 19, c.INK)
    c.mrow(10, 13, 19, c.MID)

    # Tired eyes, heavy moustache, and smirk.
    c.eyes(17, 14, 16, c.INK, height=2)
    c.mrow(22, 15, 19, c.INK)
    c.mrow(23, 16, 19, c.INK)
    c.mouth(25, 3, c.MID)
