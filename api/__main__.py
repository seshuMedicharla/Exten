"""Start the development API on loopback only: python -m api."""

import os

import uvicorn

from api.app import EXTENSION_ID_PATTERN


def main() -> None:
    extension_id = os.getenv("EXAISEC_EXTENSION_ID", "")
    if not EXTENSION_ID_PATTERN.fullmatch(extension_id):
        raise SystemExit("Set EXAISEC_EXTENSION_ID to the 32-character ID shown at chrome://extensions")
    uvicorn.run("api.app:app", host="127.0.0.1", port=8765, access_log=False, reload=False, workers=1)


if __name__ == "__main__":
    main()
