package new_com.spotify2.service2;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.util.*;

/**
 * 方向六 · 曲目明细的增删改查（CRUD）
 *
 * 与 StatsService2 的分工：
 *   StatsService2  = 只读聚合（GROUP BY / 窗口函数），喂大屏的 6 张图；
 *   TrackService2  = 单条记录的写操作 + 明细分页查询，喂“数据管理”抽屉。
 *
 * 关键设计：派生列必须跟着源字段一起重算
 *   表里有 duration_sec / duration_ms / decade / era5 / is_short / is_long 六个派生列，
 *   它们是从 duration_min、release_year 推出来的。如果只写 duration_min 而不管这六个，
 *   大屏的五年分组箱线图、年代分布、短歌占比立刻会跟明细对不上。
 *   所以写入前统一走 derive()，一个入口算全，不给“写一半”留余地。
 */
@Service("trackCrudService")
public class TrackService2 {

    private static final String TABLE = "spotify_tracks";

    /** 一次最多返回多少条：防止前端传 size=100000 把 28,351 行拉进浏览器 */
    private static final int MAX_PAGE_SIZE = 100;

    @Autowired
    private JdbcTemplate jdbc;

    /* ================================================================
     *  查：分页 + 关键词 + 曲风 + 年份区间
     * ================================================================ */
    public Map<String, Object> list(int page, int size, String kw, String genre, Integer yearFrom, Integer yearTo) {
        page = Math.max(1, page);
        size = Math.min(Math.max(1, size), MAX_PAGE_SIZE);

        StringBuilder where = new StringBuilder(" WHERE 1=1 ");
        List<Object> args = new ArrayList<>();

        if (kw != null && !kw.trim().isEmpty()) {
            where.append(" AND (track_name LIKE ? OR track_artist LIKE ?) ");
            String like = "%" + kw.trim() + "%";
            args.add(like);
            args.add(like);
        }
        if (genre != null && !genre.trim().isEmpty()) {
            where.append(" AND playlist_genre = ? ");
            args.add(genre.trim());
        }
        if (yearFrom != null) {
            where.append(" AND release_year >= ? ");
            args.add(yearFrom);
        }
        if (yearTo != null) {
            where.append(" AND release_year <= ? ");
            args.add(yearTo);
        }

        Long total = jdbc.queryForObject("SELECT COUNT(*) FROM " + TABLE + where, Long.class, args.toArray());

        String sql = "SELECT track_id, track_name, track_artist, track_album_name, release_year, " +
                "       playlist_genre, playlist_subgenre, track_popularity, loudness, tempo, " +
                "       duration_min, is_short, is_long " +
                "FROM " + TABLE + where +
                " ORDER BY release_year DESC, track_name ASC LIMIT ? OFFSET ?";

        List<Object> pageArgs = new ArrayList<>(args);
        pageArgs.add(size);
        pageArgs.add((page - 1) * size);

        List<Map<String, Object>> rows = jdbc.queryForList(sql, pageArgs.toArray());

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("total", total == null ? 0 : total.intValue());
        out.put("page", page);
        out.put("size", size);
        out.put("pages", total == null ? 0 : (int) Math.ceil(total / (double) size));
        out.put("rows", rows);
        return out;
    }

    /** 查单条：点“编辑”时把完整字段回填到表单 */
    public Map<String, Object> get(String trackId) {
        List<Map<String, Object>> rows = jdbc.queryForList(
                "SELECT * FROM " + TABLE + " WHERE track_id = ?", trackId);
        if (rows.isEmpty()) {
            throw new IllegalArgumentException("曲目不存在：" + trackId);
        }
        return rows.get(0);
    }

    /* ================================================================
     *  增
     * ================================================================ */
    public Map<String, Object> create(Map<String, Object> body) {
        String id = str(body, "track_id");
        String name = str(body, "track_name");
        String artist = str(body, "track_artist");
        if (id.isEmpty()) { throw new IllegalArgumentException("track_id 不能为空"); }
        if (id.length() > 32) { throw new IllegalArgumentException("track_id 最长 32 字符"); }
        if (name.isEmpty()) { throw new IllegalArgumentException("曲名不能为空"); }
        if (artist.isEmpty()) { throw new IllegalArgumentException("艺人不能为空"); }

        Integer year = intOr(body, "release_year", 0);
        checkRange("发行年份", year, 1900, 2030);
        Double durationMin = dblOr(body, "duration_min", 0);
        checkRange("时长(分钟)", durationMin, 0.3, 15.0);
        Double loudness = dblOr(body, "loudness", 0);
        checkRange("响度(dBFS)", loudness, -60.0, 0.0);
        Double tempo = dblOr(body, "tempo", 0);
        checkRange("BPM", tempo, 0.0, 300.0);
        Integer popularity = intOr(body, "track_popularity", 0);
        checkRange("流行度", popularity, 0, 100);

        Map<String, Object> d = derive(durationMin, year);

        try {
            jdbc.update(
                    "INSERT INTO " + TABLE +
                            " (track_id, track_name, track_artist, track_album_name, release_date, release_precision," +
                            "  release_year, release_month, playlist_genre, playlist_subgenre, track_popularity," +
                            "  loudness, tempo, duration_ms, duration_sec, duration_min, decade, era5," +
                            "  is_short, is_long, danceability, energy, valence)" +
                            " VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                    id, name, artist,
                    nullable(body.get("track_album_name")),
                    year + "-01-01", "year", year, null,
                    nullable(body.get("playlist_genre")), nullable(body.get("playlist_subgenre")),
                    popularity, loudness, tempo,
                    d.get("duration_ms"), d.get("duration_sec"), durationMin,
                    d.get("decade"), d.get("era5"),
                    d.get("is_short"), d.get("is_long"),
                    body.get("danceability"), body.get("energy"), body.get("valence"));
        } catch (DuplicateKeyException e) {
            throw new IllegalArgumentException("track_id 已存在，换一个：" + id);
        }
        return get(id);
    }

    /* ================================================================
     *  改（track_id 是主键，不允许改；其余可改字段按“有则覆盖、无则保留”合并）
     * ================================================================ */
    public Map<String, Object> update(String trackId, Map<String, Object> body) {
        Map<String, Object> old = get(trackId);

        String name = body.containsKey("track_name") ? str(body, "track_name") : String.valueOf(old.get("track_name"));
        String artist = body.containsKey("track_artist") ? str(body, "track_artist") : String.valueOf(old.get("track_artist"));
        if (name.isEmpty()) { throw new IllegalArgumentException("曲名不能为空"); }
        if (artist.isEmpty()) { throw new IllegalArgumentException("艺人不能为空"); }

        Integer year = body.containsKey("release_year")
                ? intOr(body, "release_year", 0) : ((Number) old.get("release_year")).intValue();
        Double durationMin = body.containsKey("duration_min")
                ? dblOr(body, "duration_min", 0) : ((Number) old.get("duration_min")).doubleValue();
        Double loudness = body.containsKey("loudness")
                ? dblOr(body, "loudness", 0) : ((Number) old.get("loudness")).doubleValue();
        Double tempo = body.containsKey("tempo")
                ? dblOr(body, "tempo", 0) : ((Number) old.get("tempo")).doubleValue();
        Integer popularity = body.containsKey("track_popularity")
                ? intOr(body, "track_popularity", 0) : ((Number) old.get("track_popularity")).intValue();

        checkRange("发行年份", year, 1900, 2030);
        checkRange("时长(分钟)", durationMin, 0.3, 15.0);
        checkRange("响度(dBFS)", loudness, -60.0, 0.0);
        checkRange("BPM", tempo, 0.0, 300.0);
        checkRange("流行度", popularity, 0, 100);

        Map<String, Object> d = derive(durationMin, year);

        /* 这三个字段允许为 null，所以用 Object 接，不硬转 String */
        Object genre = body.containsKey("playlist_genre")
                ? nullable(body.get("playlist_genre")) : nullable(old.get("playlist_genre"));
        Object subgenre = body.containsKey("playlist_subgenre")
                ? nullable(body.get("playlist_subgenre")) : nullable(old.get("playlist_subgenre"));
        Object album = body.containsKey("track_album_name")
                ? nullable(body.get("track_album_name")) : nullable(old.get("track_album_name"));

        int n = jdbc.update(
                "UPDATE " + TABLE + " SET track_name=?, track_artist=?, track_album_name=?," +
                        " release_year=?, release_date=?, playlist_genre=?, playlist_subgenre=?," +
                        " track_popularity=?, loudness=?, tempo=?," +
                        " duration_ms=?, duration_sec=?, duration_min=?, decade=?, era5=?," +
                        " is_short=?, is_long=? WHERE track_id=?",
                name, artist, album,
                year, year + "-01-01", genre, subgenre,
                popularity, loudness, tempo,
                d.get("duration_ms"), d.get("duration_sec"), durationMin, d.get("decade"), d.get("era5"),
                d.get("is_short"), d.get("is_long"), trackId);

        if (n == 0) { throw new IllegalArgumentException("曲目不存在，无法更新：" + trackId); }
        return get(trackId);
    }

    /* ================================================================
     *  删
     * ================================================================ */
    public int delete(String trackId) {
        int n = jdbc.update("DELETE FROM " + TABLE + " WHERE track_id = ?", trackId);
        if (n == 0) { throw new IllegalArgumentException("曲目不存在，无法删除：" + trackId); }
        return n;
    }

    /* ================================================================
     *  派生列计算 —— 唯一入口
     * ================================================================ */
    private Map<String, Object> derive(double durationMin, int year) {
        double sec = Math.round(durationMin * 60 * 1000) / 1000.0;
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("duration_sec", round(sec, 3));
        m.put("duration_ms", (int) Math.round(sec * 1000));
        m.put("decade", (year / 10) * 10);
        /* era5 与清洗脚本口径一致：向下取到 5 的整倍数，格式 "2015-2019" */
        int start = (year / 5) * 5;
        m.put("era5", start + "-" + (start + 4));
        m.put("is_short", sec < 150 ? 1 : 0);
        m.put("is_long", sec > 300 ? 1 : 0);
        return m;
    }

    /* ------------------------------------------------------------ 工具 */
    private static double round(double v, int scale) {
        double p = Math.pow(10, scale);
        return Math.round(v * p) / p;
    }

    private static String str(Map<String, Object> m, String k) {
        Object v = m.get(k);
        return v == null ? "" : String.valueOf(v).trim();
    }

    private static Object nullable(Object v) {
        if (v == null) { return null; }
        String s = String.valueOf(v).trim();
        return s.isEmpty() ? null : s;
    }

    private static Integer intOr(Map<String, Object> m, String k, int def) {
        Object v = m.get(k);
        if (v == null || String.valueOf(v).trim().isEmpty()) { return def; }
        try {
            return (int) Math.round(Double.parseDouble(String.valueOf(v)));
        } catch (NumberFormatException e) {
            throw new IllegalArgumentException(k + " 必须是数字：" + v);
        }
    }

    private static Double dblOr(Map<String, Object> m, String k, double def) {
        Object v = m.get(k);
        if (v == null || String.valueOf(v).trim().isEmpty()) { return def; }
        try {
            return Double.parseDouble(String.valueOf(v));
        } catch (NumberFormatException e) {
            throw new IllegalArgumentException(k + " 必须是数字：" + v);
        }
    }

    private static void checkRange(String label, Number v, double lo, double hi) {
        if (v == null) { throw new IllegalArgumentException(label + " 不能为空"); }
        double d = v.doubleValue();
        if (d < lo || d > hi) {
            throw new IllegalArgumentException(label + " 超出合理范围 [" + lo + ", " + hi + "]：" + d);
        }
    }
}
