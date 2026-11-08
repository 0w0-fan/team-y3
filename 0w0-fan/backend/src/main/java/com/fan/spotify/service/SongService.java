package com.fan.spotify.service;

import com.fan.spotify.common.BizException;
import com.fan.spotify.dto.SongBrief;
import com.fan.spotify.mapper.SongMapper;
import org.springframework.stereotype.Service;

import java.util.Collections;
import java.util.List;

/**
 * 歌曲检索（给「歌曲打标签」交互件选歌用）。
 */
@Service
public class SongService {

    private final SongMapper songMapper;

    public SongService(SongMapper songMapper) {
        this.songMapper = songMapper;
    }

    /**
     * 歌曲模糊检索。空关键词直接返回空列表（不打库），关键词过长抛 400。
     * @param keyword 歌名或歌手名片段
     * @param limit   返回条数，默认 8，最多 30
     * @return 按热度降序的歌曲摘要列表
     */
    public List<SongBrief> search(String keyword, int limit) {
        if (keyword == null || keyword.trim().isEmpty()) {
            return Collections.emptyList();
        }
        String q = keyword.trim();
        if (q.length() > 64) {
            throw BizException.badRequest("搜索关键词过长（最多 64 个字符）");
        }
        int size = limit <= 0 ? 8 : Math.min(limit, 30);
        return songMapper.searchSongs(q, size);
    }
}
