# team-y3

数据分析与可视化项目实践 · 三人协作仓库

数据源：[TidyTuesday Spotify Songs](https://raw.githubusercontent.com/rfordatascience/tidytuesday/master/data/2020/2020-01-21/spotify_songs.csv)（32,833 行 × 23 列）

三位成员使用同一份原始数据，各自独立完成一个可视化大屏与后端接口。

## 目录

```
shared/     公用数据：原始 CSV、建表脚本、导入脚本、数据字典
0w0-fan/    成员工作区
Tmqq-art/   成员工作区
yyx-golds/  成员工作区
```

每人只改自己目录下的文件。`shared/` 是三人共用的，改动前先在群里说一声。

## 技术栈

- 后端：Spring Boot + MyBatis
- 前端：HTML + CSS + JavaScript + ECharts
- 存储：MySQL

## 数据导入

```bash
pip install pandas pymysql
```

1. Navicat 里新建库 `spotify_dashboard`（utf8mb4）
2. 执行 `shared/sql/01_schema.sql` 建表
3. 把原始 CSV 放到 `shared/raw/spotify_songs.csv`
4. 运行 `python shared/scripts/01_import_raw.py`

脚本会导入全部 32,833 行并自动校验。若用 Navicat 导入向导报 `LOAD DATA` 被禁用，用脚本替代即可。

## 关于数据

**第一阶段只导入，不清洗。** 原始数据原样进库，保留 23 列，日期不转 DATE（原表 1,886 行不是标准日期格式）。

清洗是各方向第二阶段自己的事，在各自的表或视图上做，不改公用基础表。

字段口径见 [`shared/docs/数据字典.md`](shared/docs/数据字典.md)。

## 提交约定

一次提交一个变更，信息写清做了什么。

个人开发建议开分支：`feat/<成员名>-<功能>`，完成后提 PR 合入 `main`。
