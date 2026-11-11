package new_com.spotify2.controller2;

import new_com.spotify2.common2.Result2;
import new_com.spotify2.service2.StatsService2;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * 方向六接口层
 *   GET /api/time/duration-evolution   时长演化（五年分组箱线图 + 逐年中位数）
 *   GET /api/time/loudness-war         响度战争（逐年均值 / P10-P90 / 极值）
 *   GET /api/time/bpm-distribution     BPM 年代分布（分箱频数 + 四分位）
 *   GET /api/time/popularity-scatter   时长·响度 × 流行度 散点
 *   GET /api/time/overview             KPI / 曲风画像 / 相关系数
 */
@RestController("timeStatsController")
@RequestMapping("/api/time")
public class StatsController2 {

    @Autowired
    private StatsService2 stats;

    @GetMapping("/duration-evolution")
    public Result2<Map<String, Object>> durationEvolution() {
        return Result2.ok(stats.durationEvolution());
    }

    @GetMapping("/loudness-war")
    public Result2<Map<String, Object>> loudnessWar() {
        return Result2.ok(stats.loudnessWar());
    }

    @GetMapping("/bpm-distribution")
    public Result2<Map<String, Object>> bpmDistribution() {
        return Result2.ok(stats.bpmDistribution());
    }

    @GetMapping("/popularity-scatter")
    public Result2<Map<String, Object>> popularityScatter() {
        return Result2.ok(stats.popularityScatter());
    }

    @GetMapping("/overview")
    public Result2<Map<String, Object>> overview() {
        return Result2.ok(stats.overview());
    }

    /**
     * 曲风 × 年代 响度矩阵（大屏核心图）
     * 每格 = 该曲风在该十年的平均响度；另附全体基线，用于上下对照。
     */
    @GetMapping("/genre-decade")
    public Result2<Map<String, Object>> genreDecade() {
        return Result2.ok(stats.genreDecadeBundle());
    }
}
