from __future__ import annotations

import os

DATABASE_URL_ENV = "INTEGRATION_DATABASE_URL"


def read_database_url() -> str | None:
    value = os.environ.get(DATABASE_URL_ENV, "").strip()
    return value or None
