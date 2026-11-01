# Workout Tracker

Google Sheets workout logger written in Apps Script (`apps-script/`), bound to a Sheet with clasp.
The old Python tracker (`src/`, `config/`) is unused.

## How to run
- Pure tests: `node gs-tests/run-node.js`
- Sheet tests on an in-memory SpreadsheetApp mock: `node gs-tests/run-sheet-tests.js`
  (add `--verbose` for script logs; `MOCK_TRACE=1` shows the cell and call stack for any
  rejected write). Its total is the in-Sheet total plus a few runner-only checks.
- Node is at `C:\Program Files\nodejs`: `export PATH="$PATH:/c/Program Files/nodejs"`.
- Push: the user runs `clasp push --force` themselves with the `!` prefix (auto mode
  denies it from Claude). Then in the Sheet: Workout > Set up workbook, then
  Run sheet tests. Report the counts before calling a pass done.
- New `.gs` file: add it to `gs-tests/gs-files.js` (shared by both runners).

## Session start
- Run `git status` and `git log -3`; say what is uncommitted before starting.
- Commit each finished, verified pass. Do not push unless asked.

## Editing .gs files
- Write multi-line edit scripts with the Write tool into the scratchpad, never as
  `node -e` or heredocs: quoting and `\n` get mangled. Scripts must treat CRLF and LF
  alike (files are mixed).
- No top-level code in one `.gs` file that reads another file's globals: Apps Script does
  not guarantee load order. Derived constants go in `Config.gs`.
- Keep pure logic above a "Sheet side" marker so `run-node.js` covers it.

## Mock fidelity
- If the in-Sheet result differs from the mock, change the mock to reproduce it before
  fixing the code. Known gaps: no chart rendering, no protection enforcement, no onEdit
  triggers, conditional formats are stored but not evaluated.

## Docs
- Add a line to `docs/readme-todo.md` whenever a change makes `apps-script/README.md` stale.
  The README is rewritten once, at the end.

## File editing discipline
- Read a file once before a sequence of edits. Plan all changes mentally, 
  then run them. Do not re-read the same file between edits in the same task.
- If a single file will receive more than 3 rounds of edits in a session, 
  split it into focused modules before continuing.

## Clarifying questions
- Use the AskUserQuestion tool only for true binary choices. If the answer
  is likely "make it configurable" or involves a third option, ask in plain 
  text and default to the more flexible implementation.

## Context hygiene for large projects
- When writing files >300 lines, prefer multiple smaller files over one 
  monolithic file. Monolithic files re-read repeatedly are the primary 
  driver of context exhaustion in long sessions.
