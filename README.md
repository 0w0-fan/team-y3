# team-y3 · 鼠鼠队

数据分析与可视化项目实践 · 三人协作仓库

**团队**：鼠鼠队 · 2024级数据科学与大数据技术2班 · 第 35 组

**数据源**：[TidyTuesday Spotify Songs](https://raw.githubusercontent.com/rfordatascience/tidytuesday/master/data/2020/2020-01-21/spotify_songs.csv)（32,833 行 × 23 列，7.97 MB）

三位成员使用同一份原始数据，各自独立完成一个可视化大屏与后端接口。三个方向的代码、数据库、文档互不干扰。

---

## 成员与方向

| GitHub 用户名 | 方向 | 工作区 | 数据库 | 端口 |
|---|---|---|---|---|
| `0w0-fan`（组长） | 歌手／专辑「产量 - 热度」效率分析 | `0w0-fan/` | `spotify_dashboard` | 8088 |
| `Tmqq-art` | 「响度战争」与音乐物理属性变迁 | `SpotifyDashboard/` | `spotify_db` | 8080 |
| `yyx-golds` | 流派与子流派流行度大屏 | `yyx-golds/` | `spotify_genre` | 8088 |

> ⚠️ `0w0-fan` 与 `yyx-golds` 的端口都是 8088，同时启动需要改其中一个。

---

## 目录

```
shared/             公用数据：原始 CSV、建表脚本、导入脚本、数据字典（只读）
0w0-fan/            `0w0-fan` 工作区（Spring Boot + MyBatis，端口 8088）
SpotifyDashboard/   `Tmqq-art` 工作区（Spring Boot + JdbcTemplate，端口 8080）
yyx-golds/          `yyx-golds` 工作区（Spring Boot + MyBatis，端口 8088）
```

每人只改自己目录下的文件。`shared/` 是三人共用的，改动前先在群里说一声。

---

## 技术栈

- 后端：Spring Boot 2.7.6 + Java 8
- 持久层：MyBatis（注解 SQL）／ JdbcTemplate（`Tmqq-art` 方向）
- 前端：原生 HTML + CSS + JavaScript + ECharts 5.x（**本地文件，不引 CDN**）
- 存储：MySQL 8（`utf8mb4` / **`utf8mb4_bin`**）

---

## 快速开始

### 1. 准备数据（只需一次）

```bash
pip install pandas pymysql
```

1. Navicat 里新建库 `spotify_dashboard`（字符集 `utf8mb4`，**排序规则 `utf8mb4_bin`**）
2. 执行 `shared/sql/01_schema.sql` 建表
3. 把原始 CSV 放到 `shared/raw/spotify_songs.csv`
4. 运行 `python shared/scripts/01_import_raw.py`

脚本会导入全部 32,833 行并自动校验。若用 Navicat 导入向导报 `LOAD DATA` 被禁用，用脚本替代即可。

> ⚠️ 排序规则必须是 `utf8mb4_bin`。若用默认的 `utf8mb4_general_ci`，`Billing` 与 `BILLING` 会被合并，
> 歌手数从 10,693 掉到 10,684，专辑数从 19,744 掉到 19,515，分群结果直接错。

### 2. 启动各自的大屏

```bash
# 0w0-fan（方向一）
cd 0w0-fan/backend && mvn spring-boot:run     # → http://localhost:8088/

# Tmqq-art（方向二）
cd SpotifyDashboard && mvn spring-boot:run    # → http://localhost:8080/time/index.html

# yyx-golds（方向三）
cd yyx-golds/backend && mvn spring-boot:run   # → http://localhost:8088/
```

各方向的详细启动步骤、接口清单、口径说明见各自目录下的 `README.md`。

---

## 关于数据

**第一阶段只导入，不清洗。** 原始数据原样进库，保留 23 列，日期不转 DATE（原表 1,886 行不是标准日期格式）。

**第二阶段各自清洗。** 三个方向的分析目标不同，清洗口径必然不同：

| 方向 | 是否去重 | 入库行数 | 为什么这么选 |
|---|---|---|---|
| `0w0-fan` | 去重（视图层） | 28,356 | 分析「歌手/专辑」，重复歌单会污染作品数 |
| `Tmqq-art` | 去重 + 剔物理异常 | 28,351 | 分析音频属性，异常值会拉歪趋势线 |
| `yyx-golds` | 不去重 | 32,833 | 分析「流派供给」，删重等于删掉歌单归属信息 |

> 去重与不去重会得出相反结论：若 `yyx-golds` 方向去重，edm 会从供给第 1 掉到第 2、热度均值从 42.48 变 39.33。
> 所以「怎么洗」必须在动手前定死，这就是三人各建各库的原因。

字段口径见 [`shared/docs/数据字典.md`](shared/docs/数据字典.md)。

---

## 提交约定

一次提交一个变更，信息写清做了什么。个人开发开分支 `feat/<成员名>-<功能>`，完成后提 PR 合入 `main`。

当前仓库共 60 次提交（`0w0-fan` 54 次、`Tmqq-art` 5 次、`yyx-golds` 1 次）。

---

## 环境要求

| 项 | 版本 |
|---|---|
| JDK | 1.8（**必须是 8**，用 21 会报 `invalid target release: 8`） |
| Maven | 3.6+ |
| MySQL | 8.0+（`Tmqq-art` 方向用窗口函数，5.7 跑不了） |
| 浏览器 | Chrome / Edge 新版 |
