# Aspirations

Things that would be nice but are not needed now. Not scheduled; pick one up when it starts to hurt.

## Measure Complete Week speed
Pass 11 item 3. Complete Week was never timed after Pass 9. It prints `completeWeek total ...` and
`refreshAllSummaries total ...` lines (stage times) to Extensions > Apps Script > Executions; the user
skipped the measurement on 2026-11-01 because nothing felt slow on the phone. If it ever does:
read those lines first. Only if the "summary + chart" stage dominates, suspect `drawTrendChart`
(Trends.gs) deleting and recreating the chart, and update the existing chart in place instead.
Cheaper first step: Complete Week reads the Log about 5 times (`readLogRows`); pass the rows along.

## Faster in-Sheet tests
The full suite is about 8,000 Sheets calls and passes Apps Script's 6-minute limit, so it runs as two
menu items (1 of 2, 2 of 2). Per-section seconds are logged to the Executions log. The heaviest
sections are Deload (about 2,000 calls) and Muscle Summary (about 1,500). Trimming repeated
Complete Week loops there would let it fit in one run again.
