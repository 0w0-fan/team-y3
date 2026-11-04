# 基础数据画像

> 本文件由 `shared/scripts/01_clean_base.py` 自动生成，请勿手改。

## 一、来源与规模

| 项 | 值 |
|---|---|
| 原始文件 | `shared/raw/spotify_songs.csv` |
| 上游地址 | TidyTuesday 2020-01-21 spotify_songs.csv |
| 清洗后文件 | `shared/csv/spotify_songs_clean.csv` |
| 行数 | 32833 |
| 列数 | 29（原始 23 列 + 派生 6 列） |
| 唯一 track_id | 28356 |
| 全行完全重复 | 0 |
| 文件编码 | UTF-8 with BOM（Excel 与 MySQL 均可正确识别中文） |

## 二、缺失值分布

| 列 | 缺失数 | 占比 |
|---|---|---|
| `track_name` | 5 | 0.015% |
| `track_artist` | 5 | 0.015% |
| `track_album_name` | 5 | 0.015% |
| `release_month` | 1855 | 5.650% |

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
| 不删除任何行 | 原始 32833 行全保留。同一个 `track_id` 出现在多个歌单里是**有效信息**，`playlist_genre` 本身就是分类维度，删掉等于丢掉"这首歌属于哪些歌单" |
| 不按 track_id 去重 | 去重会让行数从 32833 掉到 28356。歌手/专辑维度需要去重，但那属于**第二阶段（各方向自做）**，不该污染公用基础数据 |
| 不改任何数值 | 包括原表里 `track_popularity = 0` 的 2,703 行 —— 0 是"几乎无人收听"的真实值，不是缺失 |
| 不把 `popularity` 的 0 置空 | 同上 |
| 不给只有年份的日期补月日 | 1,855 行原表只有年份。补成 1 月 1 日会造出假的"1 月 1 日发行高峰"，是编造数据。改用 `release_date_precision=year` 如实标注 |
| 不使用 IQR 异常标记 | 对 `instrumentalness` 这类大量取 0 的字段，IQR 会误标。实测按 1.5×IQR 会有 41.5% 的行被标异常，无筛选价值 |
| 不拆歌手名 | `Dimitri Vegas & Like Mike`、`GAMPER & DADONI` 是乐队名，按 `&` 拆会把一个乐队拆成两三个人，且热度无法分摊 |
| 不删空 track_name 的 5 行 | 保留原样，由下游按需处理 |

## 四、字段精度说明

| precision | 行数 | 含义 |
|---|---|---|
| day | 30947 | 精确到日，`release_date_std` 形如 `2019-06-14` |
| month | 31 | 只精确到月 |
| year | 1855 | **只到年**，`release_month` 为 NULL，不要按月份聚合这些行 |
| （空） | 0 | 原始日期缺失 |

## 五、日期覆盖范围

`release_year` 取值范围：1957 – 2020。
注意 2020 年仅 785 行，
数据抓取时点导致的截断，做年度趋势请截止到 2019。
