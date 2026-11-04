package com.fan.spotify.service;

import com.fan.spotify.dto.ActivityItem;
import com.fan.spotify.mapper.ActivityMapper;
import org.springframework.stereotype.Service;

import java.util.List;

/**
 * 底部滚动流的取数逻辑。
 */
@Service
public class ActivityService {

    private final ActivityMapper activityMapper;

    public ActivityService(ActivityMapper activityMapper) {
        this.activityMapper = activityMapper;
    }

    public List<ActivityItem> recent(int limit) {
        int size = limit <= 0 ? 20 : Math.min(limit, 50);
        return activityMapper.selectRecent(size);
    }
}
