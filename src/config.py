"""Load and validate defaults.yaml into a plain namespace."""
from pathlib import Path
import yaml

_CONFIG_PATH = Path(__file__).parent.parent / "config" / "defaults.yaml"


def load() -> dict:
    with open(_CONFIG_PATH) as f:
        cfg = yaml.safe_load(f)
    _validate(cfg)
    return cfg


def _validate(cfg: dict) -> None:
    weeks = cfg["mesocycle"]["length_weeks"]
    if not (4 <= weeks <= 10):
        raise ValueError(f"mesocycle.length_weeks must be 4–10, got {weeks}")

    ladder = cfg["rir_ladder"]
    if len(ladder) < weeks:
        raise ValueError(
            f"rir_ladder has {len(ladder)} entries but mesocycle is {weeks} weeks; "
            "extend rir_ladder in config/defaults.yaml"
        )

    rmin = cfg["rep_range"]["default_min"]
    rmax = cfg["rep_range"]["default_max"]
    if rmin >= rmax:
        raise ValueError(f"rep_range: min ({rmin}) must be < max ({rmax})")
