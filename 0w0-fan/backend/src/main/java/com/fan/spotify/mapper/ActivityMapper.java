package com.fan.spotify.mapper;

import com.fan.spotify.dto.ActivityItem;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;

/**
 * 底部滚动流：把「关注歌手」和「歌曲打标签」两张表的最近动态合成一条时间线。
 */
@Mapper
public interface ActivityMapper {

    @Select("SELECT * FROM ("
            + "  SELECT 'favorite' AS type, artist_name AS title, COALESCE(note, '') AS detail, created_at AS time "
            + "  FROM artist_favorite "
            + "  UNION ALL "
            + "  SELECT 'tag' AS type, t.tag_name AS title, COALESCE(v.track_name, t.track_id) AS detail, t.created_at AS time "
            + "  FROM song_tag t LEFT JOIN artist_track_view v ON v.track_id = t.track_id "
            + ") a ORDER BY a.time DESC LIMIT #{limit}")
    List<ActivityItem> selectRecent(@Param("limit") int limit);
}
