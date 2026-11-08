# 0w0-fan · Spotify 歌手与专辑「产量 - 热度」效率分析大屏

基于 TidyTuesday Spotify Songs（32,833 行 × 23 列）的**单屏可视化大屏**。
后端 Spring Boot + MyBatis + Druid 读 MySQL 真实数据，前端原生 HTML / CSS / JavaScript + ECharts（本地文件，不引 CDN）。

---

## 一、环境要求

| 项 | 版本 / 路径 |
|---|---|
| JDK | 1.8.0_504（`C:\Users\Fan\scoop\apps\temurin8-jdk\current`） |
| Maven | 3.10.0 |
| MySQL | 8.4.13，`root / 123456`，库 `spotify_dashboard`（utf8mb4 / **utf8mb4_bin**） |
| 端口 | 8088 |
| 浏览器 | 桌面 Chrome，窗口 1920×1080 |

> ⚠️ 命令行跑 Maven 前必须先把 `JAVA_HOME` 切到 JDK 8，否则报 `invalid target release: 8`。

---

## 二、目录结构

```
0w0-fan/
├── backend/                    Spring Boot 工程（端口 8088）
│   ├── pom.xml
│   └── src/main/
│       ├── java/com/fan/spotify/
│       │   ├── SpotifyDashboardApplication.java
│       │   ├── common/         统一异常出口（BizException / GlobalExceptionHandler）
│       │   ├── config/         FrontendPathReporter：启动时打印前端目录命中情况（排查 404）
│       │   ├── controller/     REST 接口层
│       │   ├── service/        业务层
│       │   ├── mapper/         MyBatis 持久层（口径写在 @Select 上方的注释里）
│       │   ├── entity/         artist_favorite / song_tag 表实体
│       │   └── dto/            查询结果与请求体
│       └── resources/application.yml
├── frontend/                   大屏前端（由后端以静态资源方式直接提供）
│   ├── index.html
│   ├── css/dashboard.css
│   └── js/
│       ├── echarts.min.js      ECharts 5.x 本地库（不引 CDN，断网可用）
│       └── dashboard.js        7 张图初始化 + 两个交互件 + 动效
├── data/                       第二阶段清洗与导出脚本
│   ├── 02_build_view.py        一键建视图 + 自动校验
│   ├── 02_member_view.sql      视图 DDL：artist_track_view（派生 3 列）
│   ├── 03_export.py            导出去重数据 CSV + 库结构 SQL
│   ├── export/                 导出产物（约 5.1 MB，不进 git）
│   └── README.md
└── docs/                       文档目录（个人三件套 .docx 也放这里）
    ├── 项目总览与代码导览.md     全项目介绍：数据链路 / 文件清单 / 口径对照 / 排错
    ├── 验收记录.md              逐条打勾的实测结果
    └── 大屏v2规划.md            v2 的规划与取舍
```

前端**不是**打包进 jar 的 `resources/static`，而是由后端按文件路径直接提供：

```yaml
spring.web.resources.static-locations:
  - file:../frontend/                # 工作目录 = 0w0-fan/backend（mvn spring-boot:run）
  - file:0w0-fan/frontend/           # 工作目录 = 仓库根（IDEA 运行配置默认）
  - ...共 7 个候选路径
```

好处是改完 CSS / JS 刷新浏览器即生效，不用重新打包。
之所以列多个候选，是因为「工作目录」随启动方式变化：IDEA 里跑运行配置时是仓库根，
终端里 `cd backend` 再跑时是 backend 目录。启动日志开头会有一行
「大屏静态资源检查」，逐个列出候选目录的绝对路径与命中情况——
如果 `/` 返回 404，先看这行就知道是不是路径没对上。

---

## 三、启动步骤

### 1. 准备数据库（只做一次）

```bash
cd D:\Project\IDEA	eam-y3
python 0w0-fan/data/02_build_view.py      # 建视图并自动校验（也可以直接执行同名 .sql）
mysql -uroot -p123456 spotify_dashboard < shared/sql/02_member_tables.sql
```

视图行数应为 **28,356**：

```sql
SELECT COUNT(*) FROM artist_track_view;   -- 28356
```

### 2. 启动后端

```powershell
$env:JAVA_HOME='C:\Users\Fan\scoop\apps\temurin8-jdk\current'
$env:PATH="$env:JAVA_HOME\bin;$env:PATH"
java -version          # 必须显示 1.8.0_504

cd D:\Project\IDEA\team-y3\0w0-fan\backend
mvn spring-boot:run
```

控制台出现 `Tomcat started on port(s): 8088` 即成功。

也可以用打包方式启动（静态资源路径依赖工作目录，必须在 `backend` 目录下执行）：

```powershell
mvn -DskipTests package
java -jar target\spotify-dashboard.jar
```

### 3. 打开大屏

浏览器访问 <http://localhost:8088/>（后端根路径直接返回 `frontend/index.html`）。

---

## 四、接口清单

统一前缀 `/api`，全部匿名可访问，返回 JSON。

| 方法 | 路径 | 说明 | 数据量 |
|---|---|---|---|
| GET | `/api/ping` | 健康检查，返回主表行数 | `{"count":32833,"status":"ok"}` |
| GET | `/api/overview` | 顶部概览指标（记录数/歌曲数/歌手数/专辑数/平均热度/关注数/标签数） | 1 条 |
| GET | `/api/artist/quadrant` | 图 1 四象限散点 + 中位数 + 均值分割线 | **2,486** 个点 |
| GET | `/api/artist/distribution` | 图 2 歌手作品数长尾分布 | 8 个箱 |
| GET | `/api/artist/top?limit=20` | 图 3 平均热度 TOP N | 20 位 |
| GET | `/api/album/bins` | 图 4 专辑曲目数分箱 → 专辑数 / 歌曲平均热度 | 4 个箱 |
| GET | `/api/artist/span?limit=20` | 图 5 歌手活跃年份跨度 TOP N | 20 条 |
| GET | `/api/song/scatter` | 热度 × 时长全量散点 | **28,356** 个点 |
| GET | `/api/year/trend?from=1957&to=2019` | 逐年歌曲数 × 平均热度（v2 新增） | 62 年 |
| GET | `/api/activity/recent?limit=20` | 关注 + 标签时间线（备用，页面未使用） | ≤50 条 |
| GET | `/api/song/search?q=&limit=8` | 歌曲检索（打标签交互件用） | ≤30 条 |
| GET | `/api/favorite` | 关注歌手列表 | — |
| POST | `/api/favorite` | 关注歌手 `{artistName, note}` | 201 |
| PUT | `/api/favorite/{id}` | 改备注 / 改歌手名 `{note}` | 200 |
| DELETE | `/api/favorite/{id}` | 取消关注 | 删除行数 |
| GET | `/api/tag?trackId=` | 查某首歌的标签；不带 `trackId` 返回最新 N 条 | — |
| POST | `/api/tag` | 打标签 `{trackId, tagName}` | 201 |
| DELETE | `/api/tag/{id}` | 删标签 | 删除行数 |

异常统一返回 JSON：`400` 参数问题、`404` 记录不存在、`409` 重复提交、`500` 其他。

自测示例：

```bash
curl http://localhost:8088/api/ping
curl http://localhost:8088/api/artist/top?limit=20
curl -X POST http://localhost:8088/api/favorite -H "Content-Type: application/json" \
     --data-binary '{"artistName":"Billie Eilish","note":"低频电子流行"}'
```

---

## 五、七张图表的指标口径

所有统计（除另行标注）都基于 `artist_track_view`（按 `track_id` 去重，28,356 行），
不是原始主表 32,833 行。歌手维度一律排除 `track_artist IS NULL OR track_artist = 'NA'` 的假歌手。

页面按三栏排布（左 27% / 中 46% / 右 27%），共 **7 张图 + 1 个 KPI 翻牌区 + 2 个交互件**：

| # | 图表 | 页面位置 | 口径 | 实际数据量 |
|---|---|---|---|---|
| 1 | **作品数 × 平均热度 四象限**（主视觉） | 中栏中部 | x = `COUNT(DISTINCT track_id)`；y = `AVG(track_popularity)`；**气泡大小 = 该歌手专辑数**；筛 `作品数 >= 3`；分割线 x = 作品中位数 **5**、y = 全局均值 **42.48**（主表口径） | **2,486** 个点 |
| 2 | 歌手作品数长尾分布 | 左栏中 | x = 作品数分箱 `1 / 2 / 3 / 4 / 5 / 6-10 / 11-20 / 21+`；y = 箱内歌手数；**y 轴对数刻度** | 8 个柱（6,496 / 1,710 / 784 / 453 / 255 / 582 / 273 / 139） |
| 3 | 平均热度 TOP20 歌手 | 左栏下 | 按 `AVG(track_popularity)` 降序，筛 `作品数 >= 3`；每 2.4 秒轮播高亮 | **20** 位（第 1 名 JACKBOYS 84.33） |
| 4 | 专辑曲目数 × 歌曲平均热度 | 中栏右下 | x = 专辑曲目数分箱 `2 / 3-4 / 5-9 / 10+`（只统计曲目数 ≥ 2 的专辑）；y = 该箱内**全部歌曲**的平均热度（歌曲加权） | 4 个柱（2,169 / 1,217 / 464 / 89 张专辑） |
| 5 | 歌手活跃年份跨度 | 右栏上 | 每位歌手 `MIN(release_year)` → `MAX(release_year)` 横条；筛 `作品数 >= 3` 且年份非空；按跨度取前 20 | **20** 条（第 1 名 The Beatles 1963–2019） |
| 6 | 热度 × 歌曲时长 | 中栏左下 | x = `duration_min`（`duration_ms/60000`）；y = `track_popularity`；全量；ECharts `large: true` + 透明度 | **28,356** 个点 |
| 7 | 逐年歌曲数 × 平均热度（v2 新增） | 左栏上 | 按 `release_year` 分组统计歌曲数与平均热度，默认 **1957–2019**（2020 年数据被截断）；双纵轴 + 24 年窗口自动巡航 | 62 年（峰值 2019：7,406 首 / 47.41 分） |

口径取舍说明：

- 图 1 的 y 分割线用**主表**全局均值 42.48（任务文档写死的值），散点本身用视图口径，两者分母不同，已在图上标注「热度均值 42.48」。
- 图 4 的 y 用**歌曲加权**（`SUM(曲目数 × 该专辑均热) / SUM(曲目数)`），即口径表里写的「AVG(track_popularity)」；若改成专辑等权，四条柱的差异会变小。
- 图 5 的 `release_year` 只从 `^YYYY` 形式的字符串截取，非法格式留 NULL，不编造日期。

---

## 六、两个交互件（真实写库）

| 交互件 | 行为 | 对应表 |
|---|---|---|
| **关注歌手** | 输入歌手名 + 备注点「关注」→ `artist_favorite` 新增一行；列表里可改备注（PUT）、可删除（DELETE）；歌手名唯一，重复提交返回 409 | `artist_favorite(id, artist_name, note, created_at)` |
| **歌曲打标签** | 搜歌名/歌手 → 选中一首 → 输入标签点「添加」→ `song_tag` 新增一行；标签可按歌曲查询、可删除；同一首歌同一标签唯一 | `song_tag(id, track_id, tag_name, created_at)` |

页面右上角 KPI 里的「关注 / 标签」计数会随操作实时刷新，Navicat 里可以直接看到行数变化。

---

## 七、断网验证

- `frontend/js/echarts.min.js` 是从本地 `D:\Project\IDEA\Echarts\node_modules\echarts\dist\echarts.min.js` 复制进来的，**页面里没有任何 http(s) 外链、没有 CDN、没有在线字体**。
- 页面所有数据来自本机 `http://localhost:8088`，断网后照样渲染；只有后端或 MySQL 停了才会失败。

自查命令：

```bash
grep -nE "https?://|//cdn|unpkg|jsdelivr|googleapis" 0w0-fan/frontend/index.html \
     0w0-fan/frontend/css/dashboard.css 0w0-fan/frontend/js/dashboard.js
# 期望：无任何输出
```

---

## 八、其他约定

- **不改主表**：不删行、不去重、不改数值，所有清洗结果只落在视图 `artist_track_view`。
- 大屏按 1920×1080 设计稿绘制，整屏用 `transform: scale()` 等比适配窗口，任何分辨率都不会出现滚动条。
- 调试辅助：URL 加 `?native=1` 时按 1:1 像素渲染并允许滚动，仅用于截图取证，正常访问不要带这个参数。
