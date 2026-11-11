# -*- coding: utf-8 -*-
"""
把清洗后的 genre_songs_clean.csv 导入 MySQL 的 spotify_genre.spotify_songs

为什么不用 LOAD DATA：
    本机 MySQL 实测 local_infile=0、secure_file_priv=NULL，
    LOAD DATA LOCAL INFILE 会直接报 3948，改 my.ini 又要重启服务，不值得。
    32,833 行用 executemany 分批 2000，实测几秒完事。

运行：
    C:\\Users\\yyx\\.workbuddy\\binaries\\python\\envs\\default\\Scripts\\python.exe 02_import_to_mysql.py
注意：
    pip 装在 envs\\default，而 PATH 里的 python 是另一个解释器，
    所以必须用上面那个 venv 完整路径跑，直接用 python 会 ModuleNotFoundError。
"""
import csv
import json
import os
import sys

import pymysql

HOST, PORT, USER, PWD = "127.0.0.1", 3306, "root", "123456"
DB = "spotify_genre"
HERE = os.path.dirname(os.path.abspath(__file__))
CSV_PATH = os.path.join(HERE, "genre_songs_clean.csv")
SCHEMA = os.path.join(HERE, "00_schema.sql")
REPORT = os.path.join(HERE, "clean_report.json")

COLS = ["id", "track_id", "track_name", "track_artist", "playlist_id", "playlist_name",
        "playlist_genre", "playlist_subgenre", "track_popularity", "popularity_bin",
        "release_year", "release_month", "date_precision",
        "danceability", "energy", "speechiness", "acousticness", "instrumentalness",
        "liveness", "valence", "tempo", "loudness", "duration_sec", "quality_flag"]

INT_COLS = {"id", "track_popularity", "release_year", "release_month", "duration_sec"}
FLOAT_COLS = {"danceability", "energy", "speechiness", "acousticness", "instrumentalness",
              "liveness", "valence", "tempo", "loudness"}


def to_value(col, raw):
    s = (raw or "").strip()
    if s == "":
        return None
    if col in INT_COLS:
        return int(float(s))
    if col in FLOAT_COLS:
        return float(s)
    return s


def main():
    if not os.path.exists(CSV_PATH):
        sys.exit("找不到 %s，先跑 01_clean_and_aggregate.py" % CSV_PATH)

    conn = pymysql.connect(host=HOST, port=PORT, user=USER, password=PWD,
                           charset="utf8mb4", autocommit=False)
    try:
        with conn.cursor() as cur:
            # 1) 建库建表（幂等：脚本里有 DROP TABLE IF EXISTS）
            sql = open(SCHEMA, encoding="utf-8").read()
            for stmt in [s.strip() for s in sql.split(";") if s.strip()]:
                if stmt.startswith("--"):
                    stmt = "\n".join(l for l in stmt.splitlines()
                                     if not l.strip().startswith("--")).strip()
                if stmt:
                    cur.execute(stmt)
            conn.commit()
            print("[1/3] 表结构就绪: %s.spotify_songs" % DB)

            # 2) 分批写入
            cur.execute("TRUNCATE TABLE spotify_songs")
            placeholders = ",".join(["%s"] * len(COLS))
            insert_sql = "INSERT INTO spotify_songs (%s) VALUES (%s)" % (
                ",".join("`%s`" % c for c in COLS), placeholders)

            batch, total = [], 0
            with open(CSV_PATH, encoding="utf-8-sig", newline="") as f:
                reader = csv.DictReader(f)
                for row in reader:
                    batch.append([to_value(c, row[c]) for c in COLS])
                    if len(batch) >= 2000:
                        cur.executemany(insert_sql, batch)
                        total += len(batch)
                        batch = []
                        print("      ... %d 行" % total, end="\r")
                if batch:
                    cur.executemany(insert_sql, batch)
                    total += len(batch)
            conn.commit()
            print("[2/3] 已写入 %d 行                " % total)

            # 3) 自检
            cur.execute("""SELECT COUNT(*), COUNT(DISTINCT playlist_genre),
                                  COUNT(DISTINCT playlist_subgenre),
                                  ROUND(AVG(track_popularity),2)
                           FROM spotify_songs""")
            n, ng, ns, avg_pop = cur.fetchone()
            print("[3/3] 自检: 行数=%d 流派=%d 子流派=%d 平均热度=%s" % (n, ng, ns, avg_pop))

            ok = (n == 32833 and ng == 6 and ns == 24 and float(avg_pop) == 42.48)
            print("      结果: %s" % ("通过 ✔" if ok else "不通过 ✘ 请对照 clean_report.json 排查"))

            if os.path.exists(REPORT):
                rep = json.load(open(REPORT, encoding="utf-8"))
                cur.execute("""SELECT playlist_genre, COUNT(*), ROUND(AVG(track_popularity),2)
                               FROM spotify_songs GROUP BY playlist_genre
                               ORDER BY COUNT(*) DESC""")
                got = {r[0]: (r[1], float(r[2])) for r in cur.fetchall()}
                print("      逐流派比对:")
                for x in rep["summary"]:
                    g = x["genre"]
                    gn, ga = got.get(g, (0, 0))
                    same = (gn == x["songCount"] and abs(ga - x["avgPopularity"]) < 0.005)
                    print("        %-6s 期望 %4d / %.2f   实际 %4d / %.2f   %s" %
                          (g, x["songCount"], x["avgPopularity"], gn, ga,
                           "一致" if same else "不一致"))
            if not ok:
                sys.exit(1)
    finally:
        conn.close()


if __name__ == "__main__":
    main()
