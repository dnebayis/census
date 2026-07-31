"""Configuration for the Census art pipeline.

Adapted from Basies. Same pipeline shape — assign traits, generate, binarize, save —
with these changes:

  Basies                       Census
  ------                       ------
  1 bit/pixel, 200 bytes       2 bits/pixel, 400 bytes   (SPEC §3.1)
  single threshold at 128      four tone levels
  Gender trait                 removed                   (DECISIONS D12)
  traits are metadata only     traits also build the prompt
  Flux Dev via Replicate       an LLM draws the portrait
  9:16                         1:1, head and shoulders, front facing
"""

# Grid dimensions
GRID_WIDTH = 40
GRID_HEIGHT = 40
TOTAL_PIXELS = GRID_WIDTH * GRID_HEIGHT  # 1600
BITMAP_BYTES = TOTAL_PIXELS // 4  # 400 — four pixels per byte, two bits each

# Tones. 0 background, 3 full ink. A pixel is "lit" when non-zero.
TONE_BG, TONE_LIGHT, TONE_MID, TONE_INK = 0, 1, 2, 3

# Where the background ends. Swept per image to land density in the target band.
BG_CUT_RANGE = (120, 246)

# How lit pixels split across the three ink levels, by percentile of their own
# distribution rather than by fixed grey values. Fixed cut points break on any source
# whose contrast differs from what you assumed; percentiles guarantee a full tonal
# range, which is what stops the contract's FLAT_TONE warning.
TONE_SPLIT = (0.32, 0.68)  # darkest 32% -> ink, next 36% -> mid, rest -> light

# Two-stage downscale. LANCZOS to here, then a BOX area filter to 40x40 — an area
# filter last is what keeps features from ringing into speckle.
INTERMEDIATE = GRID_WIDTH * 8  # 320

# ---------------------------------------------------------------- contract limits

# Hard, enforced on chain (SPEC §4.3). Outside this band `mint` reverts.
DENSITY_MIN = 128  # 8% of 1600
DENSITY_MAX = 1120  # 70%

# Advisory only — reported by validate(), never blocking. Mirrored so the pipeline can
# fix its own output instead of shipping a warning to the chain.
WARN_SYMMETRY = 10  # of 32 comparable signature bits
WARN_CORNER_PCT = 25  # lit share of either 8x8 top corner
WARN_ISOLATED_PCT = 15  # share of lit pixels with no lit orthogonal neighbour
WARN_FULLINK_PCT = 30  # minimum share of lit pixels at tone 3

# What to aim for while sweeping. Comfortably inside the hard band, and about what a
# head-and-shoulders bust actually occupies.
TARGET_DENSITY = (420, 780)

# ---------------------------------------------------------------- generation

# There is no image API here, and no API key anywhere in this pipeline.
#
# The owner talks to their own agent — Codex, or any agent with real image generation —
# and that agent draws the portrait during the conversation. This is the point of the
# project, not an implementation detail: the art is made by the owner's agent, in the
# owner's session.
#
# Claude is deliberately not a supported route. It has no image generation, so its only
# option is writing SVG or a drawing script, and neither produced art good enough at
# 40x40. Both input formats are still accepted — they are provider-neutral and they work
# — but nothing here is built around them.
#
# So what ships is a tool surface, not a generator:
#
#   brief   assign traits, print the drawing brief for the agent
#           ... the agent draws, however it can ...
#   build   take the file back, binarize, check, preview
#   mint    send the transaction
#
# That loop is also the answer to quality. A one-shot API call cannot see that its
# output turned to mud at 40x40; an agent in a chat runs `build`, reads the ASCII
# preview and the warnings, and draws again. Iteration is what a key could never buy.

MAX_RETRIES = 3
MAX_SUPPLY = 10_000

# Accepted inputs from the agent.
# `.py` is the native route: a script that draws straight onto the 40x40 grid,
# with no render-and-discard stage in between.
ACCEPTED_INPUTS = (".py", ".svg", ".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".txt")

# ---------------------------------------------------------------- traits
#
# Named options, not just counts: in Basies the traits were metadata and only the
# character type reached the prompt. Here the traits ARE the description, which is what
# makes ten thousand entries read as one collection instead of ten thousand unrelated
# drawings.
#
# Option 0 is the plain or absent case in most categories, so accessories stay
# genuinely uncommon and the average face stays readable at 40x40.

TRAIT_CATEGORIES = [
    ("Species", [
        "human", "human", "human", "human",
        "cat-like humanoid", "grey alien", "android with visible seams",
        "skull-faced figure", "reptilian humanoid", "ape-like humanoid",
    ]),
    ("Age", ["young", "middle-aged", "old"]),
    ("Hair", [
        "bald", "short cropped hair", "messy shoulder-length hair", "long straight hair",
        "high ponytail", "buzz cut", "afro", "mohawk", "slicked-back hair",
        "twin braids", "topknot", "receding hairline", "wild curly hair",
    ]),
    ("Eyes", [
        "plain eyes", "narrow eyes", "wide staring eyes", "heavy-lidded tired eyes",
        "one eye scarred shut", "round spectacles", "thick square glasses",
        "dark sunglasses", "a single large eye", "goggles pushed up onto the forehead",
        "mirrored visor", "eyepatch",
    ]),
    ("Facial", [
        "clean shaven", "clean shaven", "stubble", "full beard", "goatee",
        "thick moustache", "muttonchops", "a scar across one cheek", "face tattoo",
        "freckles", "gaunt hollow cheeks",
    ]),
    ("Expression", [
        "neutral", "neutral", "slight frown", "faint smile", "grim set jaw",
        "one raised eyebrow", "exhausted", "smirk", "wide-eyed alarm",
    ]),
    ("Headwear", [
        "bare head", "bare head", "bare head", "flat cap", "beanie", "wide-brim hat",
        "hood up", "bandana", "headphones", "crown", "bucket hat", "helmet",
    ]),
    ("Attire", [
        "plain collar", "high collar coat", "hoodie", "suit and tie", "turtleneck",
        "worker overalls", "armoured shoulders", "robe", "bare shoulders",
        "scarf wrapped high",
    ]),
    ("Accessory", [
        "none", "none", "none", "none", "cigarette", "earring", "nose ring",
        "neck tattoo", "bandaged jaw", "monocle", "breathing mask", "collar tag",
    ]),
]

# Options that add nothing to a prompt — dropped from the description so instruction
# budget is not spent telling the model to draw no hat.
TRAIT_SKIP = {
    "bare head", "none", "clean shaven", "plain eyes", "neutral", "plain collar", "bald",
}
