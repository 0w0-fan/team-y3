# yyx-golds · Spotify 流派与子流派流行度大屏（方向一）

基于 TidyTuesday Spotify Songs（32,833 行 × 23 列）的**单屏可视化大屏**：看 6 大流派 / 24 个子流派的供给结构与热度格局，以及 2010 年后曲风供给结构的变化。
后端 Spring Boot + MyBatis 读 MySQL 真实数据，前端原生 HTML / CSS / JavaScript + ECharts（本地文件，不引 CDN）。

> 与 `shared/` 的关系：公用库 `spotify_dashboard` 是 23 列原始数据、不动；本方向在**自己的库 `spotify_genre`** 里存清洗后的 24 列明细表，符合仓库里「清洗是各方向第二阶段自己的事」的约定。

---

## 版本

| 版本 | 内容 |
|---|---|
| v1（当前，`main`） | 6 张图接口 + 5 张图上屏（主图 1 张 + 支撑图 4 张）+ 流派联动 + 关注列表增删改查，全量真实数据，断网可用 |
| 规划中的 v2 | 补回桑基图（接口已就绪）、加年份区间选择器 |

---

## 一、环境要求

| 项 | 版本 / 路径 |
|---|---|
| JDK | 1.8.0_40（`D:\JAVA`，`JAVA_HOME` 已指向） |
| Maven | 3.9.11（用 IDEA 内置：`D:\idea\IntelliJ IDEA 2025.3.2\plugins\maven\lib\maven3\bin\mvn.cmd`） |
| MySQL | 8.3，`root / 123456`，库 `spotify_genre`（utf8mb4 / **utf8mb4_bin**） |
| Python | 3.13（装 `pymysql`、`openpyxl`），仅跑清洗/导入脚本时需要 |
| 端口 | 8088 |
| 浏览器 | 桌面 Chrome / Edge，窗口 1920×1080 |

> ⚠️ 命令行跑 Maven 前必须确认 `JAVA_HOME` 指向 JDK 8，否则报 `invalid target release: 8`。
> ⚠️ PowerShell 里传 `-Dfile.encoding=UTF-8` 要加引号，否则会被拆成两个参数报 `Unknown lifecycle phase ".encoding=UTF-8"`。

---

## 二、目录结构

```
yyx-golds/
├── README.md                    本文件
├── .gitignore                   只忽略本目录下的大文件（清洗产物）
├── backend/                     Spring Boot 工程（端口 8088）
│   ├── pom.xml                  JDK 8 + Spring Boot 2.7.6（import BOM）+ MyBatis 2.2.2
│   └── src/main/
│       ├── java/com/spotify/dashboard/
│       │   ├── SpotifyDashboardApplication.java
│       │   ├── controller/      DashboardController（图表）、GenreWatchController（关注 CRUD）、SongController（明细检索）
│       │   ├── service/         DashboardService：口径与换算（补 0 / 归一化 / 列内占比）
│       │   ├── mapper/          MyBatis 注解 SQL，口径写在 @Select 上方注释里
│       │   ├── entity/          spotify_songs 行、genre_watch 行
│       │   ├── dto/             接口返回体与查询行
│       │   └── config/          跨域、全局异常
│       └── resources/
│           ├── application.yml  端口 / 数据源 / 静态资源候选路径 / SQL 初始化
│           └── db/genre_watch.sql  关注表 DDL（启动时幂等建表）
├── frontend/                    大屏前端（由后端按文件路径直接提供）
│   ├── index.html
│   ├── css/dashboard.css
│   └── js/
│       ├── echarts.min.js       ECharts 5.6.0 本地库（不引 CDN，断网可用）
│       └── dashboard.js         5 张图 + 联动 + 关注列表面板 + 全屏自适应
├── data/                        第二阶段清洗与导入
│   ├── 00_schema.sql            建库建表 DDL（与库里表结构一致）
│   ├── 01_clean_and_aggregate.py  原始 23 列 → 清洗后 24 列，并导出六图聚合结果
│   ├── 02_import_to_mysql.py    CSV → MySQL，含逐流派自检（幂等）
│   ├── clean_report.json        六张图的期望值，接口自测基准
│   └── README.md                脚本用法与产物说明
└── docs/
    ├── 答辩材料.docx             答辩讲稿：清洗流程 / 实现 / 图解读 / 联动原理 / 预设问答
    └── 方向一任务文档.md         本方向的口径说明与验收清单
```

前端**不是**打包进 jar 的 `resources/static`，而是放在工程根的 `frontend/`，由后端按路径提供：

```yaml
spring.web.resources.static-locations:
  - file:../frontend/          # 工作目录 = yyx-golds/backend（mvn spring-boot:run）
  - file:frontend/             # 工作目录 = yyx-golds/
  - file:yyx-golds/frontend/   # 工作目录 = 仓库根
  - classpath:/static/         # 回落：jar 里那份
```

改完 CSS / JS 刷新浏览器即生效，不用重新打包。另外 `pom.xml` 里挂了一个 `maven-resources-plugin` 执行，
打包时把 `../frontend` 复制进 `classes/static`，所以 `java -jar` 也能自带页面。

> 页面 404 时先看启动时的工作目录：`cd backend` 跑要看 `../frontend` 存不存在，IDEA 里跑要看 `frontend/` 存不存在。

---

## 三、启动步骤

### 1. 建库并导入（只做一次）

```bash
mysql -uroot -p123456 < yyx-golds/data/00_schema.sql
python yyx-golds/data/01_clean_and_aggregate.py    # 生成 data/genre_songs_clean.csv 等产物
python yyx-golds/data/02_import_to_mysql.py        # 导入并自检
```

导入后校验四项（脚本会自动跑一遍）：

```sql
SELECT COUNT(*), COUNT(DISTINCT playlist_genre), COUNT(DISTINCT playlist_subgenre),
       ROUND(AVG(track_popularity), 2)
FROM spotify_genre.spotify_songs;   -- 32833 / 6 / 24 / 42.48
```

### 2. 启动后端

```powershell
$env:JAVA_HOME='D:\JAVA'
cd D:\Spring\team-y3\yyx-golds\backend
& "D:\idea\IntelliJ IDEA 2025.3.2\plugins\maven\lib\maven3\bin\mvn.cmd" "-s" "D:\maven\settings.xml" spring-boot:run
```

控制台出现 `Tomcat started on port(s): 8088` 即成功。

也可以打包运行：

```powershell
mvn -DskipTests package
java -jar target\spotify-genre-dashboard.jar
```

### 3. 打开大屏

浏览器访问 <http://localhost:8088/>。

---

## 四、接口清单

统一前缀 `/api`，全部匿名可访问，返回 JSON。

| 方法 | 路径 | 说明 | 数据量 |
|---|---|---|---|
| GET | `/api/ping` | 健康检查，返回主表行数 | `{"count":32833,"status":"ok"}` |
| GET | `/api/genre/summary` | 图 1 六流派：歌曲数 / 占比 / 平均热度 / 中位热度 | 6 条 |
| GET | `/api/genre/trend?from=1990&to=2019` | 图 3 年份 × 流派供给（Java 侧透视补 0） | 30 年 × 6 系列，合计 29,601 |
| GET | `/api/subgenre/rank?top=15` | 图 2 子流派平均热度榜 | `min(top, 24)` 条 |
| GET | `/api/genre/radar` | 图 5 七维音频特征（0–100 归一化 + 原始均值） | 6 系列 × 7 维 |
| GET | `/api/genre/bin` | 图 6 热度分箱 × 流派（绝对数 + 列内占比） | 5 个分箱 |
| GET | `/api/genre/sankey` | 图 4 流派 → 子流派（接口保留，页面暂未用） | 30 节点 / 24 连线 |
| GET | `/api/song/page?page=&size=&genre=&keyword=&minPop=&maxPop=&sort=` | 明细分页检索（页面未启用） | 分页 |
| GET | `/api/watch` | 关注列表 | — |
| POST | `/api/watch` | 新增关注 `{genre, watchLevel, note}` | 201 |
| PUT | `/api/watch/{id}` | 修改关注 | 200 |
| DELETE | `/api/watch/{id}` | 删除关注 | 删除行数 |

异常统一返回 `{success:false, message}`：参数问题 400，其余 500。

自测示例：

```bash
curl http://localhost:8088/api/ping
curl http://localhost:8088/api/genre/summary
curl -X POST http://localhost:8088/api/watch -H "Content-Type: application/json" \
     --data-binary '{"genre":"edm","watchLevel":5,"note":"供给第一但热度垫底"}'
```

---

## 五、五张图的指标口径

所有统计都基于 `spotify_genre.spotify_songs`（**歌单-曲目粒度 32,833 行，不去重**）。

| # | 图表 | 位置 | 口径 | 实际数据 |
|---|---|---|---|---|
| 1 | **流派供给 × 热度**（主图，双轴） | 左 7/12，独占上排 | 柱 = `COUNT(*)`（左轴）；线 = `AVG(track_popularity)`（右轴）；虚线 = 全局均值 42.48 | 6 组 |
| 2 | 子流派 TOP15 平均热度 | 右 5/12，上排 | 按 `AVG(track_popularity)` 降序取前 15，颜色 = 所属流派 | 15 条 |
| 3 | 发行年份 × 流派供给 | 下排左 5/12 | `release_year` 1990–2019，堆叠面积，可切绝对量 / 占比 | 30 × 6，29,601 |
| 5 | 六流派音频特征 | 下排中 4/12 | 7 维在 6 流派间 min-max 到 0–100，tooltip 给原始均值 | 6 系列 |
| 6 | 热度分箱 × 流派 | 下排右 3/12 | 5 档分箱的列内百分比堆叠（占比在 Java 里算） | 5 × 6 |

关键数字（对数字用）：

| 流派 | 歌曲数 | 占比 | 平均热度 | 中位热度 |
|---|---|---|---|---|
| edm | 6,043 | 18.41% | 34.83 | 36 |
| rap | 5,746 | 17.50% | 43.22 | 47 |
| pop | 5,507 | 16.77% | **47.74** | 52 |
| r&b | 5,431 | 16.54% | 41.22 | 44 |
| latin | 5,155 | 15.70% | 47.03 | 50 |
| rock | 4,951 | 15.08% | 41.73 | 46 |

口径取舍说明：

- **不去重**：3,166 个重复 `track_id`（7,643 行），其中 1,687 个跨流派。去重后只剩 28,356 行，edm 从供给第 1 掉到第 2、热度均值从 42.48 变 39.33，结论会翻。
- **趋势图 1990–2019**：1990 年前合计约 2,447 行（7.5%），画进来会把主图压扁；2020 年仅 785 行，是抓取时点截断，已剔除。
- **雷达不含 tempo / loudness / duration**：tempo 有 1 个空值且量纲是 BPM，loudness 为负数（min-max 后方向会反）。
- 「崛起 / 衰退」只表示**歌单供给结构的变化**，不是全球音乐产量；数据集是 6 流派 × 4 子流派 × 每流派约 79 个歌单的固定采样。

---

## 六、交互

| 交互 | 行为 |
|---|---|
| 流派联动 | 点主图柱 / 子流派条 / 雷达线 / 分箱色块 / 主图下三个数字 → 其余图同步高亮该流派、其他置灰；再点一次、点右上角 ×、按 Esc 取消 |
| 绝对量 / 占比 | 图 3 右上角切换，占比用同一份 `values` 现算，不新增接口 |
| 关注列表 | 右上角「流派关注」→ 弹窗增删改查，落 `genre_watch` 表；删除需点两次确认 |

分析主表 `spotify_songs` **只读**：一旦允许改它的数值，六张图和文档里的期望值就对不上了。

---

## 七、断网验证

- `frontend/js/echarts.min.js` 是本地文件，页面里没有任何 http(s) 外链、没有 CDN、没有在线字体。
- 数据全部来自本机 `http://localhost:8088`，断网后照样渲染；只有后端或 MySQL 停了才会失败。

自查命令：

```bash
grep -nE "https?://|//cdn|unpkg|jsdelivr|googleapis" \
     yyx-golds/frontend/index.html yyx-golds/frontend/css/dashboard.css yyx-golds/frontend/js/dashboard.js
# 期望：无任何输出
```

---

## 八、其他约定

- **不改公用基础表**：清洗结果只落在自己的库 `spotify_genre`，`shared` 里的东西一律不动。
- 大屏全屏铺满视口：布局用 fr 比例，字号与间距乘 `--k`（`min(视口宽/1920, 视口高/1080)`，钳制 0.62–2.1），任何分辨率都不出滚动条。
- 图表字号写死在 ECharts option 里，窗口尺寸变化时由 `scaled()` 统一乘系数并重画。
