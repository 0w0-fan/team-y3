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

    /** 顶部概览卡片 */
    @GetMapping("/overview")
    public Overview overview() {
        return chartService.overview();
    }

    /** 图 1：作品数 × 平均热度 四象限散点（2,486 个点） */
    @GetMapping("/artist/quadrant")
    public Map<String, Object> quadrant() {
        return chartService.quadrant();
    }

    /** 图 2：歌手作品数长尾分布（8 个分箱） */
    @GetMapping("/artist/distribution")
    public List<BinCount> distribution() {
        return chartService.artistDistribution();
    }

    /** 图 3：平均热度 TOP20 */
    @GetMapping("/artist/top")
    public List<ArtistTop> top(@RequestParam(name = "limit", defaultValue = "20") int limit) {
        return chartService.topArtists(limit);
    }

    /** 图 4：专辑曲目数 × 歌曲平均热度（4 个分箱） */
    @GetMapping("/album/bins")
    public List<AlbumBin> albumBins() {
        return chartService.albumBins();
    }

    /** 图 5：歌手活跃年份跨度 TOP20 */
    @GetMapping("/artist/span")
    public List<ArtistSpan> span(@RequestParam(name = "limit", defaultValue = "20") int limit) {
        return chartService.topSpans(limit);
    }

    /** 图 7：逐年歌曲数 × 平均热度（1957–2019，v2 新增） */
    @GetMapping("/year/trend")
    public Map<String, Object> yearTrend(@RequestParam(name = "from", required = false) Integer from,
                                         @RequestParam(name = "to", required = false) Integer to) {
        return chartService.yearTrend(from, to);
    }

    /** 图 6：热度 × 时长 全量散点（28,356 点） */
    @GetMapping("/song/scatter")
    public Map<String, Object> scatter() {
        return chartService.popularityDuration();
    }
}
