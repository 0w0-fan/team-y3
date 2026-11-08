package com.fan.spotify.service;

import com.fan.spotify.common.BizException;
import com.fan.spotify.entity.SongTag;
import com.fan.spotify.mapper.SongMapper;
import com.fan.spotify.mapper.TagMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/**
 * 歌曲打标签：按歌曲查询、新增、删除。
 */
@Service
public class TagService {

    /** 没填标签时用的默认标签名：等于「收藏」这首歌 */
    private static final String DEFAULT_TAG = "收藏";

    /** 库外歌曲的 track_id 前缀，避免和 Spotify 的真实 id 撞车 */
    private static final String CUSTOM_PREFIX = "custom:";

    private final TagMapper tagMapper;
    private final SongMapper songMapper;

    public TagService(TagMapper tagMapper, SongMapper songMapper) {
        this.tagMapper = tagMapper;
        this.songMapper = songMapper;
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
    /**
     * 收藏一首歌 / 给歌打标签。
     * 支持「库里没有的歌」：只给歌名、不给 trackId 时，自动生成 custom: 占位 id，
     * 并把 in_dataset 记为 false，列表里会打「库外」标。
     * @param trackId  歌曲 ID，可为空
     * @param songName 歌名，手输歌曲时必填
     * @param tagName  标签，为空时用默认的「收藏」
     */
    @Transactional
    public SongTag create(String trackId, String songName, String tagName) {
        String tid = trackId == null ? "" : trackId.trim();
        String name = songName == null ? "" : songName.trim();

        if (tid.isEmpty() && name.isEmpty()) {
            throw BizException.badRequest("至少要给一个歌名，或者从搜索结果里选一首歌");
        }
        if (name.length() > 512) {
            throw BizException.badRequest("歌名过长（最多 512 个字符）");
        }
        if (!tid.isEmpty() && tid.length() > 64) {
            throw BizException.badRequest("trackId 过长（最多 64 个字符）");
        }

        String tag = (tagName == null || tagName.trim().isEmpty()) ? DEFAULT_TAG : tagName.trim();
        if (tag.length() > 64) {
            throw BizException.badRequest("标签过长（最多 64 个字符）");
        }

        boolean inDataset;
        if (tid.isEmpty()) {
            // 手输的库外歌曲：用歌名生成一个稳定的占位 id（同一首歌反复收藏不会串）
            tid = CUSTOM_PREFIX + name;
            if (tid.length() > 64) {
                tid = tid.substring(0, 64);
            }
            inDataset = false;
            if (name.isEmpty()) {
                name = tid;
            }
        } else {
            // 真实 id：回库里确认一下这首歌是否存在于去重视图
            inDataset = songMapper.countTrackInDataset(tid) > 0;
            if (name.isEmpty()) {
                name = songMapper.findTrackName(tid);
            }
        }

        if (tagMapper.countByTrackAndTag(tid, tag) > 0) {
            throw BizException.conflict("《" + (name == null ? tid : name) + "》已经有「" + tag + "」标签了");
        }

        SongTag t = new SongTag();
        t.setTrackId(tid);
        t.setSongName(name);
        t.setTagName(tag);
        t.setInDataset(inDataset);
        tagMapper.insert(t);
        return tagMapper.findById(t.getId());
    }

    /**
     * 改标签名（列表里的「改标签」按钮）。
     * @param id      标签主键
     * @param tagName 新标签名
     */
    @Transactional
    public SongTag updateTag(Long id, String tagName) {
        SongTag exist = tagMapper.findById(id);
        if (exist == null) {
            throw BizException.notFound("标签不存在：id=" + id);
        }
        if (tagName == null || tagName.trim().isEmpty()) {
            throw BizException.badRequest("标签不能为空");
        }
        String tag = tagName.trim();
        if (tag.length() > 64) {
            throw BizException.badRequest("标签过长（最多 64 个字符）");
        }
        if (!tag.equals(exist.getTagName()) && tagMapper.countByTrackAndTag(exist.getTrackId(), tag) > 0) {
            throw BizException.conflict("《" + exist.getSongName() + "》已经有「" + tag + "」标签了");
        }
        tagMapper.updateTagName(id, tag);
        return tagMapper.findById(id);
    }

    /**
     * 最近收藏的歌曲列表（跨歌曲，最新的在前），给「收藏歌曲」模式的列表用。
     * @param limit 条数上限，默认 30，最多 100
     */
    public List<SongTag> recent(int limit) {
        int size = limit <= 0 ? 30 : Math.min(limit, 100);
        return tagMapper.findRecent(size);
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
