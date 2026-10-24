"""Unit tests for src/progression.py."""
import pytest
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

from progression import (
    round_to_increment,
    next_weight,
    volume_matched_reps,
    target_rir,
    next_reps,
    needs_weight_bump,
    weight_bump_mandatory,
    apply_tendon_rule,
    apply_soreness_rule,
    apply_connection_rule,
    recommend,
)
import config as cfg_mod

CFG = cfg_mod.load()


# ---------------------------------------------------------------------------
# Weight helpers
# ---------------------------------------------------------------------------

class TestRoundToIncrement:
    def test_exact_multiple(self):
        assert round_to_increment(15.0) == 15.0

    def test_rounds_up(self):
        # 16.3/2.5=6.52 → round(6.52)=7 → 7*2.5=17.5
        assert round_to_increment(16.3) == 17.5

    def test_rounds_down(self):
        assert round_to_increment(16.0) == 15.0  # round(16/2.5)=round(6.4)=6 → 15.0

    def test_midpoint_rounds_to_even(self):
        # 16.25/2.5 = 6.5 → Python banker's rounding → 6 → 15.0
        assert round_to_increment(16.25) in (15.0, 17.5)


class TestNextWeight:
    def test_15lb_goes_to_17_5(self):
        # 15 * 1.05 = 15.75 → rounds to 15 → forced min = 17.5
        assert next_weight(15.0) == 17.5

    def test_20lb(self):
        # 20 * 1.05 = 21.0 → rounds to 20 → forced min = 22.5
        assert next_weight(20.0) == 22.5

    def test_100lb(self):
        # 100 * 1.05 = 105 → rounds to 105
        assert next_weight(100.0) == 105.0

    def test_minimum_one_step_always(self):
        # even if bump_pct is 0, we get at least one increment
        assert next_weight(10.0, bump_pct=0.0) == 12.5


class TestVolumeMatchedReps:
    def test_spec_example_17_5(self):
        # 15 × 15 = 225 → 225/17.5 = 12.857 → floor = 12
        assert volume_matched_reps(15, 15, 17.5) == 12

    def test_spec_example_20(self):
        # 15 × 15 = 225 → 225/20 = 11.25 → floor = 11
        assert volume_matched_reps(15, 15, 20) == 11

    def test_equal_weight_returns_same_reps(self):
        assert volume_matched_reps(30, 10, 30) == 10

    def test_zero_weight_raises(self):
        with pytest.raises(ValueError):
            volume_matched_reps(30, 10, 0)

    def test_minimum_one_rep(self):
        assert volume_matched_reps(5, 1, 1000) == 1


# ---------------------------------------------------------------------------
# RIR ladder
# ---------------------------------------------------------------------------

class TestTargetRir:
    def test_week1(self):
        assert target_rir(1, [3, 2, 1, 0]) == 3

    def test_week4(self):
        assert target_rir(4, [3, 2, 1, 0]) == 0

    def test_beyond_ladder_defaults_to_0(self):
        assert target_rir(10, [3, 2, 1, 0]) == 0


# ---------------------------------------------------------------------------
# Rep progression
# ---------------------------------------------------------------------------

class TestNextReps:
    PUMP_CFG = {"great": 1, "mid": 1, "none": 2}

    def test_great_pump_adds_1(self):
        assert next_reps(8, "great", self.PUMP_CFG) == 9

    def test_none_pump_adds_2(self):
        assert next_reps(8, "none", self.PUMP_CFG) == 10

    def test_does_not_go_below_rep_min(self):
        assert next_reps(7, "great", self.PUMP_CFG, rep_min=8) == 8


# ---------------------------------------------------------------------------
# Weight-bump decisions
# ---------------------------------------------------------------------------

class TestBumpFlags:
    def test_no_bump_below_ceiling(self):
        assert not needs_weight_bump(12, rep_ceiling=13)

    def test_bump_at_ceiling(self):
        assert needs_weight_bump(13, rep_ceiling=13)

    def test_mandatory_at_hard_ceiling(self):
        assert weight_bump_mandatory(15, rep_hard_ceiling=15)

    def test_not_mandatory_below(self):
        assert not weight_bump_mandatory(14, rep_hard_ceiling=15)


# ---------------------------------------------------------------------------
# Tendon pain rule
# ---------------------------------------------------------------------------

class TestTendonRule:
    TENDON_CFG = {
        "bad":     {"hold_weight": True,  "set_delta": -1, "rep_push": False},
        "neutral": {"hold_weight": False, "set_delta":  0, "rep_push": True},
        "good":    {"hold_weight": False, "set_delta":  0, "rep_push": True},
    }

    def test_bad_holds_weight_and_drops_set(self):
        result = apply_tendon_rule(30, 10, 4, "bad", self.TENDON_CFG)
        assert result["weight"] == 30
        assert result["sets"] == 3
        assert result["rep_push"] is False

    def test_bad_minimum_one_set(self):
        result = apply_tendon_rule(30, 10, 1, "bad", self.TENDON_CFG)
        assert result["sets"] == 1

    def test_neutral_does_not_hold_weight(self):
        result = apply_tendon_rule(30, 10, 4, "neutral", self.TENDON_CFG)
        assert result["weight"] is None
        assert result["rep_push"] is True


# ---------------------------------------------------------------------------
# Soreness rule
# ---------------------------------------------------------------------------

class TestSorenessRule:
    SORENESS_CFG = {
        "none":       {"hold_sets": False, "rir_adjust": 0},
        "mild":       {"hold_sets": False, "rir_adjust": 0},
        "still_sore": {"hold_sets": True,  "rir_adjust": 1},
    }

    def test_none_no_change(self):
        r = apply_soreness_rule(1, 4, "none", 0, self.SORENESS_CFG)
        assert r["target_rir"] == 1
        assert r["sets"] == 4
        assert not r["flag_under_recovered"]

    def test_still_sore_adds_rir(self):
        r = apply_soreness_rule(1, 4, "still_sore", 0, self.SORENESS_CFG)
        assert r["target_rir"] == 2

    def test_two_consecutive_sore_weeks_trims_set(self):
        r = apply_soreness_rule(1, 4, "still_sore", 2, self.SORENESS_CFG)
        assert r["sets"] == 3
        assert r["flag_under_recovered"]


# ---------------------------------------------------------------------------
# Muscle connection rule
# ---------------------------------------------------------------------------

class TestConnectionRule:
    def test_great_no_flags(self):
        r = apply_connection_rule("great", 0)
        assert not r["flag_technique"]
        assert not r["flag_swap"]

    def test_not_at_all_flags_technique(self):
        r = apply_connection_rule("not_at_all", 1)
        assert r["flag_technique"]
        assert not r["flag_swap"]

    def test_two_weeks_flags_swap(self):
        r = apply_connection_rule("not_at_all", 2)
        assert r["flag_swap"]


# ---------------------------------------------------------------------------
# Master recommend() — integration
# ---------------------------------------------------------------------------

class TestRecommend:
    BASE = dict(
        week=2,
        prev_weight=30.0,
        prev_reps=10,
        prev_sets=3,
        pump="great",
        tendon="good",
        connection="great",
        soreness="none",
        consecutive_sore_weeks=0,
        consecutive_not_at_all=0,
        cfg=CFG,
    )

    def test_normal_progression(self):
        r = recommend(**self.BASE)
        assert r["weight"] == 30.0
        assert r["reps"] == 11     # 10 + 1 (great pump)
        assert r["target_rir"] == 2  # week 2 of default ladder

    def test_weight_bump_triggered(self):
        r = recommend(**{**self.BASE, "prev_reps": 13})
        assert r["weight"] > 30.0
        assert "WEIGHT_BUMP" in " ".join(r["flags"])

    def test_tendon_bad_maintenance(self):
        r = recommend(**{**self.BASE, "tendon": "bad"})
        assert r["weight"] == 30.0  # held
        assert r["sets"] == 2       # 3 - 1
        assert any("TENDON" in f for f in r["flags"])

    def test_sore_rir_adjusted(self):
        r = recommend(**{**self.BASE, "soreness": "still_sore", "week": 3})
        # week 3 RIR = 1, still_sore adds 1 → expect 2
        assert r["target_rir"] == 2
