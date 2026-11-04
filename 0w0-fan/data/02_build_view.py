#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
第二阶段（本人方向）· 构建歌曲级去重视图 artist_track_view

做的事情：
  1. 执行同目录下的 02_member_view.sql（DROP VIEW IF EXISTS + CREATE VIEW）
  2. 跑一遍校验：行数、一歌一行、派生列范围、热度分档
  3. 把校验结果打印出来

跑法：
    cd D:\\Project\\IDEA\\team-y3
    python 0w0-fan/data/02_build_view.py

连接参数默认 root/123456@127.0.0.1:3306/spotify_dashboard，
可用环境变量覆盖：DB_HOST / DB_PORT / DB_USER / DB_PASSWORD / DB_NAME
"""

import os
import sys

import pymysql

HERE = os.path.dirname(os.path.abspath(__file__))
SQL_FILE = os.path.join(HERE, "02_member_view.sql")

DB = {
    "host": os.environ.get("DB_HOST", "127.0.0.1"),
    "port": int(os.environ.get("DB_PORT", "3306")),
    "user": os.environ.get("DB_USER", "root"),
    "password": os.environ.get("DB_PASSWORD", "123456"),
    "database": os.environ.get("DB_NAME", "spotify_dashboard"),
    "charset": "utf8mb4",
}

VIEW = "artist_track_view"
EXPECT_VIEW_ROWS = 28356      # 去重后的歌曲数
EXPECT_RAW_ROWS = 32833       # 主表行数


def read_sql(path):
    """读建视图脚本，去掉注释行后按分号拆成独立语句。"""
    with open(path, "r", encoding="utf-8") as f:
        raw = f.read()

    lines = []
    for line in raw.splitlines():
        stripped = line.strip()
        if stripped.startswith("--") or not stripped:
            continue
        lines.append(line)
    text = "\n".join(lines)

    statements = []
    for chunk in text.split(";"):
        stmt = chunk.strip()
        if stmt:
            statements.append(stmt)
    return statements


def build(conn):
    statements = read_sql(SQL_FILE)
    with conn.cursor() as cur:
        for stmt in statements:
            cur.execute(stmt)
    print("[1] 已执行 %d 条语句，视图 %s 重建完成" % (len(statements), VIEW))


def one(conn, sql):
    with conn.cursor() as cur:
        cur.execute(sql)
        return cur.fetchone()


def check(conn):
    ok = True

    raw_rows = one(conn, "SELECT COUNT(*) FROM spotify_songs")[0]
    view_rows = one(conn, "SELECT COUNT(*) FROM %s" % VIEW)[0]
    distinct_track = one(conn, "SELECT COUNT(DISTINCT track_id) FROM %s" % VIEW)[0]
    year_min, year_max, year_null = one(
        conn, "SELECT MIN(release_year), MAX(release_year), SUM(release_year IS NULL) FROM %s" % VIEW)
    dur_min, dur_max = one(
        conn, "SELECT MIN(duration_min), MAX(duration_min) FROM %s" % VIEW)
    levels = one(
        conn, "SELECT COUNT(*), COUNT(popularity_level) FROM %s" % VIEW)

    print("[2] 主表行数            : %d" % raw_rows)
    print("    视图行数            : %d  (期望 %d)  %s"
          % (view_rows, EXPECT_VIEW_ROWS, "OK" if view_rows == EXPECT_VIEW_ROWS else "FAIL"))
    ok &= view_rows == EXPECT_VIEW_ROWS

    print("    视图内唯一 track_id : %d  (应等于视图行数，即一歌一行)  %s"
          % (distinct_track, "OK" if distinct_track == view_rows else "FAIL"))
    ok &= distinct_track == view_rows

    print("    release_year 范围   : %s ~ %s，NULL 行数 %s" % (year_min, year_max, year_null))
    print("    duration_min 范围   : %s ~ %s" % (dur_min, dur_max))

    total, level_not_null = levels[0], levels[1]
    print("    popularity_level    : %d/%d 行有值  %s"
          % (level_not_null, total, "OK" if level_not_null == total else "FAIL"))
    ok &= level_not_null == total

    with conn.cursor() as cur:
        cur.execute("SELECT popularity_level, COUNT(*) FROM %s GROUP BY popularity_level "
                    "ORDER BY COUNT(*) DESC" % VIEW)
        print("    热度分档分布        : " + ", ".join("%s=%d" % (r[0], r[1]) for r in cur.fetchall()))

    return ok


def main():
    try:
        conn = pymysql.connect(**DB)
    except Exception as exc:                      # noqa: BLE001
        print("连接数据库失败：%s" % exc)
        return 1

    try:
        build(conn)
        ok = check(conn)
        print()
        print(">>> 结果：%s" % ("全部校验通过" if ok else "存在校验失败项，请检查"))
        return 0 if ok else 2
    finally:
        conn.close()


if __name__ == "__main__":
    sys.exit(main())
