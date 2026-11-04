/**
 * Guide.gs — the "Start Here" tab: a one-page guide that travels with every copy of the workbook.
 * Set up workbook writes it when the tab is new or empty (so a tester's own edits stay); Reset for a new user rewrites it.
 * Names of actions, settings and the program come from Config.gs / ProgramTemplates.gs so the text cannot drift from the tabs.
 * guideLines() is pure (no SpreadsheetApp) so it runs under Node tests.
 */

/** [[text, style]] with style 'title', 'h' (heading) or 'p' (paragraph). */
function guideLines() {
  var A = SETTINGS_ACTIONS, L = SETTINGS_LABELS;
  var program = PROGRAM_TEMPLATES[0] ? PROGRAM_TEMPLATES[0].name : '';
  return [
    ['Start here', 'title'],
    ['A workout log that lives in this Google Sheet and works from a phone. You plan the program once. Each week the Sessions tab shows what to do, '
      + 'you log it as you train, and "' + A.WEEK + '" builds the next week with progression applied (more reps first, then more weight).', 'p'],
    ['First time in this copy (do this on a computer)', 'h'],
    ['1. Open the Workout menu > Set up workbook. Google asks you to authorize the script once. It may warn that the app is not verified: '
      + 'that is because the script is not published, so continue only if you got this workbook from the person who made it.', 'p'],
    ['2. Workout > Load program: ' + program + ' for a ready training split, or build your own on the Program tab.', 'p'],
    ['3. On Settings, check "' + L.WEEK + '" is 1 and give the mesocycle a name. Tick "' + L.INCL_SECONDARY + '" and "' + L.INCL_TERTIARY
      + '" if you want helper muscles to earn partial credit in the Muscle Summary.', 'p'],
    ['Each training day', 'h'],
    ['1. Open the Sessions tab. Rows are grouped and tinted by day. The gray numbers are the plan: sets, Actual RIR and Actual Weight come prefilled.', 'p'],
    ['2. Type over only what differed: the reps you really did, the weight you really used (Actual Weight) and how many reps you had left (Actual RIR). '
      + 'The first week has no Start Weight, so type the weight you used in Actual Weight.', 'p'],
    ['3. After each exercise pick Pump, Tendon and Connection. An exercise counts as done once all three are filled in. Soreness (pick it before training) and Notes are optional.', 'p'],
    ['End of the week', 'h'],
    ['Pick "' + A.WEEK + '": on a phone from the Action dropdown at the top of Settings, on a computer from the Workout menu. It logs every done exercise and builds next week. '
      + 'Exercises you did not touch only produce a warning. One you started but did not rate stops it and names the exercise.', 'p'],
    ['On your phone', 'h'],
    ['The Sheets app has no Workout menu. Use the Action dropdown at the top of the Settings tab (' + [A.BUILD, A.WEEK, A.CLEAR, A.DELOAD, A.SUMMARY, A.NEW_MESO].join(', ')
      + '). The Status cell under it says what happened or why it refused. Do the first-time setup on a computer.', 'p'],
    ['Your program and exercises', 'h'],
    ['Program tab: one row per exercise per day: Day, Exercise (pick from the dropdown), Sets, Start Weight (blank is fine), Rep Min, Rep Max.', 'p'],
    ['Exercise Map tab: every exercise and the muscles it trains. Muscle Group is the main muscle; Secondary and Tertiary muscles get partial credit. '
      + 'To add an exercise, type it in the next empty row. The same exercise cannot be entered twice, and Muscle Group has a dropdown so a muscle is always spelled the same way.', 'p'],
    ['Muscle Summary and Trends: weekly sets per muscle group and a chart of your progress. They refresh by themselves.', 'p'],
    ['Good to know', 'h'],
    ['If an action does not run, read Status on the Settings tab: it says why. Columns the script manages show a warning if you edit them; leave them alone. '
      + 'Workout > Set up workbook is safe to run again at any time.', 'p']
  ];
}

// ---- Sheet side -------------------------------------------------------------------------------------------------

/** Write the guide into the Start Here tab. Without force, a tab that already has text is left as it is. */
function setupGuide(ss, force) {
  var sh = ss.getSheetByName(TABS.GUIDE);
  if (!sh) return;
  if (!force && sh.getLastRow() > 0 && cleanName(sh.getRange(1, 1).getValue())) return;
  sh.clear();
  var lines = guideLines();
  sh.getRange(1, 1, lines.length, 1).setValues(lines.map(function (l) { return [l[0]]; }));
  sh.setColumnWidth(1, 640);
  sh.setHiddenGridlines(true);
  sh.getRange(1, 1, lines.length, 1).setWrap(true).setVerticalAlignment('top').setFontSize(12).setFontColor('#202124');
  lines.forEach(function (l, i) {
    if (l[1] === 'title') sh.getRange(i + 1, 1).setFontSize(22).setFontWeight('bold');
    else if (l[1] === 'h') sh.getRange(i + 1, 1).setFontSize(14).setFontWeight('bold').setBackground('#e8f0fe');
  });
}
