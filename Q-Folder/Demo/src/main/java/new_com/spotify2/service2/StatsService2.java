package new_com.spotify2.service2;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.*;

/**
 * 方向六：音乐的“物理与时间属性”分析（时间戳 + BPM + Duration + Loudness）
 *
 * 数据表：spotify_db.spotify_tracks
 *   由原始 spotify_songs（播放列表粒度，32,833 行）清洗而来：
 *   ① 按 track_id 去重（同一首歌可能出现在多个歌单里）
 *   ② 剔除时长 <30s 或 >15min、BPM 越界、响度越界的异常记录
 *   ③ 派生 duration_min / decade / era5 / is_short / is_long 等指标
 *   清洗后 28,351 首，作为本模块的唯一数据源。
 *
 * 所有分位数（P10/P25/中位数/P75/P99）都用 MySQL 8 窗口函数 ROW_NUMBER() 计算，
 * 避免把明细数据拉进内存排序。
 */
@Service("timeStatsService")
public class StatsService2 {

    /** 参与“结论”计算的最小样本量：1950s 只有 3 首歌，直接参与会把趋势带偏 */
    private static final int MIN_SAMPLE = 100;

    private static final String TABLE = "spotify_tracks";

    @Autowired
    private JdbcTemplate jdbc;

    /* ================================================================
     *  1. 音乐时长演化  GET /api/time/duration-evolution
     * ================================================================ */

    /** 五年分组的时长箱线图五数概括（最小值 / Q1 / 中位数 / Q3 / 最大值） */
    private List<Map<String, Object>> era5Box() {
        String sql =
                "WITH ranked AS ( " +
                "  SELECT era5, duration_min, is_short, " +
                "         ROW_NUMBER() OVER (PARTITION BY era5 ORDER BY duration_min) AS rn, " +
                "         COUNT(*)     OVER (PARTITION BY era5)                        AS cnt " +
                "  FROM " + TABLE +
                ") " +
                "SELECT era5, " +
                "       MAX(cnt)                                                          AS `count`, " +
                "       ROUND(MIN(duration_min),3)                                        AS `min`, " +
                "       ROUND(MAX(CASE WHEN rn = CEIL(cnt*0.25) THEN duration_min END),3) AS `q1`, " +
                "       ROUND(MAX(CASE WHEN rn = CEIL(cnt*0.50) THEN duration_min END),3) AS `median`, " +
                "       ROUND(MAX(CASE WHEN rn = CEIL(cnt*0.75) THEN duration_min END),3) AS `q3`, " +
                "       ROUND(MAX(CASE WHEN rn = CEIL(cnt*0.99) THEN duration_min END),3) AS `p99`, " +
                "       ROUND(MAX(CASE WHEN rn = cnt             THEN duration_min END),3) AS `max`, " +
                "       ROUND(AVG(duration_min),3)                                        AS `mean`, " +
                "       ROUND(SUM(is_short)/COUNT(*)*100,2)                               AS `shortPct` " +
                "FROM ranked GROUP BY era5 ORDER BY era5";
        return jdbc.queryForList(sql);
    }

    /**
     * 按 playlist_cnt 加权的中位数：等价于"同一首歌进 N 个歌单就算 N 次"。
     * 用来检验按 track_id 去重会不会改变结论——两条线重合说明口径稳健。
     */
    private List<Map<String, Object>> era5WeightedMedian() {
        String sql =
                "WITH b AS ( " +
                "  SELECT era5, duration_min, playlist_cnt, " +
                "         SUM(playlist_cnt) OVER (PARTITION BY era5 ORDER BY duration_min " +
                "             ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS cum, " +
                "         SUM(playlist_cnt) OVER (PARTITION BY era5)             AS total " +
                "  FROM " + TABLE +
                ") " +
                "SELECT era5, MAX(total) AS `totalWeight`, ROUND(MIN(duration_min),3) AS `wmedian` " +
                "FROM b WHERE cum >= total * 0.5 GROUP BY era5 ORDER BY era5";
        return jdbc.queryForList(sql);
    }

    /** 逐年时长中位数（样本量 >= 20 的年份） */
    private List<Map<String, Object>> yearMedian() {
        String sql =
                "WITH ranked AS ( " +
                "  SELECT release_year, duration_min, " +
                "         ROW_NUMBER() OVER (PARTITION BY release_year ORDER BY duration_min) AS rn, " +
                "         COUNT(*)     OVER (PARTITION BY release_year)                        AS cnt " +
                "  FROM " + TABLE +
                ") " +
                "SELECT release_year AS `year`, MAX(cnt) AS `count`, " +
                "       ROUND(MAX(CASE WHEN rn = CEIL(cnt*0.5) THEN duration_min END),3) AS `median`, " +
                "       ROUND(AVG(duration_min),3) AS `mean` " +
                "FROM ranked GROUP BY release_year HAVING MAX(cnt) >= 20 ORDER BY release_year";
        return jdbc.queryForList(sql);
    }

    public Map<String, Object> durationEvolution() {
        List<Map<String, Object>> eras = era5Box();
        List<Map<String, Object>> years = yearMedian();

        Map<String, Object> first = null, peak = null, last = null;
        for (Map<String, Object> r : eras) {
            if (num(r.get("count")) < MIN_SAMPLE) {
                continue;
            }
            if (first == null) {
                first = r;
            }
            last = r;
            if (peak == null || num(r.get("median")) > num(peak.get("median"))) {
                peak = r;
            }
        }

        Map<String, Object> summary = new LinkedHashMap<>();
        if (first != null && last != null && peak != null) {
            double pm = num(peak.get("median"));
            double lm = num(last.get("median"));
            summary.put("firstEra", first.get("era5"));
            summary.put("firstMedian", first.get("median"));
            summary.put("peakEra", peak.get("era5"));
            summary.put("peakMedian", peak.get("median"));
            summary.put("latestEra", last.get("era5"));
            summary.put("latestMedian", last.get("median"));
            summary.put("peakToLatestMin", round(pm - lm, 2));
            summary.put("peakToLatestPct", round((lm - pm) / pm * 100, 1));
            summary.put("shortPctLatest", last.get("shortPct"));
        }
        summary.put("minSample", MIN_SAMPLE);

        // 口径校验：加权中位数 vs 等权中位数 的最大偏差（分钟）
        List<Map<String, Object>> weighted = era5WeightedMedian();
        Map<String, Double> wMap = new HashMap<>();
        for (Map<String, Object> r : weighted) {
            wMap.put(String.valueOf(r.get("era5")), num(r.get("wmedian")));
        }
        double maxDiff = 0;
        for (Map<String, Object> r : eras) {
            if (num(r.get("count")) < 50) {
                continue;
            }
            Double w = wMap.get(String.valueOf(r.get("era5")));
            if (w != null) {
                maxDiff = Math.max(maxDiff, Math.abs(w - num(r.get("median"))));
            }
        }
        summary.put("weightDiffMax", round(maxDiff, 3));

        Map<String, Object> data = new LinkedHashMap<>();
        data.put("era5", eras);
        data.put("era5Weighted", weighted);
        data.put("year", years);
        data.put("summary", summary);
        return data;
    }

    /* ================================================================
     *  2. “响度战争”  GET /api/time/loudness-war
     * ================================================================ */

    /** 逐年响度：均值 / 中位数 / P10 / P90 / 极值 */
    private List<Map<String, Object>> loudnessByYear() {
        String sql =
                "WITH ranked AS ( " +
                "  SELECT release_year, loudness, " +
                "         ROW_NUMBER() OVER (PARTITION BY release_year ORDER BY loudness) AS rn, " +
                "         COUNT(*)     OVER (PARTITION BY release_year)                    AS cnt " +
                "  FROM " + TABLE +
                ") " +
                "SELECT release_year AS `year`, MAX(cnt) AS `count`, " +
                "       ROUND(AVG(loudness),3)                                        AS `mean`, " +
                "       ROUND(MAX(CASE WHEN rn = CEIL(cnt*0.50) THEN loudness END),3) AS `median`, " +
                "       ROUND(MAX(CASE WHEN rn = CEIL(cnt*0.10) THEN loudness END),3) AS `p10`, " +
                "       ROUND(MAX(CASE WHEN rn = CEIL(cnt*0.90) THEN loudness END),3) AS `p90`, " +
                "       ROUND(MIN(loudness),3) AS `min`, ROUND(MAX(loudness),3) AS `max` " +
                "FROM ranked GROUP BY release_year HAVING MAX(cnt) >= 20 ORDER BY release_year";
        return jdbc.queryForList(sql);
    }

    /** 按年代汇总，用于对照能量 */
    private List<Map<String, Object>> loudnessByDecade() {
        return jdbc.queryForList(
                "SELECT decade, COUNT(*) AS `count`, " +
                        "       ROUND(AVG(loudness),3)     AS `avgLoudness`, " +
                        "       ROUND(AVG(energy),3)       AS `avgEnergy`, " +
                        "       ROUND(AVG(duration_min),3) AS `avgDuration` " +
                        "FROM " + TABLE + " GROUP BY decade ORDER BY decade");
    }

    public Map<String, Object> loudnessWar() {
        List<Map<String, Object>> byYear = loudnessByYear();
        List<Map<String, Object>> byDecade = loudnessByDecade();

        Map<String, Object> first = null, peak = null, last = null;
        for (Map<String, Object> r : byYear) {
            if (num(r.get("count")) < MIN_SAMPLE) {
                continue;
            }
            if (first == null) {
                first = r;
            }
            last = r;
            if (peak == null || num(r.get("mean")) > num(peak.get("mean"))) {
                peak = r;
            }
        }

        Map<String, Object> summary = new LinkedHashMap<>();
        if (first != null && peak != null) {
            double sm = num(first.get("mean"));
            double pm = num(peak.get("mean"));
            summary.put("startYear", first.get("year"));
            summary.put("startMean", first.get("mean"));
            summary.put("peakYear", peak.get("year"));
            summary.put("peakMean", peak.get("mean"));
            summary.put("latestYear", last == null ? null : last.get("year"));
            summary.put("latestMean", last == null ? null : last.get("mean"));
            summary.put("gainDb", round(pm - sm, 1));
            summary.put("gainPct", round((pm - sm) / Math.abs(sm) * 100, 1));
        }

        Map<String, Object> data = new LinkedHashMap<>();
        data.put("year", byYear);
        data.put("decade", byDecade);
        data.put("summary", summary);
        return data;
    }

    /* ================================================================
     *  3. BPM 年代分布  GET /api/time/bpm-distribution
     * ================================================================ */

    /** 年代 × 5BPM 分箱频数，前端据此做高斯平滑并绘制小提琴 */
    private List<Map<String, Object>> bpmHist() {
        return jdbc.queryForList(
                "SELECT decade, FLOOR(tempo/5)*5 AS `bin`, COUNT(*) AS `cnt` " +
                        "FROM " + TABLE + " WHERE tempo BETWEEN 40 AND 220 " +
                        "GROUP BY decade, `bin` ORDER BY decade, `bin`");
    }

    /** 各年代 BPM 的四分位、120BPM 命中率、140+ 快歌占比 */
    private List<Map<String, Object>> bpmByDecade() {
        String sql =
                "WITH ranked AS ( " +
                "  SELECT decade, tempo, " +
                "         ROW_NUMBER() OVER (PARTITION BY decade ORDER BY tempo) AS rn, " +
                "         COUNT(*)     OVER (PARTITION BY decade)                AS cnt " +
                "  FROM " + TABLE +
                ") " +
                "SELECT decade, MAX(cnt) AS `count`, " +
                "       ROUND(MAX(CASE WHEN rn = CEIL(cnt*0.25) THEN tempo END),2) AS `q1`, " +
                "       ROUND(MAX(CASE WHEN rn = CEIL(cnt*0.50) THEN tempo END),2) AS `median`, " +
                "       ROUND(MAX(CASE WHEN rn = CEIL(cnt*0.75) THEN tempo END),2) AS `q3`, " +
                "       ROUND(AVG(tempo),2) AS `mean`, " +
                "       ROUND(SUM(CASE WHEN tempo BETWEEN 115 AND 125 THEN 1 ELSE 0 END)/COUNT(*)*100,2) AS `share120`, " +
                "       ROUND(SUM(CASE WHEN tempo >= 140 THEN 1 ELSE 0 END)/COUNT(*)*100,2)              AS `shareFast` " +
                "FROM ranked GROUP BY decade ORDER BY decade";
        return jdbc.queryForList(sql);
    }

    public Map<String, Object> bpmDistribution() {
        List<Map<String, Object>> hist = bpmHist();
        List<Map<String, Object>> byDecade = bpmByDecade();

        Map<String, Object> slow = null, fast = null, last = null;
        for (Map<String, Object> r : byDecade) {
            if (num(r.get("count")) < MIN_SAMPLE) {
                continue;
            }
            if (slow == null || num(r.get("median")) < num(slow.get("median"))) {
                slow = r;
            }
            if (fast == null || num(r.get("median")) > num(fast.get("median"))) {
                fast = r;
            }
            last = r;
        }

        Map<String, Object> summary = new LinkedHashMap<>();
        if (slow != null && fast != null && last != null) {
            summary.put("slowestDecade", slow.get("decade"));
            summary.put("slowestMedian", slow.get("median"));
            summary.put("fastestDecade", fast.get("decade"));
            summary.put("fastestMedian", fast.get("median"));
            summary.put("latestDecade", last.get("decade"));
            summary.put("latestMedian", last.get("median"));
            summary.put("latestShare120", last.get("share120"));
            summary.put("range", round(num(fast.get("median")) - num(slow.get("median")), 1));
        }

        Map<String, Object> data = new LinkedHashMap<>();
        data.put("hist", hist);
        data.put("decade", byDecade);
        data.put("refBpm", 120);
        data.put("binWidth", 5);
        data.put("summary", summary);
        return data;
    }

    /* ================================================================
     *  4. 时长/响度 与 流行度  GET /api/time/popularity-scatter
     * ================================================================ */

    /** 按 CRC32(track_id) 取模抽样约 1/13，结果可复现且分布均匀（约 2,100 首） */
    public List<Map<String, Object>> scatterPoints() {
        return jdbc.queryForList(
                "SELECT duration_min AS `duration`, loudness AS `loudness`, " +
                        "       track_popularity AS `popularity`, playlist_genre AS `genre`, " +
                        "       release_year AS `year` " +
                        "FROM " + TABLE + " WHERE MOD(CRC32(track_id), 13) = 0");
    }

    /** 时长 × 响度 四象限的流行度对比，回答“短且响是否更受欢迎” */
    public List<Map<String, Object>> quadrant() {
        String sql =
                "SELECT CASE WHEN duration_min < 3.5 THEN 'short' ELSE 'long'  END AS `durBand`, " +
                "       CASE WHEN loudness   >= -6  THEN 'loud'  ELSE 'quiet' END AS `loudBand`, " +
                "       COUNT(*) AS `cnt`, ROUND(AVG(track_popularity),1) AS `avgPop`, " +
                "       ROUND(AVG(duration_min),2) AS `avgDuration`, ROUND(AVG(loudness),2) AS `avgLoudness` " +
                "FROM " + TABLE + " GROUP BY `durBand`, `loudBand` ORDER BY `durBand`, `loudBand`";
        return jdbc.queryForList(sql);
    }

    public Map<String, Object> popularityScatter() {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("points", scatterPoints());
        data.put("quadrant", quadrant());
        data.put("correlation", correlation());
        return data;
    }

    /* ================================================================
     *  6. 曲风 × 年代 响度矩阵  GET /api/time/genre-decade
     *     —— 大屏核心图的数据源
     * ================================================================ */

    /**
     * 曲风 × 十年 的平均响度。
     *
     * 为什么要这张表：全局看响度从 −10 dB 抬到 −6 dB，但“谁在推响、谁没参战”
     * 只能靠二维分组才看得出来。这是全模块唯一同时具备“时间对比 + 横向对比”的图。
     *
     * HAVING COUNT(*) >= 30：一个 (曲风, 年代) 格子只有十几首歌时，
     * 均值会被单曲的极端值带飞，这种格子宁可留空也不画。
     */
    public List<Map<String, Object>> genreDecade() {
        String sql =
                "SELECT playlist_genre AS `genre`, decade AS `decade`, COUNT(*) AS `cnt`, " +
                "       ROUND(AVG(loudness),2)         AS `avgLoudness`, " +
                "       ROUND(AVG(energy),3)           AS `avgEnergy`, " +
                "       ROUND(AVG(duration_min),2)     AS `avgDuration`, " +
                "       ROUND(AVG(tempo),1)            AS `avgTempo`, " +
                "       ROUND(AVG(track_popularity),1) AS `avgPopularity` " +
                "FROM " + TABLE + " GROUP BY playlist_genre, decade " +
                "HAVING COUNT(*) >= 30 ORDER BY playlist_genre, decade";
        return jdbc.queryForList(sql);
    }

    /**
     * 矩阵 + 基线一起返回。decade 这一份是“不分曲风”的全体均值，
     * 前端拿它做矩阵最下面那行对照，保证“总体在变响”和“分曲风在分化”能同屏出现。
     *
     * 注意：loudnessByDecade() 本身不过滤样本量，1950s 只有 3 首歌却算出 −5.85 dB，
     * 放进矩阵会变成最亮的一格，把结论带偏。所以这里按 MIN_SAMPLE 再筛一道。
     * 阈值用 30 而不是 MIN_SAMPLE(100)：矩阵要的是“每格可比”，
     * 100 首的门槛会把 1960s 这种早期年代整列砍掉。
     */
    public Map<String, Object> genreDecadeBundle() {
        List<Map<String, Object>> base = new ArrayList<>();
        for (Map<String, Object> r : loudnessByDecade()) {
            if (num(r.get("count")) >= 30) {
                base.add(r);
            }
        }

        Map<String, Object> data = new LinkedHashMap<>();
        data.put("cell", genreDecade());
        data.put("decade", base);
        data.put("minCell", 30);
        return data;
    }

    /* ================================================================
     *  5. 概览  GET /api/time/overview
     * ================================================================ */

    public Map<String, Object> overviewData() {
        String sql =
                "SELECT COUNT(*) AS `totalTracks`, COUNT(DISTINCT track_artist) AS `artists`, " +
                "       COUNT(DISTINCT playlist_genre) AS `genres`, " +
                "       ROUND(AVG(duration_min),2) AS `avgDuration`, " +
                "       ROUND(AVG(loudness),2)     AS `avgLoudness`, " +
                "       ROUND(AVG(tempo),1)        AS `avgTempo`, " +
                "       ROUND(AVG(track_popularity),1) AS `avgPopularity`, " +
                "       ROUND(SUM(is_short)/COUNT(*)*100,1) AS `shortPct`, " +
                "       ROUND(SUM(is_long)/COUNT(*)*100,1)  AS `longPct`, " +
                "       MIN(release_year) AS `minYear`, MAX(release_year) AS `maxYear` " +
                "FROM " + TABLE;
        List<Map<String, Object>> list = jdbc.queryForList(sql);
        return list.isEmpty() ? new HashMap<String, Object>() : list.get(0);
    }

    /** 皮尔逊相关系数：MySQL 没有 CORR()，用协方差公式展开 */
    public Map<String, Object> correlation() {
        String sql =
                "SELECT ROUND((AVG(duration_min*track_popularity) - AVG(duration_min)*AVG(track_popularity)) " +
                "             / (STDDEV_POP(duration_min)*STDDEV_POP(track_popularity)), 4) AS `corrDurationPop`, " +
                "       ROUND((AVG(loudness*track_popularity) - AVG(loudness)*AVG(track_popularity)) " +
                "             / (STDDEV_POP(loudness)*STDDEV_POP(track_popularity)), 4)     AS `corrLoudnessPop`, " +
                "       ROUND((AVG(tempo*track_popularity) - AVG(tempo)*AVG(track_popularity)) " +
                "             / (STDDEV_POP(tempo)*STDDEV_POP(track_popularity)), 4)        AS `corrTempoPop`, " +
                "       ROUND((AVG(duration_min*loudness) - AVG(duration_min)*AVG(loudness)) " +
                "             / (STDDEV_POP(duration_min)*STDDEV_POP(loudness)), 4)         AS `corrDurationLoudness` " +
                "FROM " + TABLE;
        List<Map<String, Object>> list = jdbc.queryForList(sql);
        return list.isEmpty() ? new HashMap<String, Object>() : list.get(0);
    }

    /** 曲风画像：平均时长 / 响度 / BPM / 流行度 */
    public List<Map<String, Object>> genreProfile() {
        return jdbc.queryForList(
                "SELECT playlist_genre AS `genre`, COUNT(*) AS `cnt`, " +
                        "       ROUND(AVG(duration_min),2)     AS `avgDuration`, " +
                        "       ROUND(AVG(loudness),2)         AS `avgLoudness`, " +
                        "       ROUND(AVG(tempo),1)            AS `avgTempo`, " +
                        "       ROUND(AVG(track_popularity),1) AS `avgPopularity`, " +
                        "       ROUND(AVG(energy),3)           AS `avgEnergy` " +
                        "FROM " + TABLE + " GROUP BY playlist_genre ORDER BY cnt DESC");
    }

    public Map<String, Object> overview() {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("overview", overviewData());
        data.put("genre", genreProfile());
        data.put("correlation", correlation());
        return data;
    }

    /* ================================================================
     *  工具
     * ================================================================ */

    private static double num(Object v) {
        if (v == null) {
            return 0d;
        }
        if (v instanceof Number) {
            return ((Number) v).doubleValue();
        }
        try {
            return Double.parseDouble(v.toString());
        } catch (NumberFormatException e) {
            return 0d;
        }
    }

    private static double round(double v, int scale) {
        return BigDecimal.valueOf(v).setScale(scale, RoundingMode.HALF_UP).doubleValue();
    }
}
