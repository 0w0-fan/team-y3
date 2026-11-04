package com.fan.spotify.mapper;

import com.fan.spotify.dto.AlbumBin;
import com.fan.spotify.dto.ArtistPoint;
import com.fan.spotify.dto.ArtistSpan;
import com.fan.spotify.dto.ArtistTop;
import com.fan.spotify.dto.BinCount;
import com.fan.spotify.dto.SongPoint;
import com.fan.spotify.dto.SongBrief;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;

/**
 * 歌曲 / 歌手 / 专辑维度的统计查询。
 *
 * <p>除概览外，所有统计口径都基于第二阶段去重视图 {@code artist_track_view}（28,356 行）。</p>
 * <p>歌手维度统一排除 {@code track_artist IS NULL OR track_artist = 'NA'} 的假歌手（原始数据里字面量 NA）。</p>
 */
@Mapper
public interface SongMapper {

    /* ---------------- 概览 ---------------- */

    @Select("SELECT COUNT(*) FROM spotify_songs")
    long countRows();

    @Select("SELECT COUNT(*) FROM artist_track_view")
    long countSongs();

    @Select("SELECT COUNT(DISTINCT track_artist) FROM artist_track_view")
    long countArtists();

    @Select("SELECT COUNT(DISTINCT track_album_name) FROM artist_track_view")
    long countAlbums();

    /** 主表（未去重）全局平均热度，任务文档写死的四象限 y 分割线 42.48 */
    @Select("SELECT ROUND(AVG(track_popularity), 2) FROM spotify_songs")
    double avgPopularity();

    /** 去重视图上的平均热度，仅供参考 */
    @Select("SELECT ROUND(AVG(track_popularity), 2) FROM artist_track_view")
    double avgPopularityDedup();

    /* ---------------- 图 1：作品数 × 平均热度 四象限散点 ---------------- */

    @Select("SELECT track_artist AS name, "
            + "       COUNT(DISTINCT track_id) AS works, "
            + "       ROUND(AVG(track_popularity), 2) AS avgPop "
            + "FROM artist_track_view "
            + "WHERE track_artist IS NOT NULL AND track_artist <> 'NA' "
            + "GROUP BY track_artist "
            + "HAVING COUNT(DISTINCT track_id) >= 3 "
            + "ORDER BY works DESC, avgPop DESC")
    List<ArtistPoint> selectQuadrant();

    /* ---------------- 图 2：歌手作品数长尾分布 ---------------- */

    @Select("SELECT b.bin AS bin, COUNT(*) AS artists FROM ("
            + "  SELECT CASE WHEN n = 1 THEN '1' WHEN n = 2 THEN '2' WHEN n = 3 THEN '3' "
            + "              WHEN n = 4 THEN '4' WHEN n = 5 THEN '5' "
            + "              WHEN n BETWEEN 6 AND 10 THEN '6-10' "
            + "              WHEN n BETWEEN 11 AND 20 THEN '11-20' "
            + "              ELSE '21+' END AS bin "
            + "  FROM (SELECT track_artist, COUNT(DISTINCT track_id) AS n "
            + "        FROM artist_track_view "
            + "        WHERE track_artist IS NOT NULL AND track_artist <> 'NA' "
            + "        GROUP BY track_artist) a "
            + ") b GROUP BY b.bin")
    List<BinCount> selectArtistDistribution();

    /* ---------------- 图 3：平均热度 TOP N ---------------- */

    @Select("SELECT track_artist AS name, "
            + "       COUNT(DISTINCT track_id) AS works, "
            + "       ROUND(AVG(track_popularity), 2) AS avgPop "
            + "FROM artist_track_view "
            + "WHERE track_artist IS NOT NULL AND track_artist <> 'NA' "
            + "GROUP BY track_artist "
            + "HAVING COUNT(DISTINCT track_id) >= 3 "
            + "ORDER BY AVG(track_popularity) DESC, works DESC, track_artist ASC "
            + "LIMIT #{limit}")
    List<ArtistTop> selectTopArtists(@Param("limit") int limit);

    /* ---------------- 图 4：专辑曲目数 × 歌曲平均热度 ---------------- */

    @Select("SELECT b.bin AS bin, "
            + "       COUNT(*) AS albums, "
            + "       ROUND(SUM(b.n * b.p) / SUM(b.n), 2) AS avgPop "
            + "FROM ("
            + "  SELECT CASE WHEN n = 2 THEN '2' WHEN n BETWEEN 3 AND 4 THEN '3-4' "
            + "              WHEN n BETWEEN 5 AND 9 THEN '5-9' ELSE '10+' END AS bin, "
            + "         n, p "
            + "  FROM (SELECT track_album_name, COUNT(DISTINCT track_id) AS n, AVG(track_popularity) AS p "
            + "        FROM artist_track_view "
            + "        WHERE track_album_name IS NOT NULL AND track_album_name <> 'NA' "
            + "        GROUP BY track_album_name "
            + "        HAVING COUNT(DISTINCT track_id) >= 2) alb "
            + ") b GROUP BY b.bin")
    List<AlbumBin> selectAlbumBins();

    /* ---------------- 图 5：歌手活跃年份跨度 TOP N ---------------- */

    @Select("SELECT track_artist AS name, "
            + "       COUNT(DISTINCT track_id) AS works, "
            + "       MIN(release_year) AS minYear, "
            + "       MAX(release_year) AS maxYear, "
            + "       MAX(release_year) - MIN(release_year) AS span "
            + "FROM artist_track_view "
            + "WHERE track_artist IS NOT NULL AND track_artist <> 'NA' AND release_year IS NOT NULL "
            + "GROUP BY track_artist "
            + "HAVING COUNT(DISTINCT track_id) >= 3 "
            + "ORDER BY span DESC, works DESC, track_artist ASC "
            + "LIMIT #{limit}")
    List<ArtistSpan> selectTopSpans(@Param("limit") int limit);

    /* ---------------- 图 6：热度 × 时长 全量散点 ---------------- */

    @Select("SELECT duration_min AS x, track_popularity AS y FROM artist_track_view")
    List<SongPoint> selectPopularityDuration();

    /* ---------------- 交互件：歌曲搜索 ---------------- */

    @Select("SELECT track_id AS trackId, track_name AS trackName, track_artist AS artist, "
            + "       track_popularity AS popularity, duration_min AS durationMin "
            + "FROM artist_track_view "
            + "WHERE track_name LIKE CONCAT('%', #{q}, '%') OR track_artist LIKE CONCAT('%', #{q}, '%') "
            + "ORDER BY track_popularity DESC, track_name ASC "
            + "LIMIT #{limit}")
    List<SongBrief> searchSongs(@Param("q") String q, @Param("limit") int limit);
}
