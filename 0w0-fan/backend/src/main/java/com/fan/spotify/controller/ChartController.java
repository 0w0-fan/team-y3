package com.fan.spotify.controller;

import com.fan.spotify.dto.AlbumBin;
import com.fan.spotify.dto.ArtistSpan;
import com.fan.spotify.dto.ArtistTop;
import com.fan.spotify.dto.BinCount;
import com.fan.spotify.dto.Overview;
import com.fan.spotify.service.ChartService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

/**
 * 图表数据接口（8 个只读接口）。
 *
 * <p>全部读同一个视图 {@code artist_track_view}（28,356 行，已在库内按 track_id 去重），
 * 口径写死在 {@link ChartService}，Controller 只做参数兜底与转发，不含业务逻辑。
 *
 * <p>对应页面上 7 个图表容器（见 index.html 的 chart-* 元素）：
 * <ul>
 *   <li>{@code chart-custom} —— 可配置图表，复用页面 5 个维度的数据接口，无独立接口</li>
 *   <li>{@code chart-trend}  —— 图 7 逐年趋势</li>
 *   <li>{@code chart-dist}   —— 图 2 作品数长尾分布</li>
 *   <li>{@code chart-top}    —— 图 3 平均热度 TOP N</li>
 *   <li>{@code chart-album}  —— 图 4 专辑曲目数分箱</li>
 *   <li>{@code chart-scatter}—— 图 1 四象限散点（主视觉）</li>
 *   <li>{@code chart-span}   —— 图 5 活跃年份跨度</li>
 * </ul>
 * 图 6（热度×时长全量散点）的接口保留但页面已不渲染，见 {@link #songScatter()} 注释。
 */
@RestController
@RequestMapping("/api")
public class ChartController {

    private final ChartService chartService;

    public ChartController(ChartService chartService) {
        this.chartService = chartService;
    }

    /**
     * 顶部概览接口。
     * GET /api/overview
     * @return 记录数/歌曲数/歌手数/专辑数/平均热度/关注数/标签数
     */
    @GetMapping("/overview")
    public Overview overview() {
        return chartService.overview();
    }

    /**
     * 图 1 四象限散点（主视觉）。
     * GET /api/artist/quadrant
     * @return {"points":[...], "count":2486, "medianWorks":5, "globalAvgPop":42.48}
     */
    @GetMapping("/artist/quadrant")
    public Map<String, Object> quadrant() {
        return chartService.quadrant();
    }

    /**
     * 图 2 歌手作品数长尾分布。
     * GET /api/artist/distribution
     * @return 固定 8 个分箱，每箱的歌手数
     */
    @GetMapping("/artist/distribution")
    public List<BinCount> distribution() {
        return chartService.artistDistribution();
    }

    /**
     * 图 3 平均热度 TOP N。
     * GET /api/artist/top?limit=20
     * @param limit 榜单长度，默认 20
     * @return 带 rank 的榜单
     */
    @GetMapping("/artist/top")
    public List<ArtistTop> top(@RequestParam(name = "limit", defaultValue = "20") int limit) {
        return chartService.topArtists(limit);
    }

    /**
     * 图 4 专辑曲目数分箱。
     * GET /api/album/bins
     * @return 最多 4 个分箱（2 / 3-4 / 5-9 / 10+）
     */
    @GetMapping("/album/bins")
    public List<AlbumBin> albumBins() {
        return chartService.albumBins();
    }

    /**
     * 图 5 歌手活跃年份跨度 TOP N。
     *
     * <p>页面容器 {@code #chart-span}。x 轴是 [minYear, maxYear] 区间条，
     * 只有作品数 ≥ 3 且两个年份都非空的歌手才进榜。
     *
     * @param limit 榜单长度，默认 20（上限 100，见 ChartService#normalizeLimit）
     */
    @GetMapping("/artist/span")
    public List<ArtistSpan> span(@RequestParam(name = "limit", defaultValue = "20") int limit) {
        return chartService.topSpans(limit);
    }

    /**
     * 图 7 逐年歌曲数 x 平均热度（v2 新增，非课程原要求）。
     *
     * <p>页面容器 {@code #chart-trend}。默认区间 1957–2019：
     * 2020 年只有 785 行，是数据抓取时点的截断，放进来会让趋势线断崖式下跌。
     *
     * @param from 起始年份，可空（默认 1957；小于 1900 按 1957 处理）
     * @param to   结束年份，可空（默认 2019；大于 2100 按 2019 处理）
     */
    @GetMapping("/year/trend")
    public Map<String, Object> yearTrend(@RequestParam(name = "from", required = false) Integer from,
                                         @RequestParam(name = "to", required = false) Integer to) {
        return chartService.yearTrend(from, to);
    }

    /**
     * 图 6 热度 x 时长全量散点。
     *
     * <p>页面容器 {@code #chart-scatter}。一次返回 28,356 个点（JSON 约 502 KB，实测 0.13 秒），
     * 前端用 ECharts 的 large + progressive 渲染，否则 2.8 万个点会拖卡。
     *
     * <p>注意：这是课程原要求的第 6 张图，与「图 7 逐年趋势」（v2 新增）不是同一张。
     *
     * @return {"total":28356, "points":[...]}
     */
    @GetMapping("/song/scatter")
    public Map<String, Object> scatter() {
        return chartService.popularityDuration();
    }
}
