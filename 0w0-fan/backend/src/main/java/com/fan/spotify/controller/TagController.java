package com.fan.spotify.controller;

import com.fan.spotify.dto.TagRequest;
import com.fan.spotify.entity.SongTag;
import com.fan.spotify.service.TagService;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * 收藏歌曲 / 打标签：查询、新增、改标签、删除。
 *
 * <p>和 {@link FavoriteController} 是一对：那边管「关注歌手」，这边管「收藏歌曲」，
 * 页面上的搜索面板靠模式切换决定调用哪一边。</p>
 */
@RestController
@RequestMapping("/api/tag")
public class TagController {

    private final TagService tagService;

    public TagController(TagService tagService) {
        this.tagService = tagService;
    }

    /**
     * 查标签。
     * GET /api/tag?trackId=xxx   查某首歌的标签
     * GET /api/tag?limit=10      不带 trackId 时返回最新 N 条
     * @param trackId 歌曲 ID，可空
     * @param limit   不带 trackId 时的条数上限
     */
    @GetMapping
    public List<SongTag> list(@RequestParam(name = "trackId", required = false) String trackId,
                              @RequestParam(name = "limit", required = false, defaultValue = "0") int limit) {
        if (trackId == null || trackId.trim().isEmpty()) {
            return tagService.latest(limit);
        }
        return tagService.listByTrack(trackId);
    }

    /**
     * 最近收藏的歌曲列表（最新的在前），给「收藏歌曲」模式的列表用。
     * GET /api/tag/list?limit=30
     * @param limit 条数上限，默认 30
     */
    @GetMapping("/list")
    public List<SongTag> recent(@RequestParam(name = "limit", defaultValue = "30") int limit) {
        return tagService.recent(limit);
    }

    /**
     * 收藏一首歌 / 打标签。
     * POST /api/tag  body: {"trackId":"7KbF...","songName":"11 PM","tagName":"收藏"}
     * 库里没有的歌可以不传 trackId，只传 songName，服务端会生成 custom: 占位 id。
     * @return 201 + 数据库里的真实记录（含 songName 与 inDataset）
     */
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public SongTag create(@RequestBody TagRequest req) {
        return tagService.create(req.trackId, req.songName, req.tagName);
    }

    /**
     * 改标签名。
     * PUT /api/tag/{id}  body: {"tagName":"新标签"}
     * @param id 标签主键
     */
    @PutMapping("/{id}")
    public SongTag update(@PathVariable("id") Long id, @RequestBody TagRequest req) {
        return tagService.updateTag(id, req.tagName);
    }

    /**
     * 删标签（等于取消收藏）。
     * DELETE /api/tag/{id}
     * @param id 标签主键
     */
    @DeleteMapping("/{id}")
    public int delete(@PathVariable("id") Long id) {
        return tagService.delete(id);
    }
}
