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

# Census default binary threshold. Values <=128 are foreground.
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
MAX_SUPPLY = 5_000

# Draft-local density calibration. The collection-wide conversion remains threshold
# 128; only a draft whose default preview exceeds 45% is offered lighter candidates.
CALIBRATION_TRIGGER_PCT = 45
CALIBRATION_TARGET_MIN_PCT = 32
CALIBRATION_TARGET_MAX_PCT = 42
CALIBRATION_THRESHOLDS = (120, 112, 104, 96, 88, 80, 72, 64, 56, 48, 40)
NEAR_DUPLICATE_PIXELS = 24

# Accepted production inputs from an image-capable agent.
ACCEPTED_INPUTS = (".png", ".jpg", ".jpeg", ".webp")

# ---------------------------------------------------------------- traits
#
# Named options, not just counts. Every trait reaches the prompt, so the visible
# portrait and immutable onchain vocabulary describe the same entry.
#
# Option 0 is the plain or absent case in most categories, so accessories stay
# genuinely uncommon and the average face stays readable at 40x40.

TRAIT_CATEGORIES = [
    ("Species", [
        "Human", "Cat-like Humanoid", "Grey Alien", "Android with Visible Seams",
        "Skull-faced Figure", "Reptilian Humanoid", "Ape-like Humanoid",
        "Insectoid Humanoid", "Aquatic Humanoid", "Horned Alien",
        "Crystalline Being", "Avian Humanoid",
    ]),
    ("Age", ["Young", "Middle-aged", "Old"]),
    ("Hair", [
        "Bald", "Short Cropped Hair", "Messy Shoulder-length Hair", "Long Straight Hair",
        "High Ponytail", "Buzz Cut", "Afro", "Mohawk", "Slicked-back Hair",
        "Twin Braids", "Topknot", "Receding Hairline", "Wild Curly Hair",
        "Textured Crop", "Dreadlocks", "Bob Cut", "Shaved Geometric Pattern",
    ]),
    ("Eyes", [
        "Plain Eyes", "Narrow Eyes", "Wide Staring Eyes", "Heavy-lidded Tired Eyes",
        "One Eye Scarred Shut", "Round Spectacles", "Thick Square Glasses",
        "Dark Sunglasses", "Single Large Eye", "Forehead Goggles", "Mirrored Visor",
        "Eyepatch", "VR Headset", "Cybernetic Lens", "Luminous Eyes",
        "Wraparound Glasses",
    ]),
    ("Facial", [
        "Clean Shaven", "Stubble", "Full Beard", "Goatee", "Thick Moustache",
        "Muttonchops", "Scar Across One Cheek", "Face Tattoo", "Freckles",
        "Gaunt Hollow Cheeks", "Circuit Seams", "Ritual Markings", "Facial Piercings",
        "Split Brow Scar",
    ]),
    ("Expression", [
        "Neutral", "Slight Frown", "Faint Smile", "Grim Set Jaw",
        "One Raised Eyebrow", "Exhausted", "Smirk", "Wide-eyed Alarm",
        "Focused", "Curious", "Stern", "Calm",
    ]),
    ("Headwear", [
        "Bare Head", "Flat Cap", "Beanie", "Wide-brim Hat", "Hood Up", "Bandana",
        "Headphones", "Crown", "Bucket Hat", "Helmet", "Pilot Cap", "Antenna Crown",
        "Tech Hood", "Open-face Space Helmet", "Head Wrap", "Visored Cap",
    ]),
    ("Attire", [
        "Plain Collar", "High Collar Coat", "Hoodie", "Suit and Tie", "Turtleneck",
        "Worker Overalls", "Armoured Shoulders", "Robe", "Bare Shoulders",
        "Scarf Wrapped High", "Techwear Jacket", "Flight Suit", "Ceremonial Armour",
        "Utility Vest",
    ]),
    ("Accessory", [
        "None", "Cigarette", "Earring", "Nose Ring", "Neck Tattoo", "Bandaged Jaw",
        "Monocle", "Breathing Mask", "Collar Tag", "Holographic Earpiece",
        "Respirator", "Data Cable", "Neck Interface", "Ear Cuff", "Temple Implant",
        "Shoulder Badge",
    ]),
]

# Integer weights keep deterministic selection independent of floating-point behavior.
# Species weights are the exact 5K target counts. Other categories preserve the old
# relative emphasis while making the new values uncommon.
TRAIT_WEIGHTS = {
    "Species": [2000, 400, 400, 400, 300, 350, 350, 250, 250, 200, 50, 50],
    "Age": [1, 1, 1],
    "Hair": [10] * 13 + [2, 2, 2, 2],
    "Eyes": [10] * 12 + [1, 3, 3, 3],
    "Facial": [20] + [10] * 9 + [2, 2, 2, 2],
    "Expression": [20] + [10] * 7 + [3, 3, 3, 3],
    "Headwear": [30] + [10] * 9 + [2, 1, 2, 2, 2, 2],
    "Attire": [10] * 10 + [2, 2, 2, 2],
    "Accessory": [40] + [10] * 8 + [2, 2, 1, 2, 2, 2, 2],
}

# Options that add nothing to a prompt — dropped from the description so instruction
# budget is not spent telling the model to draw no hat.
TRAIT_SKIP = {
    "Bare Head", "None", "Clean Shaven", "Plain Eyes", "Neutral", "Plain Collar", "Bald",
}
