package com.fan.spotify.mapper;

import com.fan.spotify.entity.SongTag;
import org.apache.ibatis.annotations.Delete;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Options;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;

/**
 * 歌曲标签表 song_tag 的增删改查。
 */
@Mapper
public interface TagMapper {

    @Select("SELECT id, track_id, tag_name, created_at FROM song_tag ORDER BY created_at DESC, id DESC LIMIT #{limit}")
    List<SongTag> findLatest(@Param("limit") int limit);

    @Select("SELECT id, track_id, tag_name, created_at FROM song_tag WHERE id = #{id}")
    SongTag findById(@Param("id") Long id);

    @Select("SELECT id, track_id, tag_name, created_at FROM song_tag WHERE track_id = #{trackId} "
            + "ORDER BY created_at DESC, id DESC")
    List<SongTag> findByTrackId(@Param("trackId") String trackId);

    @Select("SELECT COUNT(*) FROM song_tag WHERE track_id = #{trackId} AND tag_name = #{tagName}")
    int countByTrackAndTag(@Param("trackId") String trackId, @Param("tagName") String tagName);

    @Select("SELECT COUNT(*) FROM song_tag WHERE track_id = #{trackId}")
    long countByTrackId(@Param("trackId") String trackId);

    @Select("SELECT COUNT(*) FROM song_tag")
    long count();

    @Insert("INSERT INTO song_tag (track_id, tag_name) VALUES (#{trackId}, #{tagName})")
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insert(SongTag tag);

    @Delete("DELETE FROM song_tag WHERE id = #{id}")
    int delete(@Param("id") Long id);
}
