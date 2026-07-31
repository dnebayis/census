"""Configuration for the Census 1-bit art pipeline.

Geometry and thresholding use a 40×40 canvas, MSB-first packing, one bit per pixel,
one aspect-preserving LANCZOS cover crop, and threshold 128. Census
changes the source workflow, rendered palette, and persistent nine-trait assignment.
"""

# Grid dimensions
GRID_WIDTH = 40
GRID_HEIGHT = 40
TOTAL_PIXELS = GRID_WIDTH * GRID_HEIGHT  # 1600
BITMAP_BYTES = TOTAL_PIXELS // 8  # 200 — eight pixels per byte, one bit each

# Reserve four final pixels above the portrait while keeping the shoulders anchored to
# the bottom and both side edges. The source is cover-cropped without distortion to
# 40×36 and placed at y=4 on the 40×40 canvas.
PORTRAIT_SIZE = 36
PORTRAIT_TOP = 4

# RAO's fixed binary threshold. Values <=128 are foreground.
THRESHOLD = 128

# ---------------------------------------------------------------- contract limits

# Hard, enforced on chain. The broad band rejects only effectively blank or solid
# uploads; art quality is informational and never a mint gate.
DENSITY_MIN = 16  # 1% of 1600
DENSITY_MAX = 1520  # 95%

# Advisory only — reported by validate(), never blocking. Mirrored so the pipeline can
# fix its own output instead of shipping a warning to the chain.
WARN_SYMMETRY = 10  # of 32 comparable signature bits
WARN_CORNER_PCT = 25  # lit share of either 8x8 top corner
WARN_ISOLATED_PCT = 15  # share of lit pixels with no lit orthogonal neighbour
WARN_DENSITY_HIGH_PCT = 35  # advisory readability risk; never blocks minting

# ---------------------------------------------------------------- generation

# Production art is agent-native: an image-capable IDE agent generates a normal,
# high-contrast portrait source and runs it through `build`. Visual statistics help the
# creator but do not require a redraw.
#
# Script and SVG sources are excluded from the mint path. They made useful deployment
# smoke tests, but they are not the collection's production art workflow.

MAX_RETRIES = 3
MAX_SUPPLY = 10_000

# Accepted production inputs from an image-capable agent.
ACCEPTED_INPUTS = (".png", ".jpg", ".jpeg", ".webp")

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
