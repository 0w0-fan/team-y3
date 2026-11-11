-- ============================================================
-- genre_watch：流派关注列表（大屏「增删改查」的落库表）
-- 说明：spotify_songs 为分析主表，只读，不做任何增删改（口径要求）
-- 本脚本幂等，Spring Boot 启动时自动执行，也可在 Navicat 里手工跑
-- ============================================================
CREATE TABLE IF NOT EXISTS genre_watch (
    id          INT           NOT NULL AUTO_INCREMENT COMMENT '主键',
    genre       VARCHAR(16)   NOT NULL COMMENT '流派名（pop/rap/rock/latin/r&b/edm）',
    watch_level TINYINT       NOT NULL DEFAULT 3 COMMENT '关注等级 1-5',
    note        VARCHAR(255)  NULL COMMENT '运营备注',
    created_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    PRIMARY KEY (id),
    KEY idx_watch_genre (genre)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin COMMENT='流派关注列表';
