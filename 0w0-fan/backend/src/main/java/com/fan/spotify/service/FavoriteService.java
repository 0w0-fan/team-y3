package com.fan.spotify.service;

import com.fan.spotify.common.BizException;
import com.fan.spotify.entity.ArtistFavorite;
import com.fan.spotify.mapper.FavoriteMapper;
import com.fan.spotify.mapper.SongMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/**
 * 关注歌手：增删改查。
 */
@Service
public class FavoriteService {

    private final FavoriteMapper favoriteMapper;
    private final SongMapper songMapper;

    public FavoriteService(FavoriteMapper favoriteMapper, SongMapper songMapper) {
        this.favoriteMapper = favoriteMapper;
        this.songMapper = songMapper;
    }

    /**
     * 判断这位歌手在数据集里是否真实存在，写进 in_dataset 列。
     * 库里没有的歌手也允许关注（用户想记什么就记什么），只是页面上会标「库外」。
     * @param artistName 歌手名
     * @return 1 / 0
     */
    private boolean existsInDataset(String artistName) {
        return songMapper.countArtistInDataset(artistName) > 0;
    }

    /**
     * 查关注列表（最新关注的在前）。
     */
    public List<ArtistFavorite> list() {
        return favoriteMapper.findAll();
    }

    /**
     * 关注一位歌手：校验歌手名 -> 查重 -> 插入 -> 回读整行。
     * @param artistName 歌手名，不能为空、不能是字面量 NA
     * @param note       备注，可空
     * @return 数据库里的真实记录（含自增 id 与 created_at）
     * @throws com.fan.spotify.common.BizException 400 参数不合法 / 409 已经关注过
     */
    @Transactional
    public ArtistFavorite create(String artistName, String note) {
        String name = requireArtistName(artistName);
        if (favoriteMapper.countByArtist(name) > 0) {
            throw BizException.conflict("歌手「" + name + "」已经在关注列表里了");
        }
        ArtistFavorite f = new ArtistFavorite();
        f.setArtistName(name);
        f.setNote(trimNote(note));
        f.setInDataset(existsInDataset(name));   // 库里有没有这位歌手，落库时判断一次
        favoriteMapper.insert(f);
        return favoriteMapper.findById(f.getId());
    }

    /**
     * 改关注记录：支持只改备注（artistName 传空即保持原值）；改名字时同样要查重。
     * @param id         关注记录主键
     * @param artistName 新歌手名，可为 null
     * @param note       新备注，为 null 表示不动
     * @return 更新后的完整记录
     * @throws com.fan.spotify.common.BizException 404 记录不存在 / 409 新名字已被关注
     */
    @Transactional
    public ArtistFavorite update(Long id, String artistName, String note) {
        ArtistFavorite exist = favoriteMapper.findById(id);
        if (exist == null) {
            throw BizException.notFound("关注记录不存在：id=" + id);
        }
        if (artistName != null && !artistName.trim().isEmpty()) {
            String name = requireArtistName(artistName);
            if (!name.equals(exist.getArtistName()) && favoriteMapper.countByArtist(name) > 0) {
                throw BizException.conflict("歌手「" + name + "」已经在关注列表里了");
            }
            exist.setArtistName(name);
            exist.setInDataset(existsInDataset(name));   // 改了名字就要重新判断
        }
        if (note != null) {
            exist.setNote(trimNote(note));
        }
        favoriteMapper.update(exist);
        return favoriteMapper.findById(id);
    }

    /**
     * 取消关注。找不到记录时抛 404，让前端能区分「刚删掉」和「本来就没有」。
     * @param id 关注记录主键
     * @return 删除行数
     */
    @Transactional
    public int delete(Long id) {
        ArtistFavorite exist = favoriteMapper.findById(id);
        if (exist == null) {
            throw BizException.notFound("关注记录不存在：id=" + id);
        }
        return favoriteMapper.delete(id);
    }

    /**
     * 歌手名校验：非空、长度 <= 512、且不能是原始数据里的缺失值写法 'NA'。
     * @param artistName 原始入参
     * @return 去掉首尾空格后的歌手名
     */
    private static String requireArtistName(String artistName) {
        if (artistName == null || artistName.trim().isEmpty()) {
            throw BizException.badRequest("artistName 不能为空");
        }
        String name = artistName.trim();
        if (name.length() > 512) {
            throw BizException.badRequest("artistName 过长（最多 512 个字符）");
        }
        if ("NA".equals(name)) {
            throw BizException.badRequest("NA 是原始数据的缺失值写法，不是真实歌手");
        }
        return name;
    }

    /**
     * 备注规整：去空格；空串统一存成 null（库里是 NULL 而不是空串）；长度 <= 255。
     * @param note 原始入参
     * @return 规整后的备注或 null
     */
    private static String trimNote(String note) {
        if (note == null) {
            return null;
        }
        String n = note.trim();
        if (n.isEmpty()) {
            return null;
        }
        if (n.length() > 255) {
            throw BizException.badRequest("备注过长（最多 255 个字符）");
        }
        return n;
    }
}
