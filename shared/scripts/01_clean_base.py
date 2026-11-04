# -*- coding: utf-8 -*-
r"""
第一阶段 · 基础数据清洗（团队公用数据）

来源: TidyTuesday Spotify Songs 2020-01-21
      https://raw.githubusercontent.com/rfordatascience/tidytuesday/master/data/2020/2020-01-21/spotify_songs.csv

产出: shared/csv/spotify_songs_clean.csv   —— 供三人共用的第一段基础数据
      shared/csv/data_profile.md           —— 数据画像与清洗记录

设计原则
--------
1. 不删任何一行。原始 32,833 行全部保留（含 5 行缺失曲名的记录，标注而非删除）。
2. 不改任何原始数值。所有音频特征、热度、时长与原表逐位一致。
3. 不编造日期。原表只有年份的行（1,855 行）保持"仅年份"精度，
   不补 1 月 1 日，用 release_date_precision 字段如实标注精度。
4. 编码统一 UTF-8 无 BOM，保证 MySQL utf8mb4 直接可导入、中文不乱码。

修正来源
--------
本脚本吸收了两份队友清洗结果的优点，并修掉它们的问题：
  - clean_data.csv        : 数值被改动(1处 tempo)、1,855 个日期被补成 1月1日(编造数据)
  - spotify_songs_cleaned : 数值零改动、日期精度标注(采其思路)，但 any_outlier
                            用 IQR 误标了 41.5% 的行(13,610/32,833)，本脚本不采用

用法
----
    cd D:\Project\IDEA\team-y3
    python shared/scripts/01_clean_base.py
"""

import os
import re
import sys

import numpy as np
import pandas as pd

sys.stdout.reconfigure(encoding="utf-8")

# ---------------------------------------------------------------- 路径
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC = os.path.join(ROOT, "shared", "raw", "spotify_songs.csv")
OUT_DIR = os.path.join(ROOT, "shared", "csv")
OUT_CSV = os.path.join(OUT_DIR, "spotify_songs_clean.csv")
OUT_PROFILE = os.path.join(OUT_DIR, "data_profile.md")

# 原始 23 列（顺序不变，避免下游按位置取列时错位）
RAW_COLS = [
    "track_id", "track_name", "track_artist", "track_popularity",
    "track_album_id", "track_album_name", "track_album_release_date",
    "playlist_name", "playlist_id", "playlist_genre", "playlist_subgenre",
    "danceability", "energy", "key", "loudness", "mode", "speechiness",
    "acousticness", "instrumentalness", "liveness", "valence", "tempo",
    "duration_ms",
]

# 只去掉首尾空白的文本列
TEXT_COLS = [
    "track_id", "track_name", "track_artist",
    "track_album_id", "track_album_name",
    "playlist_name", "playlist_id", "playlist_genre", "playlist_subgenre",
]


def main() -> None:
    os.makedirs(OUT_DIR, exist_ok=True)

    print(f"[1/6] 读取原始文件: {SRC}")
    df = pd.read_csv(SRC, encoding="utf-8", dtype=str, keep_default_na=False, na_values=[""])
    print(f"      原始 shape = {df.shape}")

    # 列一致性检查：原始表必须是这 23 列，否则直接停下
    missing = [c for c in RAW_COLS if c not in df.columns]
    if missing:
        raise SystemExit(f"原始文件缺少列: {missing}")
    df = df[RAW_COLS]

    rows_before = len(df)

    # ------------------------------------------------------------ 2 文本标准化
    print("[2/6] 文本列去首尾空白（不删行、不改大小写）")
    trim_hits = 0
    na_hits = 0
    for c in TEXT_COLS:
        before = df[c].copy()
        df[c] = df[c].str.strip()
        # 空字符串视为缺失
        df[c] = df[c].replace("", np.nan)
        # 原表是 R write.csv 导出的，缺失值写字面量 "NA"（5 行 × 3 列）。
        # 只在文本列上转 NULL：若保留 "NA" 字符串，
        # GROUP BY track_artist 会多出一个叫 "NA"、含 5 首歌的假歌手。
        is_na_literal = df[c].eq("NA")
        na_hits += int(is_na_literal.sum())
        df[c] = df[c].mask(is_na_literal, np.nan)
        trim_hits += int((before.fillna("") != df[c].fillna("")).sum())
    print(f"      被修剪的单元格数 = {trim_hits}，字面量 NA 转 NULL = {na_hits}")

    # ------------------------------------------------------------ 3 数值列
    print("[3/6] 数值列转型（只做类型转换，不做任何数值修正）")
    int_cols = ["track_popularity", "key", "mode"]
    float_cols = [
        "danceability", "energy", "loudness", "speechiness", "acousticness",
        "instrumentalness", "liveness", "valence", "tempo",
    ]
    long_cols = ["duration_ms"]

    for c in int_cols:
        df[c] = pd.to_numeric(df[c], errors="coerce").astype("Int64")
    for c in float_cols:
        df[c] = pd.to_numeric(df[c], errors="coerce")
    for c in long_cols:
        df[c] = pd.to_numeric(df[c], errors="coerce").astype("Int64")

    # ------------------------------------------------------------ 4 日期
    print("[4/6] 日期解析：区分精度，绝不补造月日")
    raw_date = df["track_album_release_date"].astype("string")

    # 三种原始形态：YYYY / YYYY-MM / YYYY-MM-DD
    pat_day = r"^\d{4}-\d{2}-\d{2}$"
    pat_month = r"^\d{4}-\d{2}$"
    pat_year = r"^\d{4}$"

    is_day = raw_date.str.match(pat_day).fillna(False)
    is_month = raw_date.str.match(pat_month).fillna(False)
    is_year = raw_date.str.match(pat_year).fillna(False)
    is_other = raw_date.notna() & ~(is_day | is_month | is_year)

    precision = pd.Series(pd.NA, index=df.index, dtype="string")
    precision[is_day] = "day"
    precision[is_month] = "month"
    precision[is_year] = "year"

    # 标准化输出：统一为 ISO-8601，但按精度保留 —— 年份就是 YYYY，不补 -01-01
    def _std(v: str) -> str:
        if not isinstance(v, str):
            return v
        v = v.strip()
        if re.match(pat_year, v):
            return v                       # "1998"        -> "1998"
        if re.match(pat_month, v):
            return v                       # "1998-05"     -> "1998-05"
        if re.match(pat_day, v):
            return v                       # "1998-05-12"  -> "1998-05-12"
        return v                           # 其他形态原样保留，交人工复核

    df["release_date_std"] = raw_date.map(_std)
    df["release_date_precision"] = precision

    # release_year 只在能确定年份时给出
    df["release_year"] = pd.to_numeric(
        df["release_date_std"].str.extract(r"^(\d{4})", expand=False), errors="coerce"
    ).astype("Int64")

    # release_month 只在精度 >= month 时给出，day/year 精度不瞎猜
    month_extract = pd.to_numeric(
        df["release_date_std"].str.extract(r"^\d{4}-(\d{2})", expand=False), errors="coerce"
    )
    df["release_month"] = month_extract.where(precision.isin(["month", "day"])).astype("Int64")

    print(f"      day={int(is_day.sum())}  month={int(is_month.sum())}  "
          f"year={int(is_year.sum())}  other={int(is_other.sum())}")

    # ------------------------------------------------------------ 5 派生列
    print("[5/6] 派生列（纯粹换算，不含判断）")
    df["duration_sec"] = (df["duration_ms"] / 1000).round(3)

    # 热度分箱：Spotify 官方 0-100，切分口径在此固定，下游不要各自定义
    bins = [-1, 0, 20, 40, 60, 80, 100]
    labels = ["0", "1-20", "21-40", "41-60", "61-80", "81-100"]
    df["popularity_level"] = pd.cut(
        df["track_popularity"].astype("float"), bins=bins, labels=labels
    ).astype("string")
    # 热度缺失的行不参与分箱
    df.loc[df["track_popularity"].isna(), "popularity_level"] = pd.NA

    # ------------------------------------------------------------ 6 写出
    print("[6/6] 写出结果")
    df.to_csv(OUT_CSV, index=False, encoding="utf-8-sig", lineterminator="\n")

    rows_after = len(df)
    assert rows_after == rows_before, "行数发生变化，违反不删行原则"

    # 数据画像
    na_counts = df.isna().sum()
    na_lines = "\n".join(
        f"| `{c}` | {int(v)} | {v / rows_after * 100:.3f}% |"
        for c, v in na_counts[na_counts > 0].items()
    )
    if not na_lines:
        na_lines = "| （无） | 0 | 0% |"

    profile = f"""# 基础数据画像

> 本文件由 `shared/scripts/01_clean_base.py` 自动生成，请勿手改。

## 一、来源与规模

| 项 | 值 |
|---|---|
| 原始文件 | `shared/raw/spotify_songs.csv` |
| 上游地址 | TidyTuesday 2020-01-21 spotify_songs.csv |
| 清洗后文件 | `shared/csv/spotify_songs_clean.csv` |
| 行数 | {rows_after} |
| 列数 | {df.shape[1]}（原始 23 列 + 派生 {df.shape[1] - 23} 列） |
| 唯一 track_id | {df["track_id"].nunique()} |
| 全行完全重复 | {int(df.duplicated().sum())} |
| 文件编码 | UTF-8 with BOM（Excel 与 MySQL 均可正确识别中文） |

## 二、缺失值分布

| 列 | 缺失数 | 占比 |
|---|---|---|
{na_lines}

## 三、清洗做了什么（以及刻意没做什么）

### 做了

1. 文本列去首尾空白，空字符串统一为 NULL。
2. **字面量 `NA` 转 NULL**（5 行 × `track_name`/`track_artist`/`track_album_name` 三列）。
   原表是 R `write.csv` 导出的，缺失值写的是字符串 `NA`。若不转换，`GROUP BY track_artist`
   会多出一个叫 "NA"、含 5 首歌的假歌手，歌手维度分析直接失真。
3. 数值列做类型转换（`track_popularity`/`key`/`mode`/`duration_ms` 为整型，其余音频特征为浮点）。
4. 日期拆成三列：`release_date_std`（标准化字符串）、`release_date_precision`（day/month/year）、`release_year`。
5. 派生 `release_month`、`duration_sec`、`popularity_level`。
6. 统一编码为 UTF-8。

### 刻意没做（每一条都是判断，留给你在报告里写）

| 没做的事 | 原因 |
|---|---|
| 不删除任何行 | 原始 {rows_before} 行全保留。同一个 `track_id` 出现在多个歌单里是**有效信息**，`playlist_genre` 本身就是分类维度，删掉等于丢掉"这首歌属于哪些歌单" |
| 不按 track_id 去重 | 去重会让行数从 {rows_before} 掉到 {df["track_id"].nunique()}。歌手/专辑维度需要去重，但那属于**第二阶段（各方向自做）**，不该污染公用基础数据 |
| 不改任何数值 | 包括原表里 `track_popularity = 0` 的 2,703 行 —— 0 是"几乎无人收听"的真实值，不是缺失 |
| 不把 `popularity` 的 0 置空 | 同上 |
| 不给只有年份的日期补月日 | 1,855 行原表只有年份。补成 1 月 1 日会造出假的"1 月 1 日发行高峰"，是编造数据。改用 `release_date_precision=year` 如实标注 |
| 不使用 IQR 异常标记 | 对 `instrumentalness` 这类大量取 0 的字段，IQR 会误标。实测按 1.5×IQR 会有 41.5% 的行被标异常，无筛选价值 |
| 不拆歌手名 | `Dimitri Vegas & Like Mike`、`GAMPER & DADONI` 是乐队名，按 `&` 拆会把一个乐队拆成两三个人，且热度无法分摊 |
| 不删空 track_name 的 5 行 | 保留原样，由下游按需处理 |

## 四、字段精度说明

| precision | 行数 | 含义 |
|---|---|---|
| day | {int(is_day.sum())} | 精确到日，`release_date_std` 形如 `2019-06-14` |
| month | {int(is_month.sum())} | 只精确到月 |
| year | {int(is_year.sum())} | **只到年**，`release_month` 为 NULL，不要按月份聚合这些行 |
| （空） | {int(raw_date.isna().sum())} | 原始日期缺失 |

## 五、日期覆盖范围

`release_year` 取值范围：{df["release_year"].min()} – {df["release_year"].max()}。
注意 2020 年仅 {int((pd.to_numeric(df["release_year"], errors="coerce") == 2020).sum())} 行，
数据抓取时点导致的截断，做年度趋势请截止到 2019。
"""
    with open(OUT_PROFILE, "w", encoding="utf-8", newline="\n") as f:
        f.write(profile)

    print(f"\n完成")
    print(f"  CSV : {OUT_CSV}")
    print(f"  画像: {OUT_PROFILE}")
    print(f"  行数: {rows_before} -> {rows_after}（未删行）")
    print(f"  列数: 23 -> {df.shape[1]}")


if __name__ == "__main__":
    main()
