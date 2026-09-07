from __future__ import annotations

import psycopg
from psycopg.rows import dict_row

from newsletter_integration_api.config import read_database_url

CONNECT_TIMEOUT_SECONDS = 2
STATEMENT_TIMEOUT_MS = 2000


class DatabaseUnavailable(Exception):
    pass


def connect() -> psycopg.Connection:
    url = read_database_url()
    if url is None:
        raise DatabaseUnavailable()

    try:
        connection = psycopg.connect(
            url,
            connect_timeout=CONNECT_TIMEOUT_SECONDS,
            row_factory=dict_row,
        )
        connection.execute(f"SET statement_timeout = {STATEMENT_TIMEOUT_MS}")
        return connection
    except psycopg.Error:
        raise DatabaseUnavailable() from None
