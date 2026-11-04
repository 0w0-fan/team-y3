-- =============================================================
-- team-y3 · Spotify 歌曲数据分析大屏
-- 公用基础表建表脚本
--
-- 原则：第一阶段不做清洗，原始 CSV 原样入库。
--       字段类型按原始数据自然类型给出，日期保留 VARCHAR
--       （原表 32,833 行里有 1,886 行不是 YYYY-MM-DD 格式，
--        转 DATE 会失败，且转换本身就算一次清洗）。
--       清洗是每个方向各自在第二阶段做的事。
--
-- 排序规则用 utf8mb4_bin（区分大小写），不用 utf8mb4_general_ci。
--       原因：general_ci 会把 Billing 和 BILLING 当成同一个，
--       导致 COUNT(DISTINCT track_artist) 从 10,693 掉到 10,684，
--       专辑名从 19,744 掉到 19,515，歌手/专辑维度分析直接失真。
--
-- 用法（Navicat Premium）：
--   1. 新建数据库 spotify_dashboard，字符集 utf8mb4 / 排序 utf8mb4_bin
--   2. 在 spotify_dashboard 上执行本文件
--   3. 导入 shared/raw/spotify_songs.csv 到 spotify_songs 表
--      编码 UTF-8、分隔符 ,、文本识别符 "、首行为字段名
--      若导入向导报 LOAD DATA 被禁用，改用 shared/scripts/01_import_raw.py
-- =============================================================

CREATE DATABASE IF NOT EXISTS `spotify_dashboard`
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_bin;

USE `spotify_dashboard`;

-- -------------------------------------------------------------
-- 主表：原始数据原样入库，23 列，32,833 行
--
-- 不做去重：同一个 track_id 出现在不同歌单里时，playlist_genre /
-- playlist_subgenre / playlist_name 不同，这是有效的分类维度。
-- 去重是各方向第二阶段自己的事。
-- -------------------------------------------------------------
DROP TABLE IF EXISTS `spotify_songs`;
CREATE TABLE `spotify_songs` (
  `id`                       BIGINT         NOT NULL AUTO_INCREMENT COMMENT '自增主键（原始数据无主键）',
  `track_id`                 VARCHAR(64)    NOT NULL                COMMENT '歌曲唯一标识',
  `track_name`               VARCHAR(512)   DEFAULT NULL            COMMENT '歌曲名；原始缺失值为字面量 NA',
  `track_artist`             VARCHAR(512)   DEFAULT NULL            COMMENT '歌手；未拆分合作艺人',
  `track_popularity`         SMALLINT       DEFAULT NULL            COMMENT '热度 0-100，0 是真实值不是缺失',
  `track_album_id`           VARCHAR(64)    DEFAULT NULL            COMMENT '专辑唯一标识',
  `track_album_name`         VARCHAR(512)   DEFAULT NULL            COMMENT '专辑名',
  `track_album_release_date` VARCHAR(64)    DEFAULT NULL            COMMENT '发行日期原始字符串，格式不统一（YYYY / YYYY-MM-DD / YYYY/MM/DD）',
  `playlist_name`            VARCHAR(255)   DEFAULT NULL            COMMENT '歌单名',
  `playlist_id`              VARCHAR(64)    DEFAULT NULL            COMMENT '歌单唯一标识',
  `playlist_genre`           VARCHAR(64)    DEFAULT NULL            COMMENT '大流派：pop/latin/r&b/rap/rock/edm',
  `playlist_subgenre`        VARCHAR(128)   DEFAULT NULL            COMMENT '子流派，共 24 种',
  `danceability`             DECIMAL(12,8)  DEFAULT NULL            COMMENT '舞曲性 0-1',
  `energy`                   DECIMAL(12,8)  DEFAULT NULL            COMMENT '能量 0-1',
  `key`                      SMALLINT       DEFAULT NULL            COMMENT '调性 0-11；MySQL 保留字，写 SQL 要加反引号',
  `loudness`                 DECIMAL(12,6)  DEFAULT NULL            COMMENT '响度 dB，通常为负',
  `mode`                     SMALLINT       DEFAULT NULL            COMMENT '1=大调 0=小调',
  `speechiness`              DECIMAL(12,8)  DEFAULT NULL            COMMENT '口语化程度 0-1',
  `acousticness`             DECIMAL(12,8)  DEFAULT NULL            COMMENT '原声程度 0-1',
  `instrumentalness`         DECIMAL(20,16) DEFAULT NULL            COMMENT '器乐程度 0-1；中位数仅 1.6e-05，精度给足',
  `liveness`                 DECIMAL(12,8)  DEFAULT NULL            COMMENT '现场感 0-1',
  `valence`                  DECIMAL(12,8)  DEFAULT NULL            COMMENT '情绪积极度 0-1',
  `tempo`                    DECIMAL(12,6)  DEFAULT NULL            COMMENT '每分钟节拍数 BPM',
  `duration_ms`              INT            DEFAULT NULL            COMMENT '时长（毫秒）',
  PRIMARY KEY (`id`),
  KEY `idx_track_id`     (`track_id`),
  KEY `idx_artist`       (`track_artist`),
  KEY `idx_genre`        (`playlist_genre`),
  KEY `idx_subgenre`     (`playlist_subgenre`),
  KEY `idx_popularity`   (`track_popularity`),
  KEY `idx_album_id`     (`track_album_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin
  COMMENT='Spotify 歌曲原始数据，原样入库，32,833 行 × 23 列';


-- =============================================================
-- 导入后校验（期望值写死在注释里，对不上说明导入有问题）
-- =============================================================
-- SELECT COUNT(*) FROM spotify_songs;                          -- 期望 32833
-- SELECT COUNT(DISTINCT track_id) FROM spotify_songs;          -- 期望 28356
-- SELECT COUNT(DISTINCT track_artist) FROM spotify_songs;      -- 期望 10693
-- SELECT COUNT(DISTINCT track_album_name) FROM spotify_songs;  -- 期望 19744
-- SELECT COUNT(*) FROM spotify_songs WHERE track_popularity=0; -- 期望 2703
--
-- 流派分布：edm 6043 / rap 5746 / pop 5507 / r&b 5431 / latin 5155 / rock 4951
-- SELECT playlist_genre, COUNT(*) FROM spotify_songs GROUP BY playlist_genre ORDER BY 2 DESC;
