# data · 清洗与导入脚本

原始数据用 `shared/raw/spotify_songs.csv`（32,833 行 × 23 列，公用库 `spotify_dashboard` 里那份）。
本目录的脚本把它清洗成 24 列，灌进**本方向自己的库 `spotify_genre`**，不改公用表。

## 脚本顺序

```bash
python 01_clean_and_aggregate.py    # 原始 CSV → 清洗 + 六图聚合产物
python 02_import_to_mysql.py        # 清洗后 CSV → MySQL，含自检
```

两个脚本都可以重复跑，`02_import_to_mysql.py` 内置 DDL，会先重建表再导入，幂等。

## 产物

| 文件 | 内容 | 是否进 git |
|---|---|---|
| `genre_songs_clean.csv` | 32,833 × 24 清洗后明细（约 6.9 MB） | 否，脚本可重生成 |
| `genre_dashboard_data.xlsx` | 9 个 sheet：口径说明 / 六图聚合 / 数据字典 / 清洗日志 | 否 |
| `clean_report.json` | 六张图的期望值（机器可读），接口自测基准 | **是** |

## 清洗规则（8 条）

| # | 规则 | 影响行数 |
|---|---|---|
| 1 | 不删行、不去重 | 0 |
| 2 | 只保留本方向需要的列，弃用专辑 id / 专辑名 / key / mode | — |
| 3 | 取日期串前 4 位派生 `release_year` | 全量 |
| 4 | 派生 `release_month`，只有年份的留 NULL（不补 1 月） | 1,855 行 NULL |
| 5 | 派生 `date_precision`（day / month / year） | 全量 |
| 6 | 派生 `popularity_bin` 五档，把分箱固定在数据层 | 全量 |
| 7 | `tempo = 0` 视为缺失转 NULL | 1 行 |
| 8 | 文本列 `NA` / `N/A` / 空串 → NULL，并打 `quality_flag` | 5 行 |

`quality_flag` 取值：`ok` 32,825 / `meta_missing` 5 / `short_track` 2 / `tempo_missing` 1。
**标记但不删除**——剔除这 5 行后各流派平均热度最大变动 0.023 分，排序与 TOP15 完全不变。

## 导入时踩过的坑

- CSV 带 BOM，必须用 `utf-8-sig` 读，否则首列表头变成 `\ufeffid`。
- 音频特征列必须 `DOUBLE`：原始值有 `2.33e-05` 这类科学计数法，`DECIMAL(10,4)` 会被截成 0。
- 空串要转 `None` 才会写成 NULL。
- 本机 `local_infile=0`、`secure_file_priv=NULL`，`LOAD DATA` 用不了，只能 `executemany` 分批 2,000 行导入。
