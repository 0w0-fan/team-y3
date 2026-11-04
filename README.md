# team-y3 · 数据分析与可视化项目实践

> Spotify 歌曲数据集 · Spring Boot 后端 + ECharts 前端大屏 · MySQL 存储
>
> 三人共用一份第一阶段基础数据，各自独立完成一个 HTML 可视化大屏 + Spring Boot 接口层。

## 项目概况

| 项 | 内容 |
|---|---|
| 课程 | 数据分析与可视化项目实践（企业工学结合） |
| 数据源 | [TidyTuesday Spotify Songs](https://raw.githubusercontent.com/rfordatascience/tidytuesday/master/data/2020/2020-01-21/spotify_songs.csv) |
| 数据规模 | 32,833 行 × 23 列（7.6 MB） |
| 数据库 | MySQL 8.4 · 库名 `spotify_dashboard` · utf8mb4 |
| 后端 | Spring Boot 2.7.6 · Java 8 · MyBatis · Druid · 端口 8088 |
| 前端 | 原生 HTML + CSS + JavaScript + ECharts（本地引入，不走 CDN） |
| 成员 | [0w0-fan](https://github.com/0w0-fan)、[Tmqq-art](https://github.com/Tmqq-art)、[yyx-golds](https://github.com/yyx-golds) |

## 目录结构

```
team-y3/
├── shared/                     第一阶段公用数据（三人共用，勿各自改）
│   ├── raw/                    原始 CSV —— 不进仓库，本地放置
│   ├── csv/                    清洗后 CSV —— 不进仓库；data_profile.md 进仓库
│   ├── sql/                    建表脚本 —— 01_schema.sql 进仓库
│   ├── scripts/                清洗脚本 —— 进仓库
│   └── docs/                   数据字典、口径说明
├── 0w0-fan/                    成员个人工作区，每人一个
│   ├── backend/                Spring Boot 工程
│   ├── frontend/               大屏 HTML + CSS + JS
│   │   ├── css/
│   │   └── js/
│   ├── data/                   个人方向的第二阶段清洗脚本
│   └── docs/                   个人三件套（立项申请表 / 分析方案说明书 / 实践报告）
├── Tmqq-art/                   成员个人工作区
└── yyx-golds/                  成员个人工作区
```

## 数据准备步骤

### 1. 拿到原始数据

```bash
curl -o shared/raw/spotify_songs.csv \
  https://raw.githubusercontent.com/rfordatascience/tidytuesday/master/data/2020/2020-01-21/spotify_songs.csv
```

### 2. 跑清洗脚本

```bash
cd team-y3
python shared/scripts/01_clean_base.py
```

产出：
- `shared/csv/spotify_songs_clean.csv` —— 32,833 行 × 29 列
- `shared/csv/data_profile.md` —— 数据画像与清洗记录

### 3. 建库导入

1. Navicat 里新建库 `spotify_dashboard`，字符集 `utf8mb4`
2. 执行 `shared/sql/01_schema.sql` 建表
3. 导入向导把 `spotify_songs_clean.csv` 导进 `spotify_songs`
   - 编码 UTF-8、分隔符 `,`、文本识别符 `"`、首行为字段名
4. 跑 `01_schema.sql` 末尾的校验查询，行数应为 32,833

## 第一阶段数据的处理原则

**不删行、不改数值、不编造日期。** 详见 [`shared/csv/data_profile.md`](shared/csv/data_profile.md)。

| 原则 | 说明 |
|---|---|
| 不删行 | 32,833 行全保留。同一首歌出现在多个歌单是有效信息，`playlist_genre` 本身是分类维度 |
| 不去重 | 去重是各方向的第二阶段工作，不污染公用基础数据 |
| 不改数值 | 包括 `track_popularity = 0` 的 2,703 行，0 是真实值不是缺失 |
| 不补日期 | 1,855 行原表只有年份，保持 `release_date_precision = year`，不补 1 月 1 日 |

## 提交约定

- 一次提交一个变更，提交信息写清做了什么
- **只改自己目录下的文件**；`shared/` 是三人共用，改动前先在群里说一声
- 数据文件（CSV / 导出的 .sql）不进仓库，用群文件分发

## 分支与协作

- `main` 为主分支，保持可运行
- 个人开发各自开分支：`feat/<成员名>-<功能>`，完成后提 PR 合入 `main`
- 这样 commit 记录能清楚看出谁做了什么
