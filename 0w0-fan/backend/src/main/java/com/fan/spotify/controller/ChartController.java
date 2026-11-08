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
 * 六张图表的数据接口。全部读 artist_track_view，口径写死在 ChartService。
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
     * GET /api/artist/span?limit=20
     * @param limit 榜单长度，默认 20
     */
    @GetMapping("/artist/span")
    public List<ArtistSpan> span(@RequestParam(name = "limit", defaultValue = "20") int limit) {
        return chartService.topSpans(limit);
    }

    /**
     * 图 7 逐年歌曲数 x 平均热度（v2 新增）。
     * GET /api/year/trend?from=1957&to=2019
     * @param from 起始年份，可空（默认 1957）
     * @param to   结束年份，可空（默认 2019，见数据字典的 2020 年截断说明）
     */
    @GetMapping("/year/trend")
    public Map<String, Object> yearTrend(@RequestParam(name = "from", required = false) Integer from,
                                         @RequestParam(name = "to", required = false) Integer to) {
        return chartService.yearTrend(from, to);
    }

    /**
     * 图 6 热度 x 时长全量散点。
     * GET /api/song/scatter
     * @return {"total":28356, "points":[...]}
     */
    @GetMapping("/song/scatter")
    public Map<String, Object> scatter() {
        return chartService.popularityDuration();
    }
}
