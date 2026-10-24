"""
Archive the current mesocycle's Session data into the History tab.

Usage:
    uv run python src/archive.py
    uv run python src/archive.py --label "Oct 2026 Hypertrophy"

What it does:
  1. Reads the Session tab (wide format) from the active spreadsheet.
  2. Reads the Exercise Library tab to look up primary muscles.
  3. Converts to long format: one row per exercise per week.
  4. Appends those rows to the History tab (never overwrites existing data).
"""
import argparse
import sys
from datetime import date
from pathlib import Path

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build

ROOT       = Path(__file__).parent.parent
CREDS_FILE = ROOT / "credentials.json"
TOKEN_FILE = ROOT / "token.json"
ID_FILE    = ROOT / "output" / "spreadsheet_id.txt"

SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive.file",
]


def _get_credentials() -> Credentials:
    creds = None
    if TOKEN_FILE.exists():
        creds = Credentials.from_authorized_user_file(str(TOKEN_FILE), SCOPES)
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            flow = InstalledAppFlow.from_client_secrets_file(str(CREDS_FILE), SCOPES)
            creds = flow.run_local_server(port=0)
        TOKEN_FILE.write_text(creds.to_json())
    return creds


def _read_tab(service, spreadsheet_id: str, range_: str) -> list[list[str]]:
    result = service.spreadsheets().values().get(
        spreadsheetId=spreadsheet_id,
        range=range_,
    ).execute()
    return result.get("values", [])


def _build_muscle_lookup(library_rows: list[list[str]]) -> dict[str, str]:
    """Map exercise name → primary muscle from Exercise Library tab."""
    lookup: dict[str, str] = {}
    for row in library_rows[1:]:   # skip header
        if len(row) >= 2 and row[0]:
            lookup[row[0]] = row[1]
    return lookup


def _parse_session(
    session_rows: list[list[str]],
    muscle_lookup: dict[str, str],
    mesocycle_label: str,
    archived_date: str,
) -> list[list]:
    """
    Convert Session tab (wide format) to long-format History rows.

    Session columns (0-indexed):
      0: Exercise
      1: Day
      2 + (w-1)*3 + 0: Wk{w} Weight
      2 + (w-1)*3 + 1: Wk{w} Reps
      2 + (w-1)*3 + 2: Wk{w} Sets

    Session header row: ["Exercise", "Day", "Wk1 Wt (lb)", "Wk1 Reps", "Wk1 Sets", ...]
    """
    if not session_rows:
        return []

    header = session_rows[0]
    # Count weeks from the header: every group of 3 after col 1
    num_week_cols = len(header) - 2
    weeks = num_week_cols // 3

    result: list[list] = []
    current_day = ""

    for row in session_rows[1:]:
        if not row:
            continue

        exercise = row[0].strip() if row else ""
        if not exercise:
            continue

        # Day section headers (e.g. "Day A") have no week data
        if exercise.lower().startswith("day ") and len([c for c in row[1:] if c]) == 0:
            current_day = exercise
            continue
        # Also catch day headers that have their label but nothing in week columns
        day_col = row[1].strip() if len(row) > 1 else ""
        if day_col:
            current_day = day_col

        primary_muscle = muscle_lookup.get(exercise, "")

        for w in range(1, weeks + 1):
            base = 2 + (w - 1) * 3
            wt_raw   = row[base]     if base     < len(row) else ""
            reps_raw = row[base + 1] if base + 1 < len(row) else ""
            sets_raw = row[base + 2] if base + 2 < len(row) else ""

            # Skip completely empty weeks
            if not any([wt_raw, reps_raw, sets_raw]):
                continue

            try:
                wt   = float(wt_raw)   if wt_raw   else 0.0
                reps = int(float(reps_raw)) if reps_raw else 0
                sets = int(float(sets_raw)) if sets_raw else 0
                vol  = round(wt * reps * sets, 1)
            except (ValueError, TypeError):
                wt, reps, sets, vol = wt_raw, reps_raw, sets_raw, ""

            result.append([
                mesocycle_label,
                archived_date,
                exercise,
                current_day,
                primary_muscle,
                w,
                wt,
                reps,
                sets,
                vol,
            ])

    return result


def archive(label: str) -> None:
    if not ID_FILE.exists():
        print(f"ERROR: {ID_FILE} not found.")
        print("Run 'uv run python src/main.py' first to create the sheet.")
        sys.exit(1)

    spreadsheet_id = ID_FILE.read_text().strip()
    print(f"Spreadsheet: {spreadsheet_id}")

    creds   = _get_credentials()
    service = build("sheets", "v4", credentials=creds)

    print("Reading Session tab…")
    session_rows = _read_tab(service, spreadsheet_id, "Session!A:Z")

    print("Reading Exercise Library…")
    library_rows = _read_tab(service, spreadsheet_id, "'Exercise Library'!A:D")
    muscle_lookup = _build_muscle_lookup(library_rows)

    today = date.today().isoformat()
    print(f"Transforming to long format (label: '{label}', date: {today})…")
    rows = _parse_session(session_rows, muscle_lookup, label, today)

    if not rows:
        print("No data found in Session tab. Nothing archived.")
        return

    print(f"Appending {len(rows)} rows to History tab…")
    service.spreadsheets().values().append(
        spreadsheetId=spreadsheet_id,
        range="History!A:J",
        valueInputOption="USER_ENTERED",
        insertDataOption="INSERT_ROWS",
        body={"values": rows},
    ).execute()

    print(f"✓ Done. {len(rows)} rows archived under '{label}'.")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Archive the current mesocycle's Session data into the History tab."
    )
    parser.add_argument(
        "--label", "-l",
        type=str,
        default=None,
        help="Mesocycle label (e.g. 'Oct 2026 Hypertrophy'). Prompts if not provided.",
    )
    args = parser.parse_args()

    label = args.label
    if not label:
        label = input("Mesocycle label (e.g. 'Mesocycle 1'): ").strip()
        if not label:
            print("Label cannot be empty.")
            sys.exit(1)

    archive(label)


if __name__ == "__main__":
    main()
