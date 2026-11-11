# 方向六 · “响度战争”与音乐物理属性变迁史

播放列表数据 → 清洗入库 → Spring Boot 接口 → ECharts 大屏，一条完整的前后端链路。

---

## 1. 目录结构

```
src/main/java/org/springboot/demo/spotify2/
├── SpotifyApplication.java          启动类（只扫描本包，可与方向一并存）
├── config/CorsConfig.java           /api/** 跨域
├── controller/StatsController.java  5 个分析接口
├── service/StatsService.java        窗口函数 SQL + 结论摘要
├── common/Result.java               统一响应 code / msg / data
└── resources/application.yml        配置副本（对齐工程根 application.properties）

src/main/resources/static/time/      大屏（访问 http://localhost:8080/time/index.html）
├── index.html
├── css/screen.css
├── js/screen.js                     ECharts option + 接口调用
├── js/echarts-lite.js               断网时的内置渲染器
└── data/dashboard.json、quality.json  离线快照
```

---

## 2. 数据链路

| 环节 | 说明 |
| --- | --- |
| 原始数据 | `spotify_songs_best.csv`，32,833 行，**播放列表粒度**（同一首歌出现在多个歌单里） |
| 去重 | 按 `track_id` 去重，保留流行度最高的一条 → 28,356 首 |
| 异常剔除 | 时长 <30s 或 >15min（2 首）、响度越界（3 首）→ **28,351 首入库** |
| 派生字段 | `duration_min`、`decade`、`era5`（五年分组）、`is_short`(<2′30″)、`is_long`(>5′)、`playlist_cnt`(覆盖歌单数) |
| 落库 | `spotify_db.spotify_tracks`，28,351 行，建表脚本见工程外的 `sql/01_spotify_tracks.sql` |

> 方向和一的 `spotify_songs` 原样保留，未被修改；本模块只读自己的 `spotify_tracks`。

---

## 3. 接口

所有分位数（P10 / P25 / 中位数 / P75 / P99）都由 MySQL 8 窗口函数 `ROW_NUMBER() OVER (PARTITION BY ...)` 计算，明细不出库。

| 方法 | 路径 | 说明 | 主要字段 |
| --- | --- | --- | --- |
| GET | `/api/time/duration-evolution` | 时长演化 | `era5[]`（五数概括+均值+短歌占比）、`year[]`（逐年中位数）、`summary` |
| GET | `/api/time/loudness-war` | 响度战争 | `year[]`（mean / median / p10 / p90 / min / max）、`decade[]`、`summary` |
| GET | `/api/time/bpm-distribution` | BPM 年代分布 | `hist[]`（年代×5BPM 分箱频数）、`decade[]`（四分位、120BPM 命中率）、`refBpm`、`summary` |
| GET | `/api/time/popularity-scatter` | 时长·响度 × 流行度 | `points[]`（CRC32 抽样 ≈2,100 首）、`quadrant[]`、`correlation` |
| GET | `/api/time/overview` | KPI / 曲风 | `overview`、`genre[]`、`correlation` |
| GET | `/api/time/quadrant` | 四象限明细 | — |
| GET | `/api/time/scatter` | 散点明细 | — |

返回统一包装：`{"code":200,"msg":"ok","data":{...}}`

计算口径示例（`MIN_SAMPLE = 100`）：年/年代样本量不足 100 的不参与“趋势结论”，避免 1950s 只有 3 首歌把结论带偏；箱线图前端再过滤掉样本 <50 的五年区间。

---

## 4. 启动

**方式一（IDEA）**：运行 `org.springboot.demo.spotify2.Spotify2Application` → 打开 `http://localhost:8080/time/index.html`

**方式二（跑整个工程）**：运行原来的 `DemoApplication`。它会扫描 `org.springboot.demo.**`，方向一和方向六的接口可以同时用：
- 方向一：`/api/overview` …
- 方向六：`/api/time/overview` …

> 两个包里的类名相同（`StatsService`、`StatsController`），所以本模块显式指定了 Bean 名
> `@Service("timeStatsService")`、`@RestController("timeStatsController")`，不会与方向一冲突。

**数据库连接**：直接复用工程根 `application.properties`（`spotify_db` / `root`）。若只跑方向六，可把 `spotify2/resources/application.yml` 复制到 `src/main/resources/application.yml`。

---

## 5. 大屏实现要点

- **4 张图 + 侧栏**：时长箱线图（五年分组，须线展示长尾）、响度战争（均值折线 + P10–P90 阴影带 + 极值虚线）、BPM 小提琴图（高斯平滑后的相对密度，标注 120 BPM 参考线）、时长/响度散点（点大小=流行度）；侧栏是自动生成的结论 + 曲风画像 + 清洗流水线。
- **数据来源**：默认 `fetch` 五个接口；任一接口失败自动回退到 `data/dashboard.json` 快照，纯静态托管也能演示。
- **图表引擎**：优先加载 CDN 上的 ECharts 5.5（npmmirror → jsDelivr → unpkg 依次尝试，单次 2s 超时）；全失败时加载 `js/echarts-lite.js`——一个只实现本项目所需 option 子集的 Canvas 渲染器，保证内网/断网也能出图。业务代码里写的是**标准 ECharts option**，两种引擎共用一份配置。
- 顶部状态灯会显示当前是「接口已连接 · MySQL」还是「接口离线 · 本地快照」，以及用的哪个引擎。

---

## 6. 数据结论（大屏上的数字都由接口实时算出）

1. **时长确实在缩水**：中位数从 1985–1989 的 4.43′ 降到 2020–2024 的 3.15′（−29%），但须线仍到 6–8′，长尾没有消失。
2. **响度战争成立**：年均值 1976 年 −9.30 dB → 2014 年 −5.89 dB，整体抬升 3.4 dB；2020 年回落到 −6.89 dB，说明流媒体响度归一化开始起作用。
3. **BPM 没有一路变快**：1990s 因嘻哈/慢歌下探到 107.6 BPM，2010s 回到 123.9 BPM；115–125 BPM 区间始终吸纳约 16% 的曲目，120 BPM 仍是黄金律动。
4. **“短且响”只是弱相关**：时长与流行度 r = −0.14，响度与流行度 r = 0.04；但“短且响”组平均流行度 42.3 仍高于“长且轻”组 36.7。
5. **曲风结构也有份**：EDM 平均 −5.5 dB 最响，r&b −8.0 dB 最轻，年代差异里混着曲风构成的变化。

---

## 7. 歌单维度（playlist_id）对结论的影响与处理

原始表是**播放列表快照**：一行 = 某首歌被放进某个歌单。同一 `track_id` 可以出现在多个 `playlist_id` 里，
所以"要不要按 playlist_id 一起去重"必须先分清它影响的到底是哪一层。

### 7.1 三层影响，性质完全不同

| 影响层 | 具体表现 | 是否会改变结论 |
| --- | --- | --- |
| ① 属性值 | 实测 3,166 首多行曲目，`loudness / tempo / duration` 的**组内极差全部为 0** | 不会。重复行只是把同一组数字抄了 N 遍，不产生新数值 |
| ② 权重 | 热门曲被更多歌单收录（`corr(playlist_cnt, popularity) = 0.28`），1 个歌单的曲目平均 3.78′/−6.89 dB，6 个歌单的 3.34′/−5.41 dB | 会**轻微**放大"短且响"，但幅度很小（见 7.3） |
| ③ 标签 | `playlist_genre` 是**歌单**的属性，不是曲目的属性；1,687 首跨多个曲风歌单 | 会。原先"按流行度保留那一行"等于随机指认曲风，**66.7% 落在少数派** |

结论：**不要按 `playlist_id` 做二次去重**——那会把"同一首歌在不同歌单里的真实曝光"当成冗余删掉，
还会顺手删掉不同歌曲。正确做法是 `track_id` 级去重 + 把 `playlist_cnt` 当权重变量留下 + 曲风改多数投票。

### 7.2 已做的三处改动

1. **曲风改多数投票**：`playlist_genre` 取该曲目在各歌单中出现次数最多的曲风（平票按字典序），
   并新增 `genre_conflict` 标记（1,687 首）。改完曲风结构从 `pop 5,132 / edm 4,876` 变成
   `edm 5,377 / rap 5,067 / r&b 4,635 / pop 4,544 / latin 4,428 / rock 4,300`。
2. **保留 `playlist_cnt`**（覆盖歌单数）作为权重/热度代理列，随时可做加权对照。
3. **加了口径校验线**：箱线图上叠一条"按 `playlist_cnt` 加权的中位数"（等价于原始行口径），
   两条线重合即说明去重没有改变结论；偏差值 `summary.weightDiffMax` 也随接口返回。

### 7.3 口径对照（脚本 `scripts/04_bias_check.py`）

| 区间 | 等权中位数（去重） | 加权中位数（原始行） | 偏差 |
| --- | --- | --- | --- |
| 1970-1974 | 4.134′ | 4.153′ | +0.019 |
| 1985-1989 | 4.429′ | 4.434′ | +0.005 |
| 2015-2019 | 3.367′ | 3.363′ | −0.004 |
| 2020-2024 | 3.145′ | 3.191′ | +0.046 |

全部区间偏差 ≤ 0.05 分钟（3 秒）。响度均值三种口径差值 ≤ 0.15 dB；BPM 中位数完全一致；
"短且响"的相关系数 r(时长,流行度) 在 −0.144 / −0.140 / −0.144 之间，r(响度,流行度) 0.022 / 0.037 / 0.058
——**加权只会让"响度→流行度"的弱正相关从 0.02 抬到 0.06，方向和量级都不变**。

### 7.4 真正需要写进论文局限性的，是样本结构不是去重

- 2010s 占 19,832 首（70%），1960s 只有 132 首：歌单以当代为主，**年代样本量不代表真实发行量**；
- 老歌能进歌单的都是"仍在被播放的经典"，属于幸存者偏差，会让老年代显得更长、更轻；
- 观测单元是"曲目出现在歌单"，同一歌单内曲目特征相关，有效样本量小于 N，显著性会被高估。
  如果要做统计检验，应按 `playlist_id` 聚类，或只取 `playlist_cnt = 1` 的子集（25,185 首）做稳健性复核。
