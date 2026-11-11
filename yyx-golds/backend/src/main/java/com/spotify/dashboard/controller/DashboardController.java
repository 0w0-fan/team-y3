package com.spotify.dashboard.controller;

import com.spotify.dashboard.dto.BinResponse;
import com.spotify.dashboard.dto.RadarResponse;
import com.spotify.dashboard.dto.SankeyResponse;
import com.spotify.dashboard.dto.SubGenreRankResponse;
import com.spotify.dashboard.dto.SummaryResponse;
import com.spotify.dashboard.dto.TrendResponse;
import com.spotify.dashboard.service.DashboardService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 图表数据接口，都是 GET，不带参数也能用（trend 默认 1990-2019，rank 默认 15）。
 */
@RestController
@RequestMapping("/api")
public class DashboardController {

    private final DashboardService dashboardService;

    public DashboardController(DashboardService dashboardService) {
        this.dashboardService = dashboardService;
    }

    // 调试用，能返回行数就说明 MySQL 通了
    @GetMapping("/ping")
    public Map<String, Object> ping() {
        Map<String, Object> body = new LinkedHashMap<String, Object>();
        body.put("status", "ok");
        body.put("count", dashboardService.totalSongs());
        body.put("service", "spotify-genre-dashboard");
        return body;
    }

    @GetMapping("/genre/summary")
    public SummaryResponse summary() {
        return dashboardService.summary();
    }

    // from/to 收口在 service 里做，这里只负责传
    @GetMapping("/genre/trend")
    public TrendResponse trend(@RequestParam(value = "from", defaultValue = "1990") int from,
                               @RequestParam(value = "to", defaultValue = "2019") int to) {
        return dashboardService.trend(from, to);
    }

    @GetMapping("/subgenre/rank")
    public SubGenreRankResponse subGenreRank(@RequestParam(value = "top", defaultValue = "15") int top) {
        return dashboardService.subGenreRank(top);
    }

    @GetMapping("/genre/radar")
    public RadarResponse radar() {
        return dashboardService.radar();
    }

    @GetMapping("/genre/bin")
    public BinResponse bin() {
        return dashboardService.bin();
    }

    // 桑基目前没在页面上用，接口先留着
    @GetMapping("/genre/sankey")
    public SankeyResponse sankey() {
        return dashboardService.sankey();
    }
}
