"""
Archive the current mesocycle's Log data into the History tab.

Usage:
    uv run python src/archive.py
    uv run python src/archive.py --label "Oct 2026 Hypertrophy"

What it does:
  1. Reads the Log tab (long format) from the active spreadsheet.
  2. Reads the Exercise Library tab to look up primary muscles.
  3. Converts to archive format: one row per exercise per workout per week.
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


def _parse_log(
    log_rows: list[list[str]],
    muscle_lookup: dict[str, str],
    mesocycle_label: str,
    archived_date: str,
) -> list[list]:
    """
    Convert Log tab (long format) rows to History archive rows.

    Log columns (0-indexed):
      0: Date       1: Week      2: Day        3: Exercise   4: Weight (lb)
      5: S1         6: S2        7: S3         8: S4
      9: Avg Reps (ARRAYFORMULA-computed — use if populated, else compute)
     10: Num Sets   (ARRAYFORMULA-computed — use if populated, else compute)
     11: Pump       12: Tendon   13: Connection 14: Soreness Before  15: Notes

    History schema:
      Mesocycle | Archived Date | Exercise | Day | Primary Muscle |
      Week | Weight (lb) | Avg Reps | Sets | Volume
    """
    if not log_rows:
        return []

    result: list[list] = []

    for row in log_rows[1:]:  # skip header
        if len(row) < 4 or not row[3]:
            continue
        exercise = row[3].strip()
        if not exercise:
            continue

        try:
            week   = int(float(row[1])) if len(row) > 1 and row[1] else 0
            day    = row[2].strip() if len(row) > 2 else ""
            weight = float(row[4]) if len(row) > 4 and row[4] else 0.0

            # Use pre-computed avg reps from col 9 if available
            if len(row) > 9 and row[9]:
                avg_reps = float(row[9])
            else:
                set_vals = [
                    float(row[c]) for c in range(5, 9)
                    if c < len(row) and row[c] and float(row[c]) > 0
                ]
                avg_reps = sum(set_vals) / len(set_vals) if set_vals else 0.0

            # Use pre-computed num sets from col 10 if available
            if len(row) > 10 and row[10]:
                num_sets = int(float(row[10]))
            else:
                num_sets = sum(
                    1 for c in range(5, 9)
                    if c < len(row) and row[c] and float(row[c]) > 0
                )

            vol = round(weight * avg_reps * num_sets, 1) if weight and avg_reps else 0

        except (ValueError, TypeError):
            continue

        primary_muscle = muscle_lookup.get(exercise, "")

        result.append([
            mesocycle_label,
            archived_date,
            exercise,
            day,
            primary_muscle,
            week,
            weight,
            round(avg_reps, 1),
            num_sets,
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

    print("Reading Log tab…")
    log_rows = _read_tab(service, spreadsheet_id, "Log!A:P")

    print("Reading Exercise Library…")
    library_rows = _read_tab(service, spreadsheet_id, "'Exercise Library'!A:D")
    muscle_lookup = _build_muscle_lookup(library_rows)

    today = date.today().isoformat()
    print(f"Transforming to archive format (label: '{label}', date: {today})…")
    rows = _parse_log(log_rows, muscle_lookup, label, today)

    if not rows:
        print("No data found in Log tab. Nothing archived.")
        return

    print(f"Appending {len(rows)} rows to History tab…")
    service.spreadsheets().values().append(
        spreadsheetId=spreadsheet_id,
        range="History!A:J",
        valueInputOption="USER_ENTERED",
        insertDataOption="INSERT_ROWS",
        body={"values": rows},
    ).execute()

    print(f"Done. {len(rows)} rows archived under '{label}'.")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Archive the current mesocycle's Log data into the History tab."
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
