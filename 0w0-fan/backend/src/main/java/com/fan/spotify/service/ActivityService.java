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

    /**
     * 取最近 N 条动态（关注 + 标签）。
     * @param limit 条数上限，默认 20，最多 50
     */
    public List<ActivityItem> recent(int limit) {
        int size = limit <= 0 ? 20 : Math.min(limit, 50);
        return activityMapper.selectRecent(size);
    }
}
