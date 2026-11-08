package com.fan.spotify.controller;

import com.fan.spotify.dto.ActivityItem;
import com.fan.spotify.service.ActivityService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * 底部滚动流接口。
 */
@RestController
@RequestMapping("/api/activity")
public class ActivityController {

    private final ActivityService activityService;

    public ActivityController(ActivityService activityService) {
        this.activityService = activityService;
    }

    /**
     * 最近动态时间线（关注 + 标签）。
     * GET /api/activity/recent?limit=20
     * 说明：v2 页面按需求移除了底部滚动流，这个接口保留下来备用。
     * @param limit 条数上限，默认 20
     */
    @GetMapping("/recent")
    public List<ActivityItem> recent(@RequestParam(name = "limit", defaultValue = "20") int limit) {
        return activityService.recent(limit);
    }
}
