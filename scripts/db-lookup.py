#!/usr/bin/env python3
"""Tiny SQLite lookup helper for API test scripts: db-lookup.py <sql> [default]"""
import sqlite3
import sys

con = sqlite3.connect("db/custom.db")
try:
    row = con.execute(sys.argv[1]).fetchone()
    print(row[0] if row else (sys.argv[2] if len(sys.argv) > 2 else ""))
except Exception as e:  # noqa: BLE001 — test helper
    print(f"ERR:{e}", file=sys.stderr)
    print(sys.argv[2] if len(sys.argv) > 2 else "")
