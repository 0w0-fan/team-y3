package com.fan.spotify.mapper;

import com.fan.spotify.entity.ArtistFavorite;
import org.apache.ibatis.annotations.Delete;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Options;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

import java.util.List;

/**
 * 关注歌手表 artist_favorite 的增删改查。
 */
@Mapper
public interface FavoriteMapper {

    @Select("SELECT id, artist_name, note, created_at FROM artist_favorite ORDER BY created_at DESC, id DESC")
    List<ArtistFavorite> findAll();

    @Select("SELECT id, artist_name, note, created_at FROM artist_favorite WHERE id = #{id}")
    ArtistFavorite findById(@Param("id") Long id);

    @Select("SELECT COUNT(*) FROM artist_favorite WHERE artist_name = #{artistName}")
    int countByArtist(@Param("artistName") String artistName);

    @Select("SELECT COUNT(*) FROM artist_favorite")
    long count();

    @Insert("INSERT INTO artist_favorite (artist_name, note) VALUES (#{artistName}, #{note})")
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insert(ArtistFavorite favorite);

    @Update("UPDATE artist_favorite SET artist_name = #{artistName}, note = #{note} WHERE id = #{id}")
    int update(ArtistFavorite favorite);

    @Delete("DELETE FROM artist_favorite WHERE id = #{id}")
    int delete(@Param("id") Long id);
}
