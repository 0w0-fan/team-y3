package com.fan.spotify.service;

import com.fan.spotify.dto.AlbumBin;
import com.fan.spotify.dto.ArtistPoint;
import com.fan.spotify.dto.ArtistSpan;
import com.fan.spotify.dto.ArtistTop;
import com.fan.spotify.dto.BinCount;
import com.fan.spotify.dto.Overview;
import com.fan.spotify.dto.SongPoint;
import com.fan.spotify.dto.YearPoint;
import com.fan.spotify.mapper.FavoriteMapper;
import com.fan.spotify.mapper.SongMapper;
import com.fan.spotify.mapper.TagMapper;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 图表取数逻辑 —— 页面上 7 个图表（含 1 个可配置）的全部口径都在这里。
 *
 * <p>Controller 只做转发，DTO 只做载体，**所有业务口径集中在本类**，
 * 这样答辩时"某个数字是怎么算的"只需看这一个文件。
 *
 * <p>数据源统一为视图 {@code artist_track_view}（28,356 行）：
 * 已在库内按 {@code track_id} 去重，因此本类的 SQL 不必再写 DISTINCT。
 *
 * <p>图号与前端、Mapper 三处保持一致（图 1~7，其中图 7 为 v2 新增）：
 * <ol>
 *   <li>图 1 四象限散点 —— 产量 × 热度（主视觉）</li>
 *   <li>图 2 歌手作品数 8 分箱 —— 长尾分布</li>
 *   <li>图 3 平均热度 TOP N —— 口碑榜</li>
 *   <li>图 4 专辑曲目数 4 分箱 —— 专辑厚度 vs 热度</li>
 *   <li>图 5 歌手活跃年份跨度 TOP N</li>
 *   <li>图 6 热度 × 时长全量散点（28,356 点）</li>
 *   <li>图 7 逐年歌曲数 × 平均热度（v2 新增）</li>
 * </ol>
 *
 * <p>口径细节见 {@code docs/项目总览与代码导览.md} 与 README「指标口径」一节。
 */
@Service
public class ChartService {

    /** 图 2 的分箱顺序 */
    private static final List<String> ARTIST_BIN_ORDER =
            Arrays.asList("1", "2", "3", "4", "5", "6-10", "11-20", "21+");

    /** 图 4 的分箱顺序 */
    private static final List<String> ALBUM_BIN_ORDER =
            Arrays.asList("2", "3-4", "5-9", "10+");

    private final SongMapper songMapper;
    private final FavoriteMapper favoriteMapper;
    private final TagMapper tagMapper;

    public ChartService(SongMapper songMapper, FavoriteMapper favoriteMapper, TagMapper tagMapper) {
        this.songMapper = songMapper;
        this.favoriteMapper = favoriteMapper;
        this.tagMapper = tagMapper;
    }

    /** 顶部概览指标 */
    public Overview overview() {
        Overview o = new Overview();
        o.rows = songMapper.countRows();
        o.songs = songMapper.countSongs();
        o.artists = songMapper.countArtists();
        o.albums = songMapper.countAlbums();
        o.avgPopularity = songMapper.avgPopularity();
        o.avgPopularityDedup = songMapper.avgPopularityDedup();
        o.favorites = favoriteMapper.count();
        o.tags = tagMapper.count();
        return o;
    }

    /**
     * 图 1：四象限散点（主视觉）。
     *
     * <p>x = 作品数（产量），y = 平均热度（热度）；气泡大小 = 专辑数或平均时长（前端可切换）。
     *
     * <p>三个口径决定这张图长什么样：
     * <ul>
     *   <li><b>筛作品数 ≥ 3</b>：只发过 1~2 首的歌手占绝大多数，热度的方差极大，
     *       放进四象限会让"精品区"混进大量噪声，所以门槛定在 3 首</li>
     *   <li><b>纵分割线 = x 中位数</b>（当前 5 首）：用中位数不用平均数，
     *       因为作品数分布极端右偏，平均数会被头部歌手拉高</li>
     *   <li><b>横分割线 = y 全局均值</b>（42.48）：与 KPI 卡片同源，保证图上和卡上一致</li>
     * </ul>
     *
     * @return points（每位歌手一行）+ count + medianWorks + globalAvgPop
     */
    public Map<String, Object> quadrant() {
        List<ArtistPoint> points = songMapper.selectQuadrant();

        List<Integer> works = new ArrayList<>(points.size());
        for (ArtistPoint p : points) {
            works.add(p.works);
        }
        Collections.sort(works);
        double medianWorks = works.isEmpty() ? 0 : median(works);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("points", points);
        result.put("count", points.size());
        result.put("medianWorks", medianWorks);
        result.put("globalAvgPop", songMapper.avgPopularity());
        return result;
    }

    /**
     * 求中位数：偶数个取中间两个的平均值，奇数个取正中间。
     * @param sorted 已升序排好的列表
     * @return 中位数；空列表返回 0
     */
    private static double median(List<Integer> sorted) {
        int n = sorted.size();
        if (n % 2 == 1) {
            return sorted.get(n / 2);
        }
        return (sorted.get(n / 2 - 1) + sorted.get(n / 2)) / 2.0;
    }

    /**
     * 图 2：歌手作品数长尾分布（8 个分箱，前端 y 轴取对数）。
     *
     * <p>分箱边界写死在 {@link #ARTIST_BIN_ORDER}，SQL 只负责统计、不负责排序，
     * 这里按固定顺序重排一遍并补 0 —— 否则某箱没人时前端会缺一根柱子。
     *
     * <p>为什么要取对数：1 首歌手 11,000+ 人、21+ 首歌手只有数百人，
     * 线性轴下长尾部分会被压成一条贴着 x 轴的线，看不见分布形状。
     */
    public List<BinCount> artistDistribution() {
        List<BinCount> raw = songMapper.selectArtistDistribution();
        List<BinCount> ordered = new ArrayList<>(ARTIST_BIN_ORDER.size());
        for (String bin : ARTIST_BIN_ORDER) {
            BinCount hit = null;
            for (BinCount b : raw) {
                if (bin.equals(b.bin)) {
                    hit = b;
                    break;
                }
            }
            ordered.add(hit == null ? new BinCount(bin, 0) : hit);
        }
        return ordered;
    }

    /**
     * 图 3：平均热度 TOP N（作品数 ≥ 3），带排名。
     *
     * <p>门槛同样是 3 首：只要发过 1 首满分歌就能进榜，榜单一文不值。
     *
     * <p>rank 在这里赋值而不是在 SQL 里用 ROW_NUMBER() —— 排名只是展示序号，
     * 放 Java 侧能少一层窗口函数，MySQL 5.7 也能跑。
     */
    public List<ArtistTop> topArtists(int limit) {
        List<ArtistTop> list = songMapper.selectTopArtists(normalizeLimit(limit, 20, 100));
        for (int i = 0; i < list.size(); i++) {
            list.get(i).rank = i + 1;
        }
        return list;
    }

    /**
     * 图 4：专辑曲目数分箱 → 专辑数 / 歌曲平均热度（4 个箱）。
     *
     * <p>热度口径是「该箱内<b>所有歌曲</b>的平均热度」，不是「各专辑平均热度的平均」——
     * 后者会让只有 2 首的专辑和 20 首的专辑等权，口径与图 1 不一致。
     *
     * <p>与图 2 的区别：图 2 缺箱时补 0（长尾分布必须看到"没人"的箱），
     * 图 4 缺箱时跳过（专辑厚度分布本身稀疏，补 0 会画出一根不存在的空柱）。
     */
    public List<AlbumBin> albumBins() {
        List<AlbumBin> raw = songMapper.selectAlbumBins();
        List<AlbumBin> ordered = new ArrayList<>(ALBUM_BIN_ORDER.size());
        for (String bin : ALBUM_BIN_ORDER) {
            AlbumBin hit = null;
            for (AlbumBin b : raw) {
                if (bin.equals(b.bin)) {
                    hit = b;
                    break;
                }
            }
            if (hit != null) {
                ordered.add(hit);
            }
        }
        return ordered;
    }

    /**
     * 图 5：歌手活跃年份跨度 TOP N（作品数 ≥ 3，minYear / maxYear 均非空）。
     *
     * <p>跨度 = maxYear - minYear。排的是跨度不是作品数，
     * 讲的是"这个歌手在行业里活了多久"，与图 3 的"口碑"、图 1 的"产量"互补。
     */
    public List<ArtistSpan> topSpans(int limit) {
        return songMapper.selectTopSpans(normalizeLimit(limit, 20, 100));
    }

    /**
     * 图 7：逐年歌曲数 × 平均热度（v2 新增）。
     * 默认区间 1957–2019：2020 年只有 785 行，是抓取时点截断，放进来会让趋势图断崖式下跌。
     */
    public Map<String, Object> yearTrend(Integer from, Integer to) {
        int start = (from == null || from < 1900) ? 1957 : from;
        int end = (to == null || to > 2100) ? 2019 : to;
        if (start > end) {
            int tmp = start;
            start = end;
            end = tmp;
        }

        List<YearPoint> points = songMapper.selectYearTrend(start, end);

        int peakYear = 0;
        int peakSongs = 0;
        long totalSongs = 0;
        for (YearPoint p : points) {
            totalSongs += p.songs;
            if (p.songs > peakSongs) {
                peakSongs = p.songs;
                peakYear = p.year;
            }
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("points", points);
        result.put("from", start);
        result.put("to", end);
        result.put("years", points.size());
        result.put("totalSongs", totalSongs);
        result.put("peakYear", peakYear);
        result.put("peakSongs", peakSongs);
        result.put("latestYear", points.isEmpty() ? null : points.get(points.size() - 1).year);
        result.put("latestAvgPop", points.isEmpty() ? null : points.get(points.size() - 1).avgPop);
        return result;
    }

    /** 图 6：热度 × 时长 全量散点（28,356 点） */
    public Map<String, Object> popularityDuration() {
        List<SongPoint> points = songMapper.selectPopularityDuration();
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("total", points.size());
        result.put("points", points);
        return result;
    }

    /**
     * 兜住前端传来的 limit：非正数用默认值，超过上限就截断，避免一条 URL 把数据库拉爆。
     * @param limit 原始值
     * @param def   默认值
     * @param max   上限
     * @return 可安全使用的条数
     */
    private static int normalizeLimit(int limit, int def, int max) {
        if (limit <= 0) {
            return def;
        }
        return Math.min(limit, max);
    }
}
