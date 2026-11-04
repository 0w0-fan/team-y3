# -*- coding: utf-8 -*-
"""
第二阶段导入 · 把清洗后的 CSV 灌进 MySQL

为什么不用 LOAD DATA：
  本机 MySQL 8.4 的 local_infile = OFF，且 secure_file_priv = NULL，
  LOAD DATA LOCAL INFILE 会被服务端拒绝。用 pymysql 分批 executemany 走
  普通 INSERT 通道，不依赖服务端开关，任何机器都能跑。

用法：
    pip install pymysql
    python shared/scripts/02_import_mysql.py

前置：
    已建库 spotify_dashboard 与表 spotify_songs（执行 shared/sql/01_schema.sql）
"""

import os
import sys
import time

import pandas as pd
import pymysql

sys.stdout.reconfigure(encoding="utf-8")

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
CSV = os.path.join(ROOT, "shared", "csv", "spotify_songs_clean.csv")
SQL = os.path.join(ROOT, "shared", "sql", "01_schema.sql")

# 数据库连接：与 application.properties 保持一致
DB = dict(host="127.0.0.1", port=3306, user="root", password="123456",
          charset="utf8mb4", database="spotify_dashboard")

# CSV 列 -> 表列（顺序即 INSERT 顺序，不含自增主键 id）
COLS = [
    "track_id", "track_name", "track_artist", "track_popularity",
    "track_album_id", "track_album_name", "track_album_release_date",
    "playlist_name", "playlist_id", "playlist_genre", "playlist_subgenre",
    "danceability", "energy", "key", "loudness", "mode", "speechiness",
    "acousticness", "instrumentalness", "liveness", "valence", "tempo",
    "duration_ms", "release_date_std", "release_date_precision",
    "release_year", "release_month", "duration_sec", "popularity_level",
]

EXPECTED_ROWS = 32833
EXPECTED_TRACKS = 28356
EXPECTED_ZERO_POP = 2703
EXPECTED_YEAR_PRECISION = 1855


def main() -> None:
    print(f"[1/4] 读取 {CSV}")
    if not os.path.exists(CSV):
        raise SystemExit("找不到清洗后的 CSV，先跑 01_clean_base.py")
    df = pd.read_csv(CSV, encoding="utf-8-sig", dtype=str, keep_default_na=False, na_values=[""])
    print(f"      shape = {df.shape}")

    missing = [c for c in COLS if c not in df.columns]
    if missing:
        raise SystemExit(f"CSV 缺少列: {missing}")
    df = df[COLS]

    # 空字符串 -> None，让 MySQL 存 NULL 而不是空串
    records = [
        tuple(None if (pd.isna(v) or v == "") else v for v in row)
        for row in df.itertuples(index=False, name=None)
    ]

    print(f"[2/4] 连接 MySQL {DB['host']}:{DB['port']}/{DB['database']}")
    conn = pymysql.connect(**DB)
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) FROM spotify_songs")
            existing = cur.fetchone()[0]
            if existing:
                print(f"      表内已有 {existing} 行，先清空")
                cur.execute("TRUNCATE TABLE spotify_songs")
                conn.commit()

        print(f"[3/4] 分批插入 {len(records)} 行")
        placeholders = ",".join(["%s"] * len(COLS))
        col_list = ",".join(f"`{c}`" for c in COLS)
        sql = f"INSERT INTO spotify_songs ({col_list}) VALUES ({placeholders})"

        batch, total = 2000, 0
        t0 = time.time()
        with conn.cursor() as cur:
            cur.execute("SET NAMES utf8mb4")
            for i in range(0, len(records), batch):
                cur.executemany(sql, records[i:i + batch])
                conn.commit()
                total += len(records[i:i + batch])
                print(f"      {total}/{len(records)}", end="\r")
        print(f"\n      插入完成，用时 {time.time() - t0:.1f}s")

        print("[4/4] 校验")
        checks = []
        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) FROM spotify_songs")
            checks.append(("总行数", cur.fetchone()[0], EXPECTED_ROWS))
            cur.execute("SELECT COUNT(DISTINCT track_id) FROM spotify_songs")
            checks.append(("唯一 track_id", cur.fetchone()[0], EXPECTED_TRACKS))
            cur.execute("SELECT COUNT(*) FROM spotify_songs WHERE track_popularity = 0")
            checks.append(("热度为 0", cur.fetchone()[0], EXPECTED_ZERO_POP))
            cur.execute("SELECT COUNT(*) FROM spotify_songs WHERE release_date_precision = 'year'")
            checks.append(("仅年份精度", cur.fetchone()[0], EXPECTED_YEAR_PRECISION))
            cur.execute("SELECT COUNT(*) FROM spotify_songs WHERE track_name IS NULL")
            checks.append(("曲名为空", cur.fetchone()[0], 5))
            cur.execute(
                "SELECT COUNT(*) FROM spotify_songs WHERE release_date_std REGEXP '^[0-9]{4}$'"
            )
            checks.append(("日期仅 4 位年份", cur.fetchone()[0], EXPECTED_YEAR_PRECISION))

        ok = True
        print(f"      {'指标':<18}{'实际':>10}{'期望':>10}  结果")
        for name, actual, expected in checks:
            passed = actual == expected
            ok = ok and passed
            print(f"      {name:<18}{actual:>10}{expected:>10}  {'OK' if passed else 'FAIL'}")

        if not ok:
            raise SystemExit("校验未通过，检查导入过程")
        print("\n全部校验通过。")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
