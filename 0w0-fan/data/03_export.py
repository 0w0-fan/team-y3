#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
第二阶段（本人方向）· 数据落盘导出

把数据库里的东西导出成可直接交付 / 归档的文件：

  1. export/artist_track_view.csv   去重后的清洗数据（28,356 行），UTF-8 BOM，Excel 双击不乱码
  2. export/artist_favorite.csv     关注歌手表当前内容（页面交互件写进去的数据）
  3. export/song_tag.csv            歌曲标签表当前内容
  4. export/spotify_dashboard_schema.sql
                                    库结构：3 张表的建表语句 + 去重视图的建视图语句（不含数据）
                                    用途：换台机器或交给老师时，一条命令还原库结构

为什么单独写脚本而不是用 Navicat 导出：
  · 可复现：随时一条命令重跑，结果一致；
  · 可版本化：脚本进 git；导出的数据文件体积大，放在 export/ 里不进 git（见 .gitignore）。

跑法：
    cd D:\\Project\\IDEA\\team-y3
    python 0w0-fan/data/03_export.py

依赖 pymysql；连接参数可用环境变量覆盖：DB_HOST / DB_PORT / DB_USER / DB_PASSWORD / DB_NAME
"""

import csv
import io
import os
import sys

import pymysql

HERE = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = os.path.join(HERE, "export")

DB = {
    "host": os.environ.get("DB_HOST", "127.0.0.1"),
    "port": int(os.environ.get("DB_PORT", "3306")),
    "user": os.environ.get("DB_USER", "root"),
    "password": os.environ.get("DB_PASSWORD", "123456"),
    "database": os.environ.get("DB_NAME", "spotify_dashboard"),
    "charset": "utf8mb4",
}

# 要导出的对象：文件名 -> (对象名, 说明)
EXPORTS = [
    ("artist_track_view.csv", "artist_track_view", "去重后的歌曲明细（28,356 行，本方向全部图表的口径基础）"),
    ("artist_favorite.csv", "artist_favorite", "关注的歌手（页面交互件写入）"),
    ("song_tag.csv", "song_tag", "歌曲标签（页面交互件写入）"),
]

SCHEMA_SQL = os.path.join(OUT_DIR, "spotify_dashboard_schema.sql")


def export_table(conn, filename, table, comment):
    """把一个表/视图整体导出成 CSV（带表头，UTF-8 BOM 便于 Excel 直接打开）。"""
    path = os.path.join(OUT_DIR, filename)
    with conn.cursor() as cur:
        cur.execute("SELECT * FROM `%s`" % table)
        columns = [d[0] for d in cur.description]
        rows = cur.fetchall()

    # newline='' 是 csv 模块的要求；utf-8-sig 让 Excel 认出中文
    with io.open(path, "w", encoding="utf-8-sig", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(columns)
        writer.writerows(rows)

    size_kb = os.path.getsize(path) / 1024.0
    print("  [导出] %-28s %6d 行  %8.1f KB  %s" % (filename, len(rows), size_kb, comment))
    return len(rows)


def export_schema(conn):
    """导出库结构：每张表 SHOW CREATE TABLE，视图 SHOW CREATE VIEW。"""
    parts = [
        "-- =====================================================================",
        "-- Spotify 大屏 · 库结构导出（只含结构，不含数据）",
        "-- 生成方式：python 0w0-fan/data/03_export.py",
        "-- 用途：在新机器上还原库结构，再配合 01_import_raw.py / 02_build_view.py 灌数据",
        "-- =====================================================================",
        "CREATE DATABASE IF NOT EXISTS spotify_dashboard",
        "  DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;",
        "USE spotify_dashboard;",
        "",
    ]

    with conn.cursor() as cur:
        cur.execute("SHOW TABLES")
        objects = [r[0] for r in cur.fetchall()]

        for name in objects:
            cur.execute("SHOW FULL TABLES LIKE %s", (name,))
            kind = cur.fetchone()[1]  # BASE TABLE / VIEW

            if kind == "BASE TABLE":
                cur.execute("SHOW CREATE TABLE `%s`" % name)
                ddl = cur.fetchone()[1]
                parts.append("-- ---------- 表 %s ----------" % name)
                parts.append("DROP TABLE IF EXISTS `%s`;" % name)
                parts.append(ddl + ";")
            else:
                cur.execute("SHOW CREATE VIEW `%s`" % name)
                ddl = cur.fetchone()[1]
                parts.append("-- ---------- 视图 %s ----------" % name)
                parts.append("DROP VIEW IF EXISTS `%s`;" % name)
                parts.append(ddl + ";")
            parts.append("")

    with io.open(SCHEMA_SQL, "w", encoding="utf-8", newline="\n") as f:
        f.write("\n".join(parts))

    print("  [导出] %-28s %6d 个对象  %8.1f KB  表结构 + 视图定义"
          % (os.path.basename(SCHEMA_SQL), len(objects), os.path.getsize(SCHEMA_SQL) / 1024.0))


def main():
    if not os.path.isdir(OUT_DIR):
        os.makedirs(OUT_DIR)

    try:
        conn = pymysql.connect(**DB)
    except Exception as exc:                                  # noqa: BLE001
        print("连接数据库失败：%s" % exc)
        return 1

    print("[1] 导出对象数据 → %s" % OUT_DIR)
    try:
        total = 0
        for filename, table, comment in EXPORTS:
            total += export_table(conn, filename, table, comment)

        print("[2] 导出库结构")
        export_schema(conn)

        print()
        print(">>> 完成：%d 行数据 + 1 份结构 SQL，都在 %s" % (total, OUT_DIR))
        print("    提示：export/ 体积较大（去重数据约 6 MB），已加入 .gitignore，不进 git。")
        return 0
    finally:
        conn.close()


if __name__ == "__main__":
    sys.exit(main())
