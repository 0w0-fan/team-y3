# SpotifyDashboard · 方向六「响度战争」可视化大屏

独立工程。把原来挂在 `Demo` 里的方向六模块抽出来，**只带走它真正用到的东西**：
4 个依赖、1 份配置、6 个静态文件、8 个 Java 类。

```
MySQL spotify_db.spotify_tracks (28,351 首)
        ↓ JdbcTemplate + 窗口函数 SQL
Spring Boot 2.7.6  /api/time/*  ·  /api/tracks/*
        ↓ JSON {code,msg,data}
ECharts 大屏（CDN 不可用时切自研 Canvas 渲染器）
```

---

## 1. 环境要求

| 项 | 版本 | 说明 |
|---|---|---|
| JDK | 1.8+ | 工程用 `maven.compiler` 锁在 1.8，本机实测 1.8.0_40 |
| Maven | 3.6+ | IDEA 自带的即可（`Settings → Build Tools → Maven`） |
| MySQL | 8.0+ | 需要窗口函数（`ROW_NUMBER() OVER`），5.7 跑不了 |
| 浏览器 | Chrome / Edge 新版 | 用了 `URLSearchParams`、CSS `mask-image` |

不需要 Node、不需要 npm、不需要前端构建。前端是原生 HTML/CSS/JS，直接由 Spring Boot 托管。

---

## 2. 目录结构

```
SpotifyDashboard/
├── pom.xml                                    只含 4 个依赖
├── README.md
├── .gitignore
└── src/main/
    ├── java/new_com/spotify2/
    │   ├── Spotify2Application.java           启动类
    │   ├── common2/Result2.java               统一响应 {code,msg,data}
    │   ├── common2/GlobalExceptionHandler2.java  全局异常 → JSON
    │   ├── config2/CorsConfig2.java           /api/** 跨域（Live Server 调试用）
    │   ├── controller2/StatsController2.java  6 个只读聚合接口
    │   ├── controller2/TrackController2.java  5 个 CRUD 接口
    │   ├── service2/StatsService2.java        全部统计 SQL（窗口函数）
    │   └── service2/TrackService2.java        CRUD + derive() 派生列
    └── resources/
        ├── application.properties            唯一配置文件
        └── static/time/                      大屏
            ├── index.html
            ├── css/screen.css
            ├── js/screen.js                  取数 / 状态 / 6 张图 option
            ├── js/track-admin.js             CRUD 抽屉
            ├── js/echarts-lite.js            断网降级渲染器
            └── data/dashboard.json           离线快照（接口全挂时兜底）
```

---

## 3. 依赖清单（以及为什么只要这几个）

| 依赖 | 作用 | 不加会怎样 |
|---|---|---|
| `spring-boot-starter-web` | REST + 内嵌 Tomcat + Jackson + 托管 `static/` | 没有接口，页面也访问不到 |
| `spring-boot-starter-jdbc` | `JdbcTemplate`、`DataSource` 自动装配 | 无法执行 SQL |
| `druid-spring-boot-starter:1.1.10` | 连接池 | `spring.datasource.type` 指向的类不存在，启动即失败 |
| `mysql-connector-java:8.0.33` | JDBC 驱动（runtime） | 连不上库 |
| `spring-boot-starter-test` | 单测（test scope） | 不影响运行 |

**刻意不加**：MyBatis / MyBatis-Plus / JPA / Thymeleaf / PageHelper。
本模块所有查询都是聚合 SQL，`JdbcTemplate` 能原样执行；模板引擎更用不上（页面是静态的）。
旧工程就是因为带着这些依赖，它们的自动配置去扫 `mapper/*.xml`，
在 classpath 里出现重复 XML 时报
`Result Maps collection already contains value for ...ArticleMapper...` 而启动失败。

---

## 4. 构建与运行

```bash
cd D:/maven/repository/SpotifyDashboard

# 离线构建（本地仓库 D:/maven/repository 已缓存全部依赖，实测 4.5 秒）
mvn -o -B -Dmaven.repo.local=D:/maven/repository clean package -DskipTests

# 运行（-Dfile.encoding 防止 Windows 控制台中文乱码）
java -Dfile.encoding=UTF-8 -jar target/spotify-dashboard.jar
```

> **本机首次构建的坑**：JDK 1.8.0_40 的证书库较旧，访问 Maven Central 会报
> `PKIX path building failed`。首次补齐构件时加一个参数即可：
> `-Daether.connector.https.securityMode=insecure`。
> 构件补齐后就不再需要联网了。
>
> **为什么 pom 里没有 `spring-boot-starter-parent`**：本机离线仓库里没有 parent 的 pom，
> 用它会让 `mvn -o` 直接报 `Non-resolvable parent POM`。改成 `import` 官方 BOM，
> 版本照样集中管理，还能离线构建。

IDEA 里更简单：`File → Open` 选这个目录，等依赖索引完，右键 `Spotify2Application` → Run。
Maven 用 IDEA 自带的 Bundled 3 即可，Local repository 指向 `D:/maven/repository`。

启动后：

- 大屏 <http://localhost:8080/time/index.html>
- 接口自检 <http://localhost:8080/api/time/overview>
- 数据管理抽屉 <http://localhost:8080/time/index.html?panel=data>

---

## 5. 数据库配置

只改 `src/main/resources/application.properties` 这几行：

```properties
spring.datasource.url=jdbc:mysql://localhost:3306/spotify_db?...
spring.datasource.username=root
spring.datasource.password=123456
```

建库建表（如果换机器）：

```bash
mysql -uroot -p < "C:/Users/yexua/Desktop/数据分析可视化/spotify_tracks.sql"
```

脚本是 Navicat 导出，含 `DROP TABLE IF EXISTS` + 建表 + 28,351 条 INSERT + 7 个索引，
执行完即得到 `spotify_db.spotify_tracks`。

---

## 6. 接口

### 只读聚合（`StatsController2`）

| 方法 | 路径 | 作用 | 主要字段 |
|---|---|---|---|
| GET | `/api/time/overview` | KPI / 曲风画像 | `overview`、`genre[]`、`correlation` |
| GET | `/api/time/duration-evolution` | 时长演化 | `era5[]` 五数概括、`year[]`、`summary` |
| GET | `/api/time/loudness-war` | 响度战争 | `year[]`（mean/median/p10/p90）、`decade[]`、`summary` |
| GET | `/api/time/bpm-distribution` | BPM 年代分布 | `hist[]`、`decade[]`、`refBpm=120`、`summary` |
| GET | `/api/time/popularity-scatter` | 时长·响度 × 流行度 | `points[]`（2,162 首）、`quadrant[]`、`correlation` |
| GET | `/api/time/genre-decade` | 曲风×年代矩阵（核心图） | `cell[]`、`decade[]` 基线、`minCell=30` |

### 增删改查（`TrackController2`）

| 方法 | 路径 | 作用 |
|---|---|---|
| GET | `/api/tracks?page&size&kw&genre&yearFrom&yearTo` | 分页 + 条件查询 |
| GET | `/api/tracks/{id}` | 查单条（编辑回填） |
| POST | `/api/tracks` | 新增 |
| PUT | `/api/tracks/{id}` | 修改（字段合并） |
| DELETE | `/api/tracks/{id}` | 删除 |

响应统一 `{"code":200,"msg":"ok","data":{...}}`。
业务校验失败返回 `code=400`（空值、越界、主键重复、记录不存在），
数据库故障返回 `code=500`；两者 HTTP 状态都是 200，由前端 `unwrap()` 统一判错。

---

## 7. 常见问题

**Q：8080 被占用**
改 `server.port`，或启动时加 `--server.port=8099`。

**Q：报“数据库访问失败，请确认 MySQL 已启动…”**
按提示依次查：MySQL 服务是否在跑 → `spotify_db` 是否导入 → 账号密码。
响应会在 3 秒内返回，不会无限等（`druid.max-wait=3000`）。

**Q：页面能开，但右上角显示“接口离线 · 本地快照”**
说明 6 个接口有失败，前端已降级到 `data/dashboard.json`。
打开浏览器控制台看是哪个接口报错；通常是后端没启动或端口不对。

**Q：图表用的是什么？看着不像 ECharts**
优先从 CDN 加载 ECharts；加载失败（无网/被拦）自动切 `echarts-lite.js`（自研 Canvas）。
状态胶囊会写明当前用的是哪一个。

---

## 8. 与旧工程的关系

`D:/maven/repository/Demo` 原样保留（里面还有 JPA / MyBatis 的课程练习）。
本工程是方向六的唯一维护副本：今后改代码只改这里，
旧工程里的 `new_com/spotify2` 和 `static/time` 不再跟进。
