-- ============================================================================
-- Spotify 流派大屏 · 方向一（流派与子流派的流行度结构与演进）
-- 建库 + 建表脚本
-- 执行： mysql -uroot -p123456 < 00_schema.sql
-- 说明： 本表是 01_clean_and_aggregate.py 清洗后的结果，24 列 / 32,833 行。
--        原始 23 列里有 9 列（专辑 id、专辑名、key、mode 等）本方向用不到，已弃用；
--        新增 5 列派生/标记：popularity_bin、release_year、release_month、
--        date_precision、duration_sec、quality_flag。
-- 注意： 服务端默认是 utf8mb3_general_ci，必须显式指定 utf8mb4 + utf8mb4_bin，
--        否则流派名/子流派名的大小写会被当成同一个值。
-- ============================================================================

CREATE DATABASE IF NOT EXISTS spotify_genre
  DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

USE spotify_genre;

DROP TABLE IF EXISTS spotify_songs;

CREATE TABLE spotify_songs (
  id               INT           NOT NULL COMMENT '行号主键 1-32833',
  track_id         VARCHAR(32)   NOT NULL COMMENT 'Spotify 曲目 ID（有重复，同一首歌可进多个歌单）',
  track_name       VARCHAR(512)  NULL     COMMENT '曲名，5 行原为 NA 已转 NULL',
  track_artist     VARCHAR(512)  NULL     COMMENT '歌手，同上',
  playlist_id      VARCHAR(64)   NOT NULL COMMENT '歌单 ID，471 个',
  playlist_name    VARCHAR(160)  NULL     COMMENT '歌单名，449 个',
  playlist_genre   VARCHAR(16)   NOT NULL COMMENT '流派，6 值：pop/rap/rock/latin/r&b/edm',
  playlist_subgenre VARCHAR(48)  NOT NULL COMMENT '子流派，24 值，与流派一对一',
  track_popularity TINYINT UNSIGNED NOT NULL COMMENT '热度 0-100',
  popularity_bin   VARCHAR(8)    NOT NULL COMMENT '热度分箱 0-20/21-40/41-60/61-80/81-100',
  release_year     SMALLINT      NOT NULL COMMENT '发行年 1957-2020，从日期串取前 4 位',
  release_month    TINYINT       NULL     COMMENT '发行月，仅年份精度(1855 行)为 NULL',
  date_precision   VARCHAR(8)    NOT NULL COMMENT '日期精度 day/month/year',
  danceability     DOUBLE        NULL     COMMENT '可舞性 0-1',
  energy           DOUBLE        NULL     COMMENT '能量 0-1',
  speechiness      DOUBLE        NULL     COMMENT '口语度 0-1',
  acousticness     DOUBLE        NULL     COMMENT '原声度 0-1',
  instrumentalness DOUBLE        NULL     COMMENT '器乐度 0-1，12089 行为 0',
  liveness         DOUBLE        NULL     COMMENT '现场感 0-1',
  valence          DOUBLE        NULL     COMMENT '愉悦度 0-1',
  tempo            DOUBLE        NULL     COMMENT 'BPM，1 行原为 0 已转 NULL',
  loudness         DOUBLE        NULL     COMMENT '响度 dB，-46.45 ~ 1.28',
  duration_sec     INT           NULL     COMMENT '时长（秒），duration_ms/1000',
  quality_flag     VARCHAR(48)   NOT NULL COMMENT 'ok / tempo_missing / meta_missing / short_track / long_track',
  PRIMARY KEY (id),
  KEY idx_genre        (playlist_genre),
  KEY idx_genre_sub    (playlist_genre, playlist_subgenre),
  KEY idx_year         (release_year),
  KEY idx_genre_year   (playlist_genre, release_year),
  KEY idx_popularity   (track_popularity),
  KEY idx_pop_bin      (popularity_bin),
  KEY idx_track        (track_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin
  COMMENT='方向一：歌单-曲目粒度明细，未去重';
