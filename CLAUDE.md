# Project Name

One sentence on what this project does.

## Data

Describe the source data and where it lives in `data/raw/`.

## How to run

```bash
uv run python src/main.py
```

## Notes

Anything non-obvious about the model, the data, or decisions made.

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
