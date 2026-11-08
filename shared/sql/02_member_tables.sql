-- =====================================================================
-- 第二阶段（本人方向）· 两张交互表
-- artist_favorite：关注歌手（页面「关注歌手」交互件写这张表）
-- song_tag：歌曲标签（页面「歌曲打标签」交互件写这张表）
-- 字符集 utf8mb4 / 排序规则 utf8mb4_bin（与主表一致，区分大小写）
-- 执行：mysql -uroot -p123456 spotify_dashboard < 02_member_tables.sql
-- =====================================================================
USE spotify_dashboard;

CREATE TABLE IF NOT EXISTS artist_favorite (
    id          BIGINT       NOT NULL AUTO_INCREMENT COMMENT '主键',
    artist_name VARCHAR(512) NOT NULL COMMENT '歌手名，取值来自 artist_track_view.track_artist',
    note        VARCHAR(255)     NULL DEFAULT NULL COMMENT '备注',
    in_dataset  TINYINT(1)   NOT NULL DEFAULT 0 COMMENT '该歌手是否存在于 artist_track_view（1=库里真实歌手，0=只有名字、库里没有）',
    created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '关注时间',
    PRIMARY KEY (id),
    UNIQUE KEY uk_artist_name (artist_name),
    KEY idx_created_at (created_at)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_bin COMMENT = '关注的歌手';

CREATE TABLE IF NOT EXISTS song_tag (
    id         BIGINT      NOT NULL AUTO_INCREMENT COMMENT '主键',
    track_id   VARCHAR(64) NOT NULL COMMENT '歌曲 ID，对应 spotify_songs.track_id',
    tag_name   VARCHAR(64) NOT NULL COMMENT '标签名',
    created_at DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '打标签时间',
    PRIMARY KEY (id),
    UNIQUE KEY uk_track_tag (track_id, tag_name),
    KEY idx_track_id (track_id),
    KEY idx_created_at (created_at)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_bin COMMENT = '歌曲标签';

-- =====================================================================
-- 升级说明（老库补列）：
-- 若 artist_favorite 已经建好、且还没有 in_dataset 列，执行下面这一句即可；
-- 已经有了会报 1060 Duplicate column name，忽略即可。
-- =====================================================================
ALTER TABLE artist_favorite
    ADD COLUMN in_dataset TINYINT(1) NOT NULL DEFAULT 0
    COMMENT '该歌手是否存在于 artist_track_view（1=库里真实歌手，0=只有名字、库里没有）' AFTER note;

-- 历史数据回填（新增 in_dataset 列之后跑一次，老记录也会带上「库内/库外」标记）：
UPDATE artist_favorite f
SET f.in_dataset = (
    SELECT COUNT(*) FROM artist_track_view v
    WHERE v.track_artist IS NOT NULL AND v.track_artist <> 'NA'
      AND v.track_artist COLLATE utf8mb4_general_ci = f.artist_name COLLATE utf8mb4_general_ci
) > 0;
