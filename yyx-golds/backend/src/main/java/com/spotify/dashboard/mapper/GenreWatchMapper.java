package com.spotify.dashboard.mapper;

import com.spotify.dashboard.entity.GenreWatch;
import org.apache.ibatis.annotations.Delete;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Options;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

import java.util.List;

/**
 * genre_watch 的增删改查（大屏「关注列表」面板使用）。
 */
public interface GenreWatchMapper {

    @Select("SELECT id, genre, watch_level, note, " +
            "DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS createdAt, " +
            "DATE_FORMAT(updated_at, '%Y-%m-%d %H:%i:%s') AS updatedAt " +
            "FROM genre_watch ORDER BY watch_level DESC, id DESC")
    List<GenreWatch> selectAll();

    @Select("SELECT id, genre, watch_level, note, " +
            "DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS createdAt, " +
            "DATE_FORMAT(updated_at, '%Y-%m-%d %H:%i:%s') AS updatedAt " +
            "FROM genre_watch WHERE id = #{id}")
    GenreWatch selectById(@Param("id") int id);

    @Insert("INSERT INTO genre_watch (genre, watch_level, note, created_at, updated_at) " +
            "VALUES (#{genre}, #{watchLevel}, #{note}, NOW(), NOW())")
    @Options(useGeneratedKeys = true, keyProperty = "id", keyColumn = "id")
    int insert(GenreWatch item);

    @Update("UPDATE genre_watch SET genre = #{genre}, watch_level = #{watchLevel}, note = #{note}, " +
            "updated_at = NOW() WHERE id = #{id}")
    int update(GenreWatch item);

    @Delete("DELETE FROM genre_watch WHERE id = #{id}")
    int deleteById(@Param("id") int id);
}
