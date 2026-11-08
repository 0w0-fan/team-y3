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

    /**
     * 查某首歌的标签列表。
     * @param trackId 歌曲 ID，不能为空
     */
    public List<SongTag> listByTrack(String trackId) {
        if (trackId == null || trackId.trim().isEmpty()) {
            throw BizException.badRequest("trackId 不能为空");
        }
        return tagMapper.findByTrackId(trackId.trim());
    }

    /**
     * 查最新 N 条标签（接口不带 trackId 时走这里）。
     * @param limit 条数上限，默认 12，最多 50
     */
    public List<SongTag> latest(int limit) {
        int size = limit <= 0 ? 12 : Math.min(limit, 50);
        return tagMapper.findLatest(size);
    }

    /**
     * 给一首歌打标签：校验 trackId 与标签名 -> 查重 -> 插入 -> 回读。
     * @param trackId 歌曲 ID
     * @param tagName 标签名，最长 64 字符
     * @return 数据库里的真实记录
     * @throws com.fan.spotify.common.BizException 400 参数不合法 / 409 这首歌已有该标签
     */
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

    /**
     * 删标签。
     * @param id 标签主键
     * @return 删除行数
     * @throws com.fan.spotify.common.BizException 404 标签不存在
     */
    @Transactional
    public int delete(Long id) {
        int rows = tagMapper.delete(id);
        if (rows == 0) {
            throw BizException.notFound("标签不存在：id=" + id);
        }
        return rows;
    }
}
