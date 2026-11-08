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

    /**
     * 查全部关注记录，最新关注的排在最前（created_at 相同时按 id 倒序，保证顺序稳定）。
     */
    @Select("SELECT id, artist_name, note, in_dataset, created_at FROM artist_favorite ORDER BY created_at DESC, id DESC")
    List<ArtistFavorite> findAll();

    /**
     * 按主键查一条。新增/修改后用它回读，保证返回给前端的 createdAt 是数据库里的真实值。
     * @param id 关注记录主键
     */
    @Select("SELECT id, artist_name, note, in_dataset, created_at FROM artist_favorite WHERE id = #{id}")
    ArtistFavorite findById(@Param("id") Long id);

    /**
     * 统计某位歌手是否已被关注。表上 artist_name 建了唯一索引，这里先查一次是为了
     * 给前端返回 409 的可读提示，而不是把数据库的键冲突异常抛到页面上。
     * @param artistName 歌手名
     */
    @Select("SELECT COUNT(*) FROM artist_favorite WHERE artist_name = #{artistName}")
    int countByArtist(@Param("artistName") String artistName);

    /**
     * 关注记录总数，供顶部 KPI 使用。
     */
    @Select("SELECT COUNT(*) FROM artist_favorite")
    long count();

    /**
     * 新增一条关注记录。@Options(useGeneratedKeys) 会把自增主键回填到入参对象的 id 上，
     * 便于紧接着回读整条记录返回给前端。
     */
    @Insert("INSERT INTO artist_favorite (artist_name, note, in_dataset) VALUES (#{artistName}, #{note}, #{inDataset})")
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insert(ArtistFavorite favorite);

    /**
     * 整条更新（歌手名与备注一起写）。页面上的「改备注」只会传 note，artist_name 原样带回。
     */
    @Update("UPDATE artist_favorite SET artist_name = #{artistName}, note = #{note}, in_dataset = #{inDataset} WHERE id = #{id}")
    int update(ArtistFavorite favorite);

    /**
     * 按主键删除。
     * @param id 关注记录主键
     */
    @Delete("DELETE FROM artist_favorite WHERE id = #{id}")
    int delete(@Param("id") Long id);
}
