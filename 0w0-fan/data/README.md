# 0w0-fan · 第二阶段清洗脚本

本目录只放**本人方向**的第二阶段清洗产物。第一阶段（`shared/`）刻意只导入不清洗，
所以去重、派生列这些动作全部在这里完成，且**不改主表** `spotify_songs`。

---

## 一、文件

| 文件 | 作用 |
|---|---|
| `02_build_view.py` | **一键执行脚本**：执行 SQL 建视图，并自动跑一遍校验后打印结果 |
| `02_member_view.sql` | 建歌曲级去重视图 `artist_track_view`，并派生 `duration_min` / `release_year` / `popularity_level` 三个列 |
| `03_export.py` | 数据落盘：导出去重数据 CSV（28,356 行）+ 库结构 SQL，用于提交与归档 |
| `export/` | 上面脚本的产物（约 5.1 MB，已加入 .gitignore，不进 git） |

两张交互表（`artist_favorite`、`song_tag`）的建表脚本按约定放在 `shared/sql/02_member_tables.sql`。

## 二、怎么跑

```bash
cd D:\Project\IDEA\team-y3
D:\Project\mysql\mysql-8.4.13-winx64\bin\mysql.exe -uroot -p123456 spotify_dashboard < 0w0-fan/data/02_member_view.sql
```

脚本是幂等的（先 `DROP VIEW IF EXISTS` 再 `CREATE VIEW`），可以重复执行。

Navicat 里也可以直接把 `02_member_view.sql` 的内容贴到查询窗口执行。

## 三、去重口径

原始主表 32,833 行，其中 4,477 行是**同一首歌被多个歌单收录**产生的记录。
这些重复行只有 `playlist_name / playlist_id / playlist_genre / playlist_subgenre`
四个字段不同，歌曲本身的热度与音频特征完全一致。

去重做法：按 `track_id` 分组取 `MIN(id)`，拿这一行代表这首歌。
歌单维度的信息不在本方向的图里使用，所以直接丢掉，不去分摊。

视图保留的列：标识与文本 6 列、热度 1 列、时长 1 列、派生 3 列、音频特征 4 列、歌单分类 2 列。

## 四、派生列口径

| 派生列 | 规则 | 说明 |
|---|---|---|
| `duration_min` | `ROUND(duration_ms / 60000, 2)` | 分钟，保留 2 位 |
| `release_year` | `LEFT(track_album_release_date, 4)` → `CAST(... AS UNSIGNED)`，且必须匹配 `^[0-9]{4}`、落在 1900–2100 | 原表日期是字符串且三种格式混存，非法格式留 **NULL**，不补成 1 月 1 日 |
| `popularity_level` | `0=cold` / `1-29=low` / `30-59=mid` / `60-79=high` / `80-100=hot` | `track_popularity = 0` 是真实值不是缺失 |

## 五、跑完怎么校验

```sql
-- 1. 行数必须等于去重后的歌数
SELECT COUNT(*) FROM artist_track_view;                 -- 28356

-- 2. 每个 track_id 只出现一次
SELECT COUNT(*), COUNT(DISTINCT track_id) FROM artist_track_view;   -- 都是 28356

-- 3. 派生列没有越界值
SELECT MIN(release_year), MAX(release_year) FROM artist_track_view; -- 1957 ~ 2020
SELECT MIN(duration_min), MAX(duration_min) FROM artist_track_view; -- 0.07 ~ 8.63

-- 4. 热度分档没有 NULL
SELECT popularity_level, COUNT(*) FROM artist_track_view GROUP BY popularity_level;
```

## 六、导出数据（03_export.py）

```bash
cd D:\Project\IDEA	eam-y3
python 0w0-fan/data/03_export.py
```

输出到 `0w0-fan/data/export/`：

| 文件 | 内容 | 体积 |
|---|---|---|
| `artist_track_view.csv` | 去重后的歌曲明细，28,356 行 × 20 列，UTF-8 BOM（Excel 双击不乱码） | 约 5.1 MB |
| `artist_favorite.csv` | 关注歌手表当前内容 | 随交互数据变化 |
| `song_tag.csv` | 歌曲标签表当前内容 | 随交互数据变化 |
| `spotify_dashboard_schema.sql` | 库结构：3 张表 + 1 个视图的 DDL（不含数据） | 约 6 KB |

为什么单独写脚本而不是用 Navicat 导出：可复现（随时重跑、结果一致）、
可版本化（脚本进 git，导出的数据文件体积大不进 git）。

## 七、注意

- 视图列不写 `COLLATE`，直接继承主表的 `utf8mb4_bin`，保证 `Billing` 与 `BILLING` 不被合并成同一个歌手。
- 视图是**只读**的，页面上的增删改都写 `artist_favorite` / `song_tag` 两张独立表。
