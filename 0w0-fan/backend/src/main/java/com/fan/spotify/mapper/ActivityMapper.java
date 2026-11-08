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

    /**
     * 把两张表的动态合成一条时间线：关注记录 + 标签记录，按时间倒序取前 N 条。
     * 标签那条通过 LEFT JOIN artist_track_view 把 track_id 换成歌名，便于阅读；
     * 万一 join 不到（例如歌曲被清理）就退回显示 track_id。
     * @param limit 条数上限
     */
    @Select("SELECT * FROM ("
            + "  SELECT 'favorite' AS type, artist_name AS title, COALESCE(note, '') AS detail, created_at AS time "
            + "  FROM artist_favorite "
            + "  UNION ALL "
            + "  SELECT 'tag' AS type, t.tag_name AS title, COALESCE(v.track_name, t.track_id) AS detail, t.created_at AS time "
            + "  FROM song_tag t LEFT JOIN artist_track_view v ON v.track_id = t.track_id "
            + ") a ORDER BY a.time DESC LIMIT #{limit}")
    List<ActivityItem> selectRecent(@Param("limit") int limit);
}
