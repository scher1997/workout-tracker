"""
Entry point. Run with:
    uv run python src/main.py
On first run, a browser tab opens for Google sign-in. After that a token.json
is saved locally so you won't be prompted again.
"""
import os
import sys
from pathlib import Path

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build

# Add src/ to path so sibling imports work
sys.path.insert(0, str(Path(__file__).parent))

import config as cfg_mod
from builder import build_spreadsheet

ROOT       = Path(__file__).parent.parent
CREDS_FILE = ROOT / "credentials.json"
TOKEN_FILE = ROOT / "token.json"

SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive.file",
]


def get_credentials() -> Credentials:
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


def main() -> None:
    if not CREDS_FILE.exists():
        print(f"ERROR: {CREDS_FILE} not found.")
        print("Follow the setup instructions in README.md to download your OAuth credentials.")
        sys.exit(1)

    print("Authenticating with Google…")
    creds   = get_credentials()
    service = build("sheets", "v4", credentials=creds)

    cfg = cfg_mod.load()
    print("Building spreadsheet…")
    url = build_spreadsheet(service, cfg)

    # Save the spreadsheet ID so archive.py can find it without requiring manual input.
    spreadsheet_id = url.split("/d/")[1].split("/")[0]
    output_dir = ROOT / "output"
    output_dir.mkdir(exist_ok=True)
    (output_dir / "spreadsheet_id.txt").write_text(spreadsheet_id)

    print(f"\n✓ Done! Open your sheet here:\n  {url}\n")
    print("Tip: bookmark the URL — re-running this script creates a NEW sheet each time.")
    print("     To archive a finished mesocycle: uv run python src/archive.py")


if __name__ == "__main__":
    main()
