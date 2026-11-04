package com.fan.spotify.service;

import com.fan.spotify.common.BizException;
import com.fan.spotify.entity.SongTag;
import com.fan.spotify.mapper.TagMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/**
 * 歌曲打标签：按歌曲查询、新增、删除。
 */
@Service
public class TagService {

    private final TagMapper tagMapper;

    public TagService(TagMapper tagMapper) {
        this.tagMapper = tagMapper;
    }

    public List<SongTag> listByTrack(String trackId) {
        if (trackId == null || trackId.trim().isEmpty()) {
            throw BizException.badRequest("trackId 不能为空");
        }
        return tagMapper.findByTrackId(trackId.trim());
    }

    public List<SongTag> latest(int limit) {
        int size = limit <= 0 ? 12 : Math.min(limit, 50);
        return tagMapper.findLatest(size);
    }

    @Transactional
    public SongTag create(String trackId, String tagName) {
        if (trackId == null || trackId.trim().isEmpty()) {
            throw BizException.badRequest("trackId 不能为空");
        }
        String tid = trackId.trim();
        if (tid.length() > 64) {
            throw BizException.badRequest("trackId 过长（最多 64 个字符）");
        }
        if (tagName == null || tagName.trim().isEmpty()) {
            throw BizException.badRequest("tagName 不能为空");
        }
        String tag = tagName.trim();
        if (tag.length() > 64) {
            throw BizException.badRequest("tagName 过长（最多 64 个字符）");
        }
        if (tagMapper.countByTrackAndTag(tid, tag) > 0) {
            throw BizException.conflict("这首歌已经有「" + tag + "」标签了");
        }
        SongTag t = new SongTag();
        t.setTrackId(tid);
        t.setTagName(tag);
        tagMapper.insert(t);
        return tagMapper.findById(t.getId());
    }

    @Transactional
    public int delete(Long id) {
        int rows = tagMapper.delete(id);
        if (rows == 0) {
            throw BizException.notFound("标签不存在：id=" + id);
        }
        return rows;
    }
}
