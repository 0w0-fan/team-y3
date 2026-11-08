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

    /**
     * 查最新的 N 条标签（跨歌曲），接口不带 trackId 时走这里。
     * @param limit 条数上限
     */
    @Select("SELECT id, track_id, tag_name, created_at FROM song_tag ORDER BY created_at DESC, id DESC LIMIT #{limit}")
    List<SongTag> findLatest(@Param("limit") int limit);

    /**
     * 按主键回读：新增接口返回给前端的是数据库里的真实行（含 created_at）。
     * @param id 标签主键
     */
    @Select("SELECT id, track_id, tag_name, created_at FROM song_tag WHERE id = #{id}")
    SongTag findById(@Param("id") Long id);

    /**
     * 查某首歌的全部标签，按时间倒序。
     * @param trackId 歌曲 ID（Spotify 的 base62 字符串）
     */
    @Select("SELECT id, track_id, tag_name, created_at FROM song_tag WHERE track_id = #{trackId} "
            + "ORDER BY created_at DESC, id DESC")
    List<SongTag> findByTrackId(@Param("trackId") String trackId);

    /**
     * 判断「同一首歌 + 同一标签」是否已存在。表上有 uk_track_tag 唯一索引，
     * 这里先查是为了给前端 409 的可读提示。
     * @param trackId 歌曲 ID
     * @param tagName 标签名
     */
    @Select("SELECT COUNT(*) FROM song_tag WHERE track_id = #{trackId} AND tag_name = #{tagName}")
    int countByTrackAndTag(@Param("trackId") String trackId, @Param("tagName") String tagName);

    /**
     * 某首歌的标签数。
     * @param trackId 歌曲 ID
     */
    @Select("SELECT COUNT(*) FROM song_tag WHERE track_id = #{trackId}")
    long countByTrackId(@Param("trackId") String trackId);

    /**
     * 标签总数，供顶部 KPI 使用。
     */
    @Select("SELECT COUNT(*) FROM song_tag")
    long count();

    /**
     * 新增标签，自增主键回填到入参对象。
     */
    @Insert("INSERT INTO song_tag (track_id, tag_name) VALUES (#{trackId}, #{tagName})")
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insert(SongTag tag);

    /**
     * 按主键删除标签。
     * @param id 标签主键
     */
    @Delete("DELETE FROM song_tag WHERE id = #{id}")
    int delete(@Param("id") Long id);
}
