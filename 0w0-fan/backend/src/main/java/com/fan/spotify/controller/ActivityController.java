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

    @GetMapping("/recent")
    public List<ActivityItem> recent(@RequestParam(name = "limit", defaultValue = "20") int limit) {
        return activityService.recent(limit);
    }
}
