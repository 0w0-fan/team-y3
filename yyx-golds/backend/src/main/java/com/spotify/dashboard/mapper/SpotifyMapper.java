package com.spotify.dashboard.mapper;

import com.spotify.dashboard.dto.BinCountRow;
import com.spotify.dashboard.dto.FeatureAvgRow;
import com.spotify.dashboard.dto.GenreSummary;
import com.spotify.dashboard.dto.MedianRow;
import com.spotify.dashboard.dto.SankeyRow;
import com.spotify.dashboard.dto.SubGenreRankItem;
import com.spotify.dashboard.dto.TrendRow;
import com.spotify.dashboard.entity.Song;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;

/**
 * 六张图的聚合查询 + 明细查询。
 * 全部为注解式 SQL，不写 XML；分析集固定为 spotify_songs 全量 32,833 行（不去重）。
 */
public interface SpotifyMapper {

    /** 总记录数，用于占比计算与底栏展示 */
    @Select("SELECT COUNT(*) FROM spotify_songs")
    long countAll();

    /** 子流派总数，用于 ② 的 total 字段 */
    @Select("SELECT COUNT(DISTINCT playlist_subgenre) FROM spotify_songs")
    int countSubGenres();

    /** 图表 ①：流派歌曲数 + 平均热度（按歌曲数降序） */
    @Select("SELECT playlist_genre AS genre, COUNT(*) AS songCount, " +
            "ROUND(AVG(track_popularity), 2) AS avgPopularity " +
            "FROM spotify_songs GROUP BY playlist_genre ORDER BY songCount DESC")
    List<GenreSummary> selectGenreSummary();

    /** 图表 ① 补充：中位热度（MySQL 无 PERCENTILE_CONT，用窗口函数取中位两行均值） */
    @Select("WITH ordered AS (" +
            "  SELECT playlist_genre AS genre, track_popularity, " +
            "         ROW_NUMBER() OVER (PARTITION BY playlist_genre ORDER BY track_popularity) AS rn, " +
            "         COUNT(*)     OVER (PARTITION BY playlist_genre) AS c " +
            "  FROM spotify_songs" +
            ") " +
            "SELECT genre, CAST(ROUND(AVG(track_popularity), 0) AS SIGNED) AS medianPop " +
            "FROM ordered WHERE rn IN (FLOOR((c + 1) / 2), CEIL((c + 1) / 2)) GROUP BY genre")
    List<MedianRow> selectMedianPopularity();

    /** 图表 ③：(年, 流派) 歌曲数，只取 1990-2019 */
    @Select("SELECT release_year AS `year`, playlist_genre AS genre, COUNT(*) AS songCount " +
            "FROM spotify_songs WHERE release_year BETWEEN #{from} AND #{to} " +
            "GROUP BY release_year, playlist_genre ORDER BY release_year ASC")
    List<TrendRow> selectTrend(@Param("from") int from, @Param("to") int to);

    /** 图表 ②：子流派按平均热度降序取前 N */
    @Select("SELECT playlist_genre AS genre, playlist_subgenre AS subgenre, COUNT(*) AS songCount, " +
            "ROUND(AVG(track_popularity), 2) AS avgPopularity " +
            "FROM spotify_songs GROUP BY playlist_genre, playlist_subgenre " +
            "ORDER BY avgPopularity DESC, songCount DESC LIMIT #{top}")
    List<SubGenreRankItem> selectSubGenreRank(@Param("top") int top);

    /** 图表 ⑤：六流派 7 个音频特征原始均值 */
    @Select("SELECT playlist_genre AS genre, " +
            "ROUND(AVG(danceability), 4) AS danceability, " +
            "ROUND(AVG(energy), 4) AS energy, " +
            "ROUND(AVG(speechiness), 4) AS speechiness, " +
            "ROUND(AVG(acousticness), 4) AS acousticness, " +
            "ROUND(AVG(instrumentalness), 4) AS instrumentalness, " +
            "ROUND(AVG(liveness), 4) AS liveness, " +
            "ROUND(AVG(valence), 4) AS valence " +
            "FROM spotify_songs GROUP BY playlist_genre")
    List<FeatureAvgRow> selectFeatureAvg();

    /** 图表 ⑥：(热度分箱, 流派) 歌曲数，分箱按人读顺序返回 */
    @Select("SELECT popularity_bin AS popBin, playlist_genre AS genre, COUNT(*) AS songCount " +
            "FROM spotify_songs GROUP BY popularity_bin, playlist_genre " +
            "ORDER BY FIELD(popularity_bin, '0-20', '21-40', '41-60', '61-80', '81-100'), playlist_genre")
    List<BinCountRow> selectBinCount();

    /** 图表 ④：流派 -> 子流派 歌曲数 */
    @Select("SELECT playlist_genre AS src, playlist_subgenre AS dst, COUNT(*) AS `value` " +
            "FROM spotify_songs GROUP BY playlist_genre, playlist_subgenre ORDER BY `value` DESC")
    List<SankeyRow> selectSankey();

    /** 明细分页（查）：总数 */
    @Select("<script>" +
            "SELECT COUNT(*) FROM spotify_songs" +
            "<where>" +
            "  <if test=\"genre != null and genre != ''\">AND playlist_genre = #{genre}</if>" +
            "  <if test=\"subgenre != null and subgenre != ''\">AND playlist_subgenre = #{subgenre}</if>" +
            "  <if test=\"keyword != null and keyword != ''\">AND (track_name LIKE CONCAT('%', #{keyword}, '%') OR track_artist LIKE CONCAT('%', #{keyword}, '%'))</if>" +
            "  <if test=\"minPop != null\">AND track_popularity &gt;= #{minPop}</if>" +
            "  <if test=\"maxPop != null\">AND track_popularity &lt;= #{maxPop}</if>" +
            "</where>" +
            "</script>")
    long countSongs(@Param("genre") String genre,
                    @Param("subgenre") String subgenre,
                    @Param("keyword") String keyword,
                    @Param("minPop") Integer minPop,
                    @Param("maxPop") Integer maxPop);

    /** 明细分页（查）：当前页。sortColumn / sortOrder 已在 Service 层白名单校验 */
    @Select("<script>" +
            "SELECT id, track_id, track_name, track_artist, playlist_id, playlist_name, " +
            "       playlist_genre, playlist_subgenre, track_popularity, popularity_bin, " +
            "       release_year, release_month, date_precision, danceability, energy, speechiness, " +
            "       acousticness, instrumentalness, liveness, valence, tempo, loudness, duration_sec, quality_flag " +
            "FROM spotify_songs" +
            "<where>" +
            "  <if test=\"genre != null and genre != ''\">AND playlist_genre = #{genre}</if>" +
            "  <if test=\"subgenre != null and subgenre != ''\">AND playlist_subgenre = #{subgenre}</if>" +
            "  <if test=\"keyword != null and keyword != ''\">AND (track_name LIKE CONCAT('%', #{keyword}, '%') OR track_artist LIKE CONCAT('%', #{keyword}, '%'))</if>" +
            "  <if test=\"minPop != null\">AND track_popularity &gt;= #{minPop}</if>" +
            "  <if test=\"maxPop != null\">AND track_popularity &lt;= #{maxPop}</if>" +
            "</where>" +
            " ORDER BY ${sortColumn} ${sortOrder}, id ASC LIMIT #{size} OFFSET #{offset}" +
            "</script>")
    List<Song> selectSongPage(@Param("genre") String genre,
                              @Param("subgenre") String subgenre,
                              @Param("keyword") String keyword,
                              @Param("minPop") Integer minPop,
                              @Param("maxPop") Integer maxPop,
                              @Param("sortColumn") String sortColumn,
                              @Param("sortOrder") String sortOrder,
                              @Param("offset") int offset,
                              @Param("size") int size);

    /** 单条明细 */
    @Select("SELECT id, track_id, track_name, track_artist, playlist_id, playlist_name, " +
            "       playlist_genre, playlist_subgenre, track_popularity, popularity_bin, " +
            "       release_year, release_month, date_precision, danceability, energy, speechiness, " +
            "       acousticness, instrumentalness, liveness, valence, tempo, loudness, duration_sec, quality_flag " +
            "FROM spotify_songs WHERE id = #{id}")
    Song selectSongById(@Param("id") int id);
}
