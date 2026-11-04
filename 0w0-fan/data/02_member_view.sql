-- =====================================================================
-- 第二阶段（本人方向）· 歌曲级去重视图
-- 口径：按 track_id 去重（一首歌被多个歌单收录时只保留一行），
--       并派生 release_year / duration_min / popularity_level。
-- 目标行数：28,356（原始表 32,833 行，4,477 行是同一首歌的重复歌单记录）
-- 执行：mysql -uroot -p123456 spotify_dashboard < 02_member_view.sql
-- =====================================================================
USE spotify_dashboard;

DROP VIEW IF EXISTS artist_track_view;

CREATE VIEW artist_track_view AS
SELECT
    d.id,
    d.track_id,
    d.track_name,
    d.track_artist,
    d.track_album_id,
    d.track_album_name,
    d.track_popularity,
    d.duration_ms,
    -- 派生列 1：时长（分钟），保留 2 位
    ROUND(d.duration_ms / 60000, 2)                        AS duration_min,
    -- 派生列 2：发行年份，只从 '^YYYY' 的字符串截取；非法格式留 NULL，不编造
    CASE
        WHEN d.track_album_release_date REGEXP '^[0-9]{4}'
             AND CAST(LEFT(d.track_album_release_date, 4) AS UNSIGNED) BETWEEN 1900 AND 2100
        THEN CAST(LEFT(d.track_album_release_date, 4) AS UNSIGNED)
        ELSE NULL
    END                                                    AS release_year,
    -- 派生列 3：热度分档
    CASE
        WHEN d.track_popularity = 0            THEN 'cold'
        WHEN d.track_popularity < 30           THEN 'low'
        WHEN d.track_popularity < 60           THEN 'mid'
        WHEN d.track_popularity < 80           THEN 'high'
        ELSE 'hot'
    END                                                    AS popularity_level,
    d.danceability,
    d.energy,
    d.valence,
    d.tempo,
    d.playlist_genre,
    d.playlist_subgenre
FROM spotify_songs d
JOIN (
    -- 每个 track_id 只保留 id 最小的那一行
    SELECT track_id, MIN(id) AS keep_id
    FROM spotify_songs
    GROUP BY track_id
) k ON k.keep_id = d.id;
