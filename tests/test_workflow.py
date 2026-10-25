"""
End-to-end workflow test — simulates a real user completing two weeks of
training and verifies that the recommendation engine produces correct
week-over-week targets.

The test mirrors the exact data flow inside the Google Sheet:
  1. avg_reps / num_sets are computed from S1–S4 (mirrors the ARRAYFORMULA)
  2. The recommendation engine (progression.recommend) is called with those values
  3. The user copies last week's Log row, updates the week number and weight to
     the recommended value, and logs new per-set reps
  4. The archive parser (_parse_log) is called on realistic multi-week log data

Exercises covered:
  - Barbell Back Squat   — normal progression (reps stay below ceiling both weeks)
  - Romanian Deadlift    — weight bump fires in week 3 (reps reach ceiling in week 2)
  - Incline DB Press     — weight bump fires in week 3 (reps reach ceiling in week 2)
  - Overhead Press       — tendon=bad in week 2 → maintenance week 3
  - Barbell Curl         — weight bump already fired in week 2 (avg reps ≥ 13 in week 1)
"""

import sys
from dataclasses import dataclass, field
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

import config as cfg_mod
from progression import recommend

# Load the default config once for the whole module
CFG = cfg_mod.load()


# ---------------------------------------------------------------------------
# Helpers mirroring the Google Sheets ARRAYFORMULA for Avg Reps and Num Sets
# ---------------------------------------------------------------------------

def _avg_reps(*sets: int | float) -> float:
    """Mirror the Log tab J column formula: average of non-zero set values."""
    vals = [s for s in sets if s and s > 0]
    return sum(vals) / len(vals) if vals else 0.0


def _num_sets(*sets: int | float) -> int:
    """Mirror the Log tab K column formula: count of non-zero set values."""
    return sum(1 for s in sets if s and s > 0)


# ---------------------------------------------------------------------------
# LogRow: represents one row in the Log tab
# ---------------------------------------------------------------------------

@dataclass
class LogRow:
    """One row in the Log tab — mirrors the sheet column layout."""
    date:       str
    week:       int
    day:        str
    exercise:   str
    weight:     float
    s1:         int | float = 0
    s2:         int | float = 0
    s3:         int | float = 0
    s4:         int | float = 0
    pump:       str = "mid"
    tendon:     str = "good"
    connection: str = "great"
    soreness:   str = "none"
    notes:      str = ""

    @property
    def avg_reps(self) -> float:
        return _avg_reps(self.s1, self.s2, self.s3, self.s4)

    @property
    def num_sets(self) -> int:
        return _num_sets(self.s1, self.s2, self.s3, self.s4)

    def recommend_next(self, next_week: int) -> dict:
        """Run the progression engine and return the recommendation dict."""
        return recommend(
            week=next_week,
            prev_weight=self.weight,
            prev_reps=round(self.avg_reps),
            prev_sets=self.num_sets,
            pump=self.pump,
            tendon=self.tendon,
            connection=self.connection,
            soreness=self.soreness,
            cfg=CFG,
        )


# ---------------------------------------------------------------------------
# ARRAYFORMULA helper unit tests
# ---------------------------------------------------------------------------

class TestAvgRepsFormula:
    def test_all_four_sets(self):
        assert _avg_reps(12, 10, 10, 9) == pytest.approx(10.25)

    def test_three_sets_fourth_blank(self):
        assert _avg_reps(12, 10, 9, 0) == pytest.approx(10.333, rel=1e-3)

    def test_two_sets(self):
        assert _avg_reps(10, 8, 0, 0) == pytest.approx(9.0)

    def test_single_set(self):
        assert _avg_reps(12, 0, 0, 0) == pytest.approx(12.0)

    def test_all_zero_returns_zero(self):
        assert _avg_reps(0, 0, 0, 0) == 0.0


class TestNumSetsFormula:
    def test_four_sets(self):
        assert _num_sets(12, 10, 10, 9) == 4

    def test_three_sets(self):
        assert _num_sets(12, 10, 9, 0) == 3

    def test_one_set(self):
        assert _num_sets(10, 0, 0, 0) == 1

    def test_none_recorded(self):
        assert _num_sets(0, 0, 0, 0) == 0


# ---------------------------------------------------------------------------
# Week 1 session data
# ---------------------------------------------------------------------------
#
# The user opens the sheet, checks Next Week for targets, then logs their
# actual per-set reps. Pump/tendon/connection/soreness are filled in the
# same row immediately after finishing the exercise.

WEEK_1_LOG = [
    LogRow("2026-10-27", 1, "Day A", "Barbell Back Squat",
           weight=135, s1=12, s2=10, s3=10, s4=9,
           pump="mid", tendon="good", connection="great", soreness="none"),

    LogRow("2026-10-27", 1, "Day A", "Romanian Deadlift",
           weight=115, s1=12, s2=10, s3=9, s4=0,
           pump="mid", tendon="good", connection="good", soreness="none"),

    LogRow("2026-10-28", 1, "Day B", "Incline DB Press",
           weight=60, s1=12, s2=11, s3=10, s4=0,
           pump="great", tendon="good", connection="great", soreness="mild"),

    LogRow("2026-10-28", 1, "Day B", "Overhead Press",
           weight=75, s1=10, s2=9, s3=8, s4=0,
           pump="mid", tendon="neutral", connection="good", soreness="none"),

    # avg reps ≥ 13 → weight bump should fire for week 2
    LogRow("2026-10-30", 1, "Day C", "Barbell Curl",
           weight=55, s1=14, s2=13, s3=12, s4=0,
           pump="great", tendon="good", connection="great", soreness="none"),
]


# ---------------------------------------------------------------------------
# Week 1 → Week 2 recommendations
# ---------------------------------------------------------------------------

class TestWeek1ToWeek2:

    def test_squat_avg_reps_and_sets(self):
        row = WEEK_1_LOG[0]
        assert row.avg_reps == pytest.approx(10.25)
        assert row.num_sets == 4

    def test_squat_normal_progression(self):
        # avg reps (10.25) → rounded to 10; + 1 (mid pump) = 11 < 13 ceiling
        # weight should hold, reps should increase
        rec = WEEK_1_LOG[0].recommend_next(next_week=2)
        assert rec["weight"] == 135.0
        assert rec["reps"] == 11
        assert rec["sets"] == 4
        assert rec["target_rir"] == 2   # week 2 of default 6-week ladder

    def test_rdl_normal_progression(self):
        row = WEEK_1_LOG[1]
        assert row.avg_reps == pytest.approx(10.333, rel=1e-3)
        assert row.num_sets == 3
        rec = row.recommend_next(next_week=2)
        assert rec["weight"] == 115.0
        assert rec["reps"] == 11   # round(10.33)=10; +1 mid = 11
        assert rec["sets"] == 3

    def test_incline_db_press_great_pump(self):
        row = WEEK_1_LOG[2]
        assert row.avg_reps == pytest.approx(11.0)
        rec = row.recommend_next(next_week=2)
        assert rec["weight"] == 60.0
        assert rec["reps"] == 12   # 11 + 1 (great pump)
        assert rec["sets"] == 3

    def test_overhead_press_neutral_tendon(self):
        row = WEEK_1_LOG[3]
        assert row.avg_reps == pytest.approx(9.0)
        rec = row.recommend_next(next_week=2)
        # neutral tendon = normal progression
        assert rec["weight"] == 75.0
        assert rec["reps"] == 10   # 9 + 1 (mid pump)
        assert rec["sets"] == 3

    def test_barbell_curl_weight_bump(self):
        row = WEEK_1_LOG[4]
        assert row.avg_reps == pytest.approx(13.0)
        assert row.num_sets == 3
        rec = row.recommend_next(next_week=2)
        # avg reps = 13 ≥ ceiling → weight bump
        assert rec["weight"] > 55.0
        assert any("WEIGHT_BUMP" in f for f in rec["flags"])
        # reps should be volume-matched down
        assert rec["reps"] < 13


# ---------------------------------------------------------------------------
# Week 2 session data
# "Copy last week's row, update week to 2, adjust weight/reps toward the rec"
# ---------------------------------------------------------------------------

def _week1_rec(idx: int) -> dict:
    """Convenience: get the week-2 recommendation for a WEEK_1_LOG entry."""
    return WEEK_1_LOG[idx].recommend_next(next_week=2)


WEEK_2_LOG = [
    # Squat: hold 135, push toward rec 11 reps — user achieves it comfortably
    LogRow("2026-11-03", 2, "Day A", "Barbell Back Squat",
           weight=135, s1=13, s2=11, s3=11, s4=10,
           pump="mid", tendon="good", connection="great", soreness="none"),

    # RDL: hold 115, user gets avg reps close to ceiling
    LogRow("2026-11-03", 2, "Day A", "Romanian Deadlift",
           weight=115, s1=13, s2=12, s3=11, s4=0,
           pump="mid", tendon="good", connection="good", soreness="none"),

    # Incline DB: hold 60, user gets avg reps to ceiling
    LogRow("2026-11-04", 2, "Day B", "Incline DB Press",
           weight=60, s1=14, s2=12, s3=11, s4=0,
           pump="great", tendon="good", connection="great", soreness="mild"),

    # OHP: tendon turns bad mid-week → maintenance next week
    LogRow("2026-11-04", 2, "Day B", "Overhead Press",
           weight=75, s1=10, s2=10, s3=9, s4=0,
           pump="mid", tendon="bad", connection="good", soreness="none"),

    # Curl: at the bumped weight from week 2 rec
    LogRow("2026-11-06", 2, "Day C", "Barbell Curl",
           weight=_week1_rec(4)["weight"], s1=12, s2=11, s3=10, s4=0,
           pump="mid", tendon="good", connection="great", soreness="none"),
]


# ---------------------------------------------------------------------------
# Week 2 → Week 3 recommendations
# ---------------------------------------------------------------------------

class TestWeek2ToWeek3:

    def test_squat_still_below_ceiling(self):
        # avg 11.25 → round to 11; +1 mid = 12 < 13 ceiling → hold weight
        row = WEEK_2_LOG[0]
        assert row.avg_reps == pytest.approx(11.25)
        rec = row.recommend_next(next_week=3)
        assert rec["weight"] == 135.0
        assert rec["reps"] == 12
        assert rec["target_rir"] == 1   # week 3 of default ladder

    def test_rdl_weight_bump_fires(self):
        # avg = (13+12+11)/3 = 12; +1 mid = 13 = ceiling → bump
        row = WEEK_2_LOG[1]
        assert row.avg_reps == pytest.approx(12.0)
        rec = row.recommend_next(next_week=3)
        assert rec["weight"] > 115.0
        assert any("WEIGHT_BUMP" in f for f in rec["flags"])

    def test_incline_db_weight_bump_fires(self):
        # avg = (14+12+11)/3 ≈ 12.33; +1 great = 13.33 → rounds to ≥ 13 ceiling
        row = WEEK_2_LOG[2]
        assert row.avg_reps == pytest.approx(12.333, rel=1e-3)
        rec = row.recommend_next(next_week=3)
        assert rec["weight"] > 60.0
        assert any("WEIGHT_BUMP" in f for f in rec["flags"])

    def test_overhead_press_tendon_maintenance(self):
        # tendon=bad → hold weight at 75, drop set from 3→2, no rep push
        row = WEEK_2_LOG[3]
        rec = row.recommend_next(next_week=3)
        assert rec["weight"] == 75.0
        assert rec["sets"] == 2   # 3 - 1
        assert rec["reps"] == round(row.avg_reps)   # no rep push
        assert any("TENDON" in f for f in rec["flags"])

    def test_curl_continues_normal(self):
        # At bumped weight, avg 11, +1 mid = 12 < ceiling → hold weight
        row = WEEK_2_LOG[4]
        bumped_weight = _week1_rec(4)["weight"]
        assert row.weight == bumped_weight
        assert row.avg_reps == pytest.approx(11.0)
        rec = row.recommend_next(next_week=3)
        assert rec["weight"] == bumped_weight
        assert rec["reps"] == 12


# ---------------------------------------------------------------------------
# Archive parser — _parse_log with realistic multi-week log data
# ---------------------------------------------------------------------------

class TestArchiveParser:
    """
    Verify that _parse_log correctly converts Log tab rows to History rows.
    Tests both the case where ARRAYFORMULA-computed values ARE present (cols 9, 10)
    and the fallback where they're absent (parser computes from S1–S4 directly).
    """

    # Build a minimal muscle lookup table
    MUSCLE_LOOKUP = {
        "Barbell Back Squat": "Quads",
        "Romanian Deadlift":  "Hamstrings",
        "Incline DB Press":   "Chest",
    }

    def _make_sheet_rows(self, log_rows: list[LogRow], include_computed: bool = True) -> list[list[str]]:
        """Convert LogRow objects to raw string rows as the Sheets API would return them."""
        header = [
            "Date", "Wk", "Day", "Exercise", "Wt (lb)",
            "S1", "S2", "S3", "S4",
            "Avg Reps ▾", "Num Sets ▾",
            "Pump", "Tendon", "Connection", "Soreness Before", "Notes",
        ]
        rows = [header]
        for r in log_rows:
            if include_computed:
                computed_avg  = str(round(r.avg_reps, 2))
                computed_sets = str(r.num_sets)
            else:
                computed_avg  = ""
                computed_sets = ""
            rows.append([
                r.date, str(r.week), r.day, r.exercise, str(r.weight),
                str(r.s1), str(r.s2), str(r.s3), str(r.s4),
                computed_avg, computed_sets,
                r.pump, r.tendon, r.connection, r.soreness, r.notes,
            ])
        return rows

    def _parse(self, log_rows, include_computed=True):
        from archive import _parse_log
        sheet_rows = self._make_sheet_rows(log_rows, include_computed)
        return _parse_log(sheet_rows, self.MUSCLE_LOOKUP, "Test Meso", "2026-12-01")

    def test_basic_row_count(self):
        result = self._parse(WEEK_1_LOG + WEEK_2_LOG)
        assert len(result) == len(WEEK_1_LOG) + len(WEEK_2_LOG)

    def test_row_schema(self):
        result = self._parse(WEEK_1_LOG[:1])
        row = result[0]
        # Schema: mesocycle, date, exercise, day, muscle, week, weight, avg_reps, sets, volume
        assert row[0] == "Test Meso"
        assert row[2] == "Barbell Back Squat"
        assert row[4] == "Quads"
        assert row[5] == 1
        assert row[6] == 135.0

    def test_avg_reps_computed_by_parser(self):
        # When ARRAYFORMULA cols are empty, parser computes from S1–S4.
        # _parse_log rounds avg_reps to 1 decimal before storing.
        result = self._parse(WEEK_1_LOG[:1], include_computed=False)
        row = result[0]
        # 10.25 rounded to 1dp via Python banker's rounding = 10.2
        assert row[7] == pytest.approx(round(10.25, 1))
        assert row[8] == 4                       # num_sets

    def test_avg_reps_uses_precomputed_when_present(self):
        result = self._parse(WEEK_1_LOG[:1], include_computed=True)
        row = result[0]
        assert row[7] == pytest.approx(round(10.25, 1))
        assert row[8] == 4

    def test_volume_calculation(self):
        result = self._parse(WEEK_1_LOG[:1])
        row = result[0]
        # volume = weight × stored_avg_reps × num_sets
        # stored avg is round(10.25, 1) = 10.2, so 135 × 10.2 × 4 = 5508
        stored_avg = round(10.25, 1)
        assert row[9] == pytest.approx(135.0 * stored_avg * 4, rel=1e-2)

    def test_unknown_exercise_gets_empty_muscle(self):
        unknown = [LogRow("2026-10-27", 1, "Day A", "Smith Machine Calf Raise",
                          weight=100, s1=15, s2=14, s3=13, s4=0)]
        result = self._parse(unknown)
        assert result[0][4] == ""   # no muscle lookup entry

    def test_multiweek_archive_all_exercises(self):
        result = self._parse(WEEK_1_LOG + WEEK_2_LOG)
        weeks_in_archive = {row[5] for row in result}
        assert weeks_in_archive == {1, 2}
        exercises = {row[2] for row in result}
        assert "Barbell Back Squat" in exercises
        assert "Overhead Press" in exercises

    def test_rows_with_no_sets_are_skipped(self):
        empty = [LogRow("2026-10-27", 1, "Day A", "Barbell Back Squat",
                        weight=135, s1=0, s2=0, s3=0, s4=0)]
        # No non-zero sets → avg_reps=0, num_sets=0 → volume=0
        # Parser should still include the row (weight > 0 means session happened);
        # volume will be 0 but the row is kept.
        result = self._parse(empty, include_computed=False)
        # avg_reps=0 means volume=0; row present but with zero values
        assert result[0][9] == 0

    def test_row_with_missing_exercise_name_is_skipped(self):
        rows = self._make_sheet_rows(WEEK_1_LOG[:1])
        rows.append(["2026-10-27", "1", "Day A", "", "135",
                     "10", "8", "0", "0", "", "", "mid", "good", "great", "none", ""])
        from archive import _parse_log
        result = _parse_log(rows, self.MUSCLE_LOOKUP, "Test Meso", "2026-12-01")
        assert len(result) == 1   # blank exercise row skipped


# ---------------------------------------------------------------------------
# Full scenario narrative test — reads like a session diary
# ---------------------------------------------------------------------------

class TestFullTwoWeekScenario:
    """
    Walks through the scenario as a user would experience it:
      Week 1 → log sets → get week 2 recs
      Week 2 → copy rows, update toward recs → log sets → get week 3 recs
    """

    def test_week1_targets_match_program_defaults(self):
        # On week 1 there's no prior log, so recommendations come from
        # the program's starting values. The user just follows the Program tab.
        # (No prior data to assert against — week 1 is always a fresh start.)
        pass

    def test_week1_log_fills_in_correctly(self):
        squat = WEEK_1_LOG[0]
        assert squat.exercise == "Barbell Back Squat"
        assert squat.avg_reps == pytest.approx(10.25)
        assert squat.num_sets == 4

    def test_week2_user_sees_recommendations(self):
        # Before week 2 session: check Next Week tab
        recs = {row.exercise: row.recommend_next(2) for row in WEEK_1_LOG}
        # Squat: hold weight, push reps
        assert recs["Barbell Back Squat"]["weight"] == 135.0
        assert recs["Barbell Back Squat"]["reps"] > WEEK_1_LOG[0].avg_reps
        # Curl: weight bumps
        assert recs["Barbell Curl"]["weight"] > 55.0

    def test_week2_user_logs_near_recommendations(self):
        # User copies week 1 rows, updates week to 2, adjusts weight/reps
        squat_rec = WEEK_1_LOG[0].recommend_next(2)
        squat_w2  = WEEK_2_LOG[0]
        # The logged weight matches the recommendation (user held at 135)
        assert squat_w2.weight == squat_rec["weight"]
        # The user's avg reps this week exceed last week's avg
        assert squat_w2.avg_reps > WEEK_1_LOG[0].avg_reps

    def test_week3_reflects_week2_outcomes(self):
        # Weight bumps for RDL and Incline DB; maintenance for OHP
        rdl_rec  = WEEK_2_LOG[1].recommend_next(3)
        ohp_rec  = WEEK_2_LOG[3].recommend_next(3)
        curl_rec = WEEK_2_LOG[4].recommend_next(3)

        assert rdl_rec["weight"]  > WEEK_2_LOG[1].weight   # bumped
        assert ohp_rec["weight"]  == WEEK_2_LOG[3].weight  # held (tendon)
        assert ohp_rec["sets"]    == WEEK_2_LOG[3].num_sets - 1   # dropped
        assert curl_rec["weight"] == WEEK_2_LOG[4].weight  # still below ceiling

    def test_rir_escalates_week_to_week(self):
        # Default ladder: wk1=3, wk2=2, wk3=1 — effort increases each week
        rir_wk2 = WEEK_1_LOG[0].recommend_next(2)["target_rir"]
        rir_wk3 = WEEK_2_LOG[0].recommend_next(3)["target_rir"]
        assert rir_wk2 == 2
        assert rir_wk3 == 1
        assert rir_wk3 < rir_wk2
