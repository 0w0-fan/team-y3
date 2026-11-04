package com.fan.spotify.service;

import com.fan.spotify.common.BizException;
import com.fan.spotify.entity.ArtistFavorite;
import com.fan.spotify.mapper.FavoriteMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/**
 * 关注歌手：增删改查。
 */
@Service
public class FavoriteService {

    private final FavoriteMapper favoriteMapper;

    public FavoriteService(FavoriteMapper favoriteMapper) {
        this.favoriteMapper = favoriteMapper;
    }

    public List<ArtistFavorite> list() {
        return favoriteMapper.findAll();
    }

    @Transactional
    public ArtistFavorite create(String artistName, String note) {
        String name = requireArtistName(artistName);
        if (favoriteMapper.countByArtist(name) > 0) {
            throw BizException.conflict("歌手「" + name + "」已经在关注列表里了");
        }
        ArtistFavorite f = new ArtistFavorite();
        f.setArtistName(name);
        f.setNote(trimNote(note));
        favoriteMapper.insert(f);
        return favoriteMapper.findById(f.getId());
    }

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
        }
        if (note != null) {
            exist.setNote(trimNote(note));
        }
        favoriteMapper.update(exist);
        return favoriteMapper.findById(id);
    }

    @Transactional
    public int delete(Long id) {
        ArtistFavorite exist = favoriteMapper.findById(id);
        if (exist == null) {
            throw BizException.notFound("关注记录不存在：id=" + id);
        }
        return favoriteMapper.delete(id);
    }

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
