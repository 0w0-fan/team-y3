package com.fan.spotify.mapper;

import com.fan.spotify.dto.AlbumBin;
import com.fan.spotify.dto.ArtistPoint;
import com.fan.spotify.dto.ArtistSpan;
import com.fan.spotify.dto.ArtistTop;
import com.fan.spotify.dto.BinCount;
import com.fan.spotify.dto.SongPoint;
import com.fan.spotify.dto.SongBrief;
import com.fan.spotify.dto.YearPoint;
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

    /**
     * 主表总行数。这是「歌曲-歌单」明细记录数（32,833），同一首歌被多个歌单收录会重复计数，
     * 所以它比真正的歌曲数大。供 /api/ping 做健康检查用。
     */
    @Select("SELECT COUNT(*) FROM spotify_songs")
    long countRows();

    /**
     * 去重视图的行数 = 去重后的歌曲数（28,356）。
     * 视图 artist_track_view 按 track_id 只保留一行，所有图表口径都基于它。
     */
    @Select("SELECT COUNT(*) FROM artist_track_view")
    long countSongs();

    /**
     * 唯一歌手数（10,693）。这里不排除字面量 'NA'，因为它是原始数据里真实存在的一行，
     * 顶部 KPI 要与数据字典对齐；需要按歌手分组统计时再单独过滤（见下面各查询）。
     */
    @Select("SELECT COUNT(DISTINCT track_artist) FROM artist_track_view")
    long countArtists();

    /**
     * 唯一专辑数（19,744），同样是数据字典里的口径，不做额外过滤。
     */
    @Select("SELECT COUNT(DISTINCT track_album_name) FROM artist_track_view")
    long countAlbums();

    /** 主表（未去重）全局平均热度，任务文档写死的四象限 y 分割线 42.48 */
    @Select("SELECT ROUND(AVG(track_popularity), 2) FROM spotify_songs")
    double avgPopularity();

    /** 去重视图上的平均热度，仅供参考 */
    @Select("SELECT ROUND(AVG(track_popularity), 2) FROM artist_track_view")
    double avgPopularityDedup();

    /* ---------------- 图 1：作品数 × 平均热度 四象限散点 ---------------- */

    /**
     * 图 1 四象限散点的原始数据，每位歌手一行：
     * works = COUNT(DISTINCT track_id) 作品数；avgPop = AVG(track_popularity) 平均热度；
     * albumCount = COUNT(DISTINCT track_album_id) 专辑数（v2 用它映射气泡大小）。
     * 过滤掉作品数 < 3 的歌手（3,000 多位只有 1~2 首的长尾歌手放进主图会糊成一片），
     * 结果稳定为 2,486 行，与任务文档的期望值一致；同时排除空值/字面量 'NA' 的假歌手。
     */
    @Select("SELECT track_artist AS name, "
            + "       COUNT(DISTINCT track_id) AS works, "
            + "       ROUND(AVG(track_popularity), 2) AS avgPop, "
            + "       COUNT(DISTINCT track_album_id) AS albumCount, "
            + "       ROUND(AVG(duration_min), 2) AS avgDur "
            + "FROM artist_track_view "
            + "WHERE track_artist IS NOT NULL AND track_artist <> 'NA' "
            + "GROUP BY track_artist "
            + "HAVING COUNT(DISTINCT track_id) >= 3 "
            + "ORDER BY works DESC, avgPop DESC")
    List<ArtistPoint> selectQuadrant();

    /* ---------------- 图 2：歌手作品数长尾分布 ---------------- */

    /**
     * 图 2 长尾分布：把歌手按作品数分箱后统计每箱人数。
     * 分箱规则写在 SQL 的 CASE WHEN 里（1/2/3/4/5/6-10/11-20/21+），返回顺序不保证，
     * Service 层会按固定顺序重排成 8 个柱。
     */
    @Select("SELECT b.bin AS bin, COUNT(*) AS artists, "
            + "       IFNULL(SUM(b.n), 0) AS songs, "
            + "       ROUND(AVG(b.p), 2) AS avgPop "
            + "FROM ("
            + "  SELECT CASE WHEN n = 1 THEN '1' WHEN n = 2 THEN '2' WHEN n = 3 THEN '3' "
            + "              WHEN n = 4 THEN '4' WHEN n = 5 THEN '5' "
            + "              WHEN n BETWEEN 6 AND 10 THEN '6-10' "
            + "              WHEN n BETWEEN 11 AND 20 THEN '11-20' "
            + "              ELSE '21+' END AS bin, "
            + "         n, p "
            + "  FROM (SELECT track_artist, COUNT(DISTINCT track_id) AS n, "
            + "               AVG(track_popularity) AS p "
            + "        FROM artist_track_view "
            + "        WHERE track_artist IS NOT NULL AND track_artist <> 'NA' "
            + "        GROUP BY track_artist) a "
            + ") b GROUP BY b.bin")
    List<BinCount> selectArtistDistribution();

    /* ---------------- 图 3：平均热度 TOP N ---------------- */

    /**
     * 图 3 平均热度 TOP N（默认 20 位）。
     * 只统计作品数 >= 3 的歌手，避免「只有 1 首歌恰好很热」的歌手霸榜；
     * 排序额外加了作品数与歌手名作为第二、第三关键字，保证同热度时结果稳定可复现。
     * @param limit 取前多少位，Service 层已限制在 100 以内
     */
    @Select("SELECT track_artist AS name, "
            + "       COUNT(DISTINCT track_id) AS works, "
            + "       ROUND(AVG(track_popularity), 2) AS avgPop, "
            + "       COUNT(DISTINCT track_album_id) AS albumCount, "
            + "       IFNULL(MIN(release_year), 0) AS minYear, "
            + "       IFNULL(MAX(release_year), 0) AS maxYear, "
            + "       ROUND(AVG(duration_min), 2) AS avgDur "
            + "FROM artist_track_view "
            + "WHERE track_artist IS NOT NULL AND track_artist <> 'NA' "
            + "GROUP BY track_artist "
            + "HAVING COUNT(DISTINCT track_id) >= 3 "
            + "ORDER BY AVG(track_popularity) DESC, works DESC, track_artist ASC "
            + "LIMIT #{limit}")
    List<ArtistTop> selectTopArtists(@Param("limit") int limit);

    /* ---------------- 图 4：专辑曲目数 × 歌曲平均热度 ---------------- */

    /**
     * 图 4 专辑曲目数分箱：每箱的专辑数 + 歌曲平均热度。
     * 只统计曲目数 >= 2 的专辑（19,744 张专辑里有近一半只有 1 首，没有「分箱」的意义）。
     * 平均热度用歌曲加权：SUM(曲目数 x 该专辑均热) / SUM(曲目数)，
     * 也就是「该箱内所有歌曲的 AVG(track_popularity)」，与图 1 的热度口径保持一致。
     */
    @Select("SELECT b.bin AS bin, "
            + "       COUNT(*) AS albums, "
            + "       SUM(b.n) AS songs, "
            + "       ROUND(SUM(b.n * b.p) / SUM(b.n), 2) AS avgPop, "
            + "       ROUND(SUM(b.n * b.d) / SUM(b.n), 2) AS avgDur "
            + "FROM ("
            + "  SELECT CASE WHEN n = 2 THEN '2' WHEN n BETWEEN 3 AND 4 THEN '3-4' "
            + "              WHEN n BETWEEN 5 AND 9 THEN '5-9' ELSE '10+' END AS bin, "
            + "         n, p, d "
            + "  FROM (SELECT track_album_name, COUNT(DISTINCT track_id) AS n, "
            + "               AVG(track_popularity) AS p, AVG(duration_min) AS d "
            + "        FROM artist_track_view "
            + "        WHERE track_album_name IS NOT NULL AND track_album_name <> 'NA' "
            + "        GROUP BY track_album_name "
            + "        HAVING COUNT(DISTINCT track_id) >= 2) alb "
            + ") b GROUP BY b.bin")
    List<AlbumBin> selectAlbumBins();

    /* ---------------- 图 5：歌手活跃年份跨度 TOP N ---------------- */

    /**
     * 图 5 歌手活跃年份跨度 TOP N。
     * span = MAX(release_year) - MIN(release_year)，即最早与最晚发行年份之差。
     * 只取作品数 >= 3 且两个年份都非空的歌手（年份来自字符串截取，非法格式在视图里留 NULL）。
     * @param limit 取前多少位
     */
    @Select("SELECT track_artist AS name, "
            + "       COUNT(DISTINCT track_id) AS works, "
            + "       ROUND(AVG(track_popularity), 2) AS avgPop, "
            + "       COUNT(DISTINCT track_album_id) AS albumCount, "
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

    /**
     * 图 6 热度 x 时长全量散点：28,356 个点，一个点一首歌。
     * 不分页、不采样，前端用 ECharts 的 large 模式渲染（实测 JSON 约 50 万字节、0.13 秒返回）。
     */
    @Select("SELECT duration_min AS x, track_popularity AS y FROM artist_track_view")
    List<SongPoint> selectPopularityDuration();

    /* ---------------- 图 7：逐年歌曲数 × 平均热度（v2 新增） ---------------- */

    /**
     * 图 7 逐年歌曲数 x 平均热度（v2 新增）。
     * 年份区间默认 1957-2019：数据里 2020 年只有 785 行，是抓取时点造成的截断，
     * 放进来会让趋势图最后一年断崖式下跌，所以默认不取。
     * @param from 起始年份（含）
     * @param to   结束年份（含）
     */
    @Select("SELECT release_year AS year, "
            + "       COUNT(DISTINCT track_id) AS songs, "
            + "       ROUND(AVG(track_popularity), 2) AS avgPop, "
            + "       COUNT(DISTINCT CASE WHEN track_artist <> 'NA' THEN track_artist END) AS artists, "
            + "       COUNT(DISTINCT track_album_id) AS albums, "
            + "       ROUND(AVG(duration_min), 2) AS avgDur, "
            + "       MAX(track_popularity) AS maxPop "
            + "FROM artist_track_view "
            + "WHERE release_year BETWEEN #{from} AND #{to} "
            + "GROUP BY release_year ORDER BY release_year")
    List<YearPoint> selectYearTrend(@Param("from") int from, @Param("to") int to);

    /* ---------------- 交互件：歌手联想搜索与存在性判断 ---------------- */

    /**
     * 判断一位歌手在数据集里是否真实存在（用于「关注歌手」打「库内/库外」标记）。
     * 比较时强制用 utf8mb4_general_ci：库表本身是 utf8mb4_bin（区分大小写），
     * 用户手输 "billie eilish" 也应该算命中 "Billie Eilish"。
     * @param name 歌手名
     * @return 命中行数，&gt;0 表示库里有这位歌手
     */
    @Select("SELECT COUNT(*) FROM artist_track_view "
            + "WHERE track_artist IS NOT NULL AND track_artist <> 'NA' "
            + "AND track_artist COLLATE utf8mb4_general_ci = #{name}")
    int countArtistInDataset(@Param("name") String name);

    /**
     * 歌手联想：输入片段，返回匹配的歌手及其作品数/平均热度/专辑数，
     * 供「按歌手搜索」模式的候选列表用（点一下就把名字填进输入框）。
     * 注意分组仍走 utf8mb4_bin，所以 "Nimo" 与 "nimo" 不会被合并成一位歌手；
     * 只有 LIKE 匹配这一步是不区分大小写的。
     * @param q     歌手名片段
     * @param limit 返回条数上限
     */
    @Select("SELECT track_artist AS name, "
            + "       COUNT(DISTINCT track_id) AS works, "
            + "       ROUND(AVG(track_popularity), 2) AS avgPop, "
            + "       COUNT(DISTINCT track_album_id) AS albumCount, "
            + "       ROUND(AVG(duration_min), 2) AS avgDur "
            + "FROM artist_track_view "
            + "WHERE track_artist IS NOT NULL AND track_artist <> 'NA' "
            + "AND track_artist COLLATE utf8mb4_general_ci LIKE CONCAT('%', #{q}, '%') "
            + "GROUP BY track_artist "
            + "ORDER BY works DESC, avgPop DESC "
            + "LIMIT #{limit}")
    List<ArtistPoint> searchArtists(@Param("q") String q, @Param("limit") int limit);

    /**
     * 这首（真实）歌曲是否存在于去重视图 —— 收藏歌曲时判断「库内/库外」用。
     * @param trackId Spotify 的歌曲 id
     * @return 命中行数
     */
    @Select("SELECT COUNT(*) FROM artist_track_view WHERE track_id = #{trackId}")
    int countTrackInDataset(@Param("trackId") String trackId);

    /**
     * 用 track_id 反查歌名（前端只传了 id 没传名字时兜底）。
     * @param trackId Spotify 的歌曲 id
     * @return 歌名，查不到返回 null
     */
    @Select("SELECT track_name FROM artist_track_view WHERE track_id = #{trackId} LIMIT 1")
    String findTrackName(@Param("trackId") String trackId);

    /* ---------------- 交互件：歌曲搜索 ---------------- */

    /**
     * 歌曲检索：给「按歌曲搜索」模式找歌用。
     * 只匹配歌名（不匹配歌手名——要找歌手请用上面的 searchArtists），
     * 并且强制 utf8mb4_general_ci，让 "LOVE" / "love" 都能查到。
     * 按热度降序返回，热门的排在前面更容易被选中。
     * @param q     关键词，Service 层已做长度校验
     * @param limit 返回条数上限
     */
    @Select("SELECT track_id AS trackId, track_name AS trackName, track_artist AS artist, "
            + "       track_popularity AS popularity, duration_min AS durationMin "
            + "FROM artist_track_view "
            + "WHERE track_name COLLATE utf8mb4_general_ci LIKE CONCAT('%', #{q}, '%') "
            + "ORDER BY track_popularity DESC, track_name ASC "
            + "LIMIT #{limit}")
    List<SongBrief> searchSongs(@Param("q") String q, @Param("limit") int limit);
}
