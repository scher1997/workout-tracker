"""
Pure-Python recommendation logic — no spreadsheet dependency.
All functions return plain values so they can be unit-tested and
also serve as the reference implementation for the sheet formulas.
"""
import math


# ---------------------------------------------------------------------------
# Weight helpers
# ---------------------------------------------------------------------------

def round_to_increment(value: float, increment: float = 2.5) -> float:
    """Round value to the nearest increment (e.g. 2.5 lb)."""
    return round(value / increment) * increment


def next_weight(current_weight: float, bump_pct: float = 0.05, increment: float = 2.5) -> float:
    """
    Increase weight by bump_pct, round to increment, enforce minimum one step up.
    Example: 15 lb → 15.75 → rounds to 15 → forced to 17.5
    """
    raw = current_weight * (1 + bump_pct)
    rounded = round_to_increment(raw, increment)
    min_next = round_to_increment(current_weight + increment, increment)
    return max(rounded, min_next)


# ---------------------------------------------------------------------------
# Volume-matched reps
# ---------------------------------------------------------------------------

def volume_matched_reps(prev_weight: float, prev_reps: int, new_weight: float) -> int:
    """
    Maintain volume (weight × reps) when weight changes.
    Example: 15 lb × 15 reps = 225; at 17.5 lb → floor(225/17.5) = 12 reps
    Always returns at least 1.
    """
    if new_weight <= 0:
        raise ValueError("new_weight must be positive")
    return max(1, math.floor((prev_weight * prev_reps) / new_weight))


# ---------------------------------------------------------------------------
# RIR ladder
# ---------------------------------------------------------------------------

def target_rir(week: int, ladder: list[int]) -> int:
    """
    Return the target RIR for a given 1-based week number.
    Falls back to 0 (all-out) if week exceeds the ladder.
    """
    idx = week - 1
    if idx < len(ladder):
        return ladder[idx]
    return 0


# ---------------------------------------------------------------------------
# Rep progression
# ---------------------------------------------------------------------------

def next_reps(
    prev_reps: int,
    pump: str,          # "great" | "mid" | "none"
    pump_rep_add: dict, # from config
    rep_min: int = 8,
) -> int:
    add = pump_rep_add.get(pump, 1)
    return max(rep_min, prev_reps + add)


# ---------------------------------------------------------------------------
# Weight-bump decision
# ---------------------------------------------------------------------------

def needs_weight_bump(reps: int, rep_ceiling: int = 13, rep_hard_ceiling: int = 15) -> bool:
    return reps >= rep_ceiling


def weight_bump_mandatory(reps: int, rep_hard_ceiling: int = 15) -> bool:
    return reps >= rep_hard_ceiling


# ---------------------------------------------------------------------------
# Tendon pain rule
# ---------------------------------------------------------------------------

def apply_tendon_rule(
    prev_weight: float,
    prev_reps: int,
    prev_sets: int,
    tendon: str,  # "bad" | "neutral" | "good"
    tendon_cfg: dict,
) -> dict:
    """
    Returns recommended weight, reps, sets, and rep_push flag.
    When tendon is bad: hold weight, drop one set, no rep push.
    """
    rule = tendon_cfg[tendon]
    weight = prev_weight if rule["hold_weight"] else None  # None = caller uses normal calc
    sets = max(1, prev_sets + rule["set_delta"])
    return {
        "weight": weight,
        "reps": prev_reps if not rule["rep_push"] else None,  # None = caller uses normal calc
        "sets": sets,
        "rep_push": rule["rep_push"],
    }


# ---------------------------------------------------------------------------
# Soreness rule
# ---------------------------------------------------------------------------

def apply_soreness_rule(
    target_rir_val: int,
    planned_sets: int,
    soreness: str,              # "none" | "mild" | "still_sore"
    consecutive_sore_weeks: int,
    soreness_cfg: dict,
) -> dict:
    rule = soreness_cfg[soreness]
    adjusted_rir = target_rir_val + rule["rir_adjust"]
    sets = planned_sets
    flag_under_recovered = False

    if rule["hold_sets"]:
        sets = planned_sets  # no increase allowed
        if consecutive_sore_weeks >= 2:
            sets = max(1, planned_sets - 1)
            flag_under_recovered = True

    return {
        "target_rir": adjusted_rir,
        "sets": sets,
        "flag_under_recovered": flag_under_recovered,
    }


# ---------------------------------------------------------------------------
# Muscle connection rule
# ---------------------------------------------------------------------------

def apply_connection_rule(connection: str, consecutive_not_at_all: int) -> dict:
    flag_technique = connection == "not_at_all"
    flag_swap = flag_technique and consecutive_not_at_all >= 2
    return {"flag_technique": flag_technique, "flag_swap": flag_swap}


# ---------------------------------------------------------------------------
# Master recommendation
# ---------------------------------------------------------------------------

def recommend(
    *,
    week: int,
    prev_weight: float,
    prev_reps: int,
    prev_sets: int,
    pump: str,
    tendon: str,
    connection: str,
    soreness: str,
    consecutive_sore_weeks: int = 0,
    consecutive_not_at_all: int = 0,
    cfg: dict,
) -> dict:
    """
    Combine all rules and return a recommendation dict with keys:
    weight, reps, sets, target_rir, flags (list of strings).
    """
    flags = []

    # --- soreness first (adjusts RIR and possibly sets) ---
    t_rir = target_rir(week, cfg["rir_ladder"])
    soreness_result = apply_soreness_rule(
        t_rir, prev_sets, soreness, consecutive_sore_weeks, cfg["soreness"]
    )
    t_rir = soreness_result["target_rir"]
    rec_sets = soreness_result["sets"]
    if soreness_result["flag_under_recovered"]:
        flags.append("UNDER_RECOVERED: consider trimming a set")

    # --- tendon pain ---
    tendon_result = apply_tendon_rule(
        prev_weight, prev_reps, rec_sets, tendon, cfg["tendon_pain"]
    )
    rec_sets = tendon_result["sets"]
    if tendon == "bad":
        flags.append("TENDON_PAIN: maintenance week — hold weight, -1 set, no rep push")

    # --- muscle connection ---
    conn_result = apply_connection_rule(connection, consecutive_not_at_all)
    if conn_result["flag_technique"]:
        flags.append("CONNECTION: check technique")
    if conn_result["flag_swap"]:
        flags.append("CONNECTION: consider swapping exercise (2 weeks in a row)")

    # --- weight / reps ---
    if tendon_result["weight"] is not None:
        # maintenance: hold weight, hold reps
        rec_weight = tendon_result["weight"]
        rec_reps = tendon_result["reps"]
    else:
        # normal progression: check rep ceiling first
        candidate_reps = next_reps(
            prev_reps, pump, cfg["pump_rep_add"], cfg["rep_range"]["default_min"]
        )
        if weight_bump_mandatory(candidate_reps, cfg["weight"]["rep_hard_ceiling"]):
            rec_weight = next_weight(
                prev_weight, cfg["weight"]["bump_pct"], cfg["weight"]["increment_lb"]
            )
            rec_reps = volume_matched_reps(prev_weight, prev_reps, rec_weight)
            flags.append("WEIGHT_BUMP: mandatory (reps hit hard ceiling)")
        elif needs_weight_bump(candidate_reps, cfg["weight"]["rep_ceiling"]):
            rec_weight = next_weight(
                prev_weight, cfg["weight"]["bump_pct"], cfg["weight"]["increment_lb"]
            )
            rec_reps = volume_matched_reps(prev_weight, prev_reps, rec_weight)
            flags.append("WEIGHT_BUMP: recommended (reps at ceiling)")
        else:
            rec_weight = prev_weight
            rec_reps = candidate_reps

    return {
        "weight": rec_weight,
        "reps": rec_reps,
        "sets": rec_sets,
        "target_rir": t_rir,
        "flags": flags,
    }
