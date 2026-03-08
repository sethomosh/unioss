#!/usr/bin/env python3
# save as backend/scripts/debug_db_connect.py and run with same env where you run the poller

import os, mysql.connector, traceback

cfg = {
    "host": os.getenv("UNIOSS_DB_HOST", "127.0.0.1"),
    "user": os.getenv("UNIOSS_DB_USER", "unioss_user"),
    "password": os.getenv("UNIOSS_DB_PASS", "StrongP@ssw0rd"),
    "database": os.getenv("UNIOSS_DB_NAME", "unioss"),
    "port": int(os.getenv("UNIOSS_DB_PORT", 3307)),
    "autocommit": True,
}

print("using db config:", cfg)
try:
    cn = mysql.connector.connect(**cfg)
    cur = cn.cursor()
    cur.execute("SELECT USER(), CURRENT_USER(), DATABASE();")
    user_row = cur.fetchone()
    print("select results -> USER(), CURRENT_USER(), DATABASE():", user_row)

    # current_user looks like "user@host" -> split and show grants for that exact account
    current_user = user_row[1] or ""
    if "@" in current_user:
        u, h = current_user.split("@", 1)
        show_grants_q = f"SHOW GRANTS FOR '{u}'@'{h}';"
        print("running:", show_grants_q)
        cur.execute(show_grants_q)
        for r in cur:
            print(r[0])
    else:
        print("could not parse CURRENT_USER() ->", current_user)

    cur.close()
    cn.close()
    print("connection test: success")
except Exception:
    print("connection test: failed, traceback follows")
    traceback.print_exc()
