-- =============================================================
-- team-y3 · Spotify 歌曲数据分析大屏
-- 第一阶段：公用基础数据建表脚本
--
-- 用法（Navicat Premium）：
--   1. 新建数据库 spotify_dashboard，字符集 utf8mb4 / 排序 utf8mb4_general_ci
--   2. 打开本文件，在 spotify_dashboard 库上执行
--   3. 用「导入向导」把 shared/csv/spotify_songs_clean.csv 导入 spotify_songs 表
--      编码选 UTF-8，字段分隔符 , ，文本识别符 " ，首行为字段名
--   4. 执行本文件末尾的校验查询，确认行数
-- =============================================================

CREATE DATABASE IF NOT EXISTS `spotify_dashboard`
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_general_ci;

USE `spotify_dashboard`;

-- -------------------------------------------------------------
-- 主表：全量歌曲-歌单记录（32,833 行，一格都不去重）
--
-- 为什么不去重：同一个 track_id 出现在不同歌单里，playlist_genre /
-- playlist_subgenre / playlist_name 不同，这本身是有效的分类信息。
-- 歌手/专辑维度的去重属于第二阶段，由各成员在自己的库里做视图，
-- 不要污染这张公用表。
-- -------------------------------------------------------------
DROP TABLE IF EXISTS `spotify_songs`;
CREATE TABLE `spotify_songs` (
  `id`                     BIGINT        NOT NULL AUTO_INCREMENT COMMENT '自增主键（数据源无主键，导入后生成）',
  `track_id`               VARCHAR(64)   NOT NULL                COMMENT '歌曲唯一标识',
  `track_name`             VARCHAR(512)  DEFAULT NULL            COMMENT '歌曲名（原始 5 行为空）',
  `track_artist`           VARCHAR(512)  DEFAULT NULL            COMMENT '歌手（原始 5 行为空，不拆合作）',
  `track_popularity`       TINYINT       DEFAULT NULL            COMMENT '热度 0-100，0 是真实值不是缺失',
  `track_album_id`         VARCHAR(64)   DEFAULT NULL            COMMENT '专辑唯一标识',
  `track_album_name`       VARCHAR(512)  DEFAULT NULL            COMMENT '专辑名',
  `track_album_release_date` VARCHAR(32) DEFAULT NULL            COMMENT '原始发行日期字符串（未做加工）',
  `playlist_name`          VARCHAR(255)  DEFAULT NULL            COMMENT '歌单名',
  `playlist_id`            VARCHAR(64)   DEFAULT NULL            COMMENT '歌单唯一标识',
  `playlist_genre`         VARCHAR(64)   DEFAULT NULL            COMMENT '大流派：pop/latin/r&b/rap/rock/edm',
  `playlist_subgenre`      VARCHAR(128)  DEFAULT NULL            COMMENT '子流派（共 24 种）',
  `danceability`           DECIMAL(10,6) DEFAULT NULL            COMMENT '舞曲性 0-1',
  `energy`                 DECIMAL(10,6) DEFAULT NULL            COMMENT '能量 0-1',
  `key`                    TINYINT       DEFAULT NULL            COMMENT '调性 0-11',
  `loudness`               DECIMAL(10,4) DEFAULT NULL            COMMENT '响度 dB，通常为负',
  `mode`                   TINYINT       DEFAULT NULL            COMMENT '1=大调 0=小调',
  `speechiness`            DECIMAL(10,6) DEFAULT NULL            COMMENT '口语化程度 0-1',
  `acousticness`           DECIMAL(10,6) DEFAULT NULL            COMMENT '原声程度 0-1',
  `instrumentalness`       DECIMAL(12,8) DEFAULT NULL            COMMENT '器乐程度 0-1，取值极小需高精度',
  `liveness`               DECIMAL(10,6) DEFAULT NULL            COMMENT '现场感 0-1',
  `valence`                DECIMAL(10,6) DEFAULT NULL            COMMENT '情绪积极度 0-1',
  `tempo`                  DECIMAL(10,4) DEFAULT NULL            COMMENT '每分钟节拍数 BPM',
  `duration_ms`            INT           DEFAULT NULL            COMMENT '时长（毫秒）',
  `release_date_std`       VARCHAR(16)   DEFAULT NULL            COMMENT '标准化日期，按精度保留：YYYY / YYYY-MM / YYYY-MM-DD',
  `release_date_precision` VARCHAR(8)    DEFAULT NULL            COMMENT '日期精度：day / month / year',
  `release_year`           SMALLINT      DEFAULT NULL            COMMENT '发行年份（1,855 行仅年份精度也有值）',
  `release_month`          TINYINT       DEFAULT NULL            COMMENT '发行月份，仅 day/month 精度有值，year 精度为 NULL',
  `duration_sec`           DECIMAL(10,3) DEFAULT NULL            COMMENT '时长（秒）',
  `popularity_level`       VARCHAR(16)   DEFAULT NULL            COMMENT '热度分箱：0 / 1-20 / 21-40 / 41-60 / 61-80 / 81-100',
  PRIMARY KEY (`id`),
  KEY `idx_track_id`        (`track_id`),
  KEY `idx_artist`          (`track_artist`),
  KEY `idx_genre`           (`playlist_genre`),
  KEY `idx_subgenre`        (`playlist_subgenre`),
  KEY `idx_release_year`    (`release_year`),
  KEY `idx_popularity`      (`track_popularity`),
  KEY `idx_album_id`        (`track_album_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
  COMMENT='Spotify 歌曲全量记录（第一段公用基础数据，32,833 行）';


-- =============================================================
-- 导入后校验（把 CSV 导入 spotify_songs 之后执行这一段）
-- 期望值全部写在注释里，对不上说明导入有问题
-- =============================================================
-- SELECT COUNT(*) AS 总行数            FROM spotify_songs;  -- 期望 32833
-- SELECT COUNT(DISTINCT track_id) AS 唯一歌曲数 FROM spotify_songs;  -- 期望 28356
-- SELECT COUNT(*) AS 热度为0的行数     FROM spotify_songs WHERE track_popularity = 0;  -- 期望 2703
-- SELECT COUNT(*) AS 仅年份精度的行数  FROM spotify_songs WHERE release_date_precision = 'year';  -- 期望 1855
--
-- 日期精度分布，期望 day=30947 / month=31 / year=1855
-- SELECT release_date_precision, COUNT(*) FROM spotify_songs GROUP BY release_date_precision;
--
-- 流派分布，期望 edm=6043 pop=5507 rap=5746 rock=4951 latin=5155 r&b=5431
-- SELECT playlist_genre, COUNT(*) FROM spotify_songs GROUP BY playlist_genre ORDER BY 2 DESC;
