"""Single source of truth for the IEC 62304 §5.3 component-type taxonomy.

The medical-device software hierarchy SYSTEM → SUBSYSTEM → ITEM → UNIT is
defined exactly once, here. `router.py`, `baseline_router.py`, schema
validation, and the `GET /architecture/component-types` endpoint all derive
from this — so the taxonomy changes in one place, not seven.

Each entry carries:
  name    — the component-type identifier stored on SWComponent.component_type
  order   — sort rank (also drives UI indent depth)
  parents — which component types are valid as a parent (empty = root type)
  color   — UI text colour for chips/badges
  bg      — UI background colour for chips/badges
"""

COMPONENT_TYPES: list[dict] = [
    {"name": "SYSTEM",    "order": 0, "parents": [],                     "color": "#1a237e", "bg": "#e8eaf6"},
    {"name": "SUBSYSTEM", "order": 1, "parents": ["SYSTEM"],             "color": "#1565c0", "bg": "#e3f2fd"},
    {"name": "ITEM",      "order": 2, "parents": ["SUBSYSTEM"],          "color": "#6a1b9a", "bg": "#f3e5f5"},
    {"name": "UNIT",      "order": 3, "parents": ["ITEM", "SUBSYSTEM"],  "color": "#1b5e20", "bg": "#e8f5e9"},
]

# Derived lookups — built once at import time.
COMPONENT_TYPE_NAMES: list[str] = [t["name"] for t in COMPONENT_TYPES]
VALID_PARENTS: dict[str, set[str]] = {t["name"]: set(t["parents"]) for t in COMPONENT_TYPES}
COMPONENT_TYPE_ORDER: dict[str, int] = {t["name"]: t["order"] for t in COMPONENT_TYPES}
ROOT_COMPONENT_TYPES: set[str] = {t["name"] for t in COMPONENT_TYPES if not t["parents"]}

# Regex alternation for Pydantic Field(pattern=...) — e.g. "^(SYSTEM|SUBSYSTEM|ITEM|UNIT)$"
COMPONENT_TYPE_PATTERN: str = "^(" + "|".join(COMPONENT_TYPE_NAMES) + ")$"
