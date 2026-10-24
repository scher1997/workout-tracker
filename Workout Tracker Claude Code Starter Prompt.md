# Workout Tracker: Claude Code Starter Prompt

Copy everything under the heading below into Claude Code.

## Prompt

Build a workout tracking system as a robust, well-structured project, not a throwaway script. Treat it like a small software product: clear repo layout, a README, tests for the progression logic, and configuration separated from code.

### Goal

A Google Sheet I can use on my iPhone (Google Sheets app, offline-capable) to log exercises, sets, reps, and weight, with built-in formulas that recommend next week's targets based on reps in reserve (RIR) and my post-exercise feedback. Deliver it as either (a) an .xlsx file I can upload to Google Drive and open as a Sheet, or (b) a Python script that builds the Sheet through the Google Sheets API. Prefer whichever keeps formulas intact and is simplest to maintain. Ask me if the choice is unclear.

### Training model

- A mesocycle is 6 to 8 weeks (configurable). Each week inside it is a microcycle.
- Progression is driven by RIR. Default weekly target RIR: week 1 = 3, week 2 = 2, week 3 = 1, week 4 = 0 (failure). For blocks longer than four weeks, make the RIR ladder configurable per mesocycle, and include an optional deload week at the end.
- Default rep range is 8 to 12 per exercise, editable per exercise.
- I choose the starting weight myself. The sheet recommends a rep range and a target RIR, and suggests next week's load from last week's performance.
- At the end of a mesocycle, I can either clone the block with the same exercises or set up a new set of exercises.

### Feedback captured before and after each exercise

- Soreness, asked BEFORE training each muscle group: none / mild / still sore
- Pump, asked after the exercise: great / mid / none
- Tendon or joint pain, asked after the exercise: bad / neutral / good (bad means pain, good means no issue)
- Muscle connection, asked after the exercise (how well I felt the target muscle working): great / good / not at all

Use dropdown data validation for all four so entry is fast on a phone.

### Sheet structure

1. **Config tab**: mesocycle length, RIR ladder by week, default rep range, rep ceiling settings, weight increment settings, and the feedback-to-adjustment lookup tables. All formulas reference this tab so I can tune rules without editing formulas.
2. **Exercise Library tab**: a lookup table I maintain that maps each exercise to its muscle group (for example, bicep curl maps to biceps). Picking an exercise anywhere else fills in the muscle group automatically.
3. **Program tab**: the exercises for the current mesocycle (name, muscle group via lookup, rep range, starting weight, starting sets).
4. **Log tab**: one row per set with date, week number, exercise, set number, weight, reps, actual RIR, and notes.
5. **Feedback tab**: one row per exercise per session with the pre-training soreness rating for its muscle group and the three post-exercise ratings.
6. **Next Week tab**: auto-calculated recommendations per exercise: target RIR, target weight, target reps, and set count for next week, plus any flags.
7. **Weekly Volume tab**: a pivot-style view of total sets per muscle group per week across the mesocycle.

### Formula behavior (start simple, make it easy to change)

- **Pump rule**: if pump is great or mid, the rep target next week is at least last week's reps plus 1 (for example 8 then 9). If pump is none, the rep target rises by 2 or more (for example 8 then 10) to push the stimulus harder.
- **Rep ceiling and weight bump**: reps up to about 13 are fine. As reps approach 15, the sheet recommends a weight increase instead of more reps.
- **Weight increase**: percentage based, about 5%, rounded to the nearest 2.5 lb, with a minimum increase of one 2.5 lb step whenever the rule fires (so a 15 lb dumbbell goes to 17.5 lb, not stuck at 15). The recommended weight cell must be user-editable, because I may only have certain dumbbell sizes and will override it.
- **Volume-matched reps**: when weight changes, recommended reps = (previous weight x previous reps) / new weight. Example: 15 lb x 15 reps = 225, so 17.5 lb gives about 13 reps and 20 lb gives about 11 reps. If I override the weight, the reps recalculate from the same previous volume.
- **Tendon pain rule**: if tendon pain is bad, the exercise switches to maintenance for next week: hold the weight, drop one set, and no rep push. After one week of neutral or good tendon feedback, it returns to normal progression from the same weight. Neutral or good always progresses as normal.
- **Muscle connection rule**: great or good progresses as normal. "Not at all" flags the exercise for a technique check, and for a swap if it happens two weeks in a row.
- **Soreness rule** (per muscle group, asked before training): none or mild means train as planned. Still sore means hold that muscle group's set count (no added sets) and make that session's target RIR one step easier (for example 1 RIR becomes 2). Still sore two weeks in a row flags the muscle group as under-recovered and suggests trimming a set.
- Keep these rules in the Config lookup tables rather than buried in nested IFs, and document each one in the README.

### Engineering requirements

- Clean repo layout with a README explaining setup, the training model, and how to modify rules.
- Separate configuration from logic.
- Unit tests for the recommendation logic, including the volume-matching math, the 2.5 lb rounding and minimum step, and each feedback rule (the same rules mirrored in Python so formulas can be checked against expected outputs).
- Sample data so I can see the formulas working on first open.
- Mobile-friendly layout: narrow columns, frozen header rows, dropdowns, minimal typing.

Before writing code, propose the plan and any open questions, then build it step by step.
