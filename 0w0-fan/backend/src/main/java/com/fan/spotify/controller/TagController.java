package com.fan.spotify.controller;

import com.fan.spotify.dto.TagRequest;
import com.fan.spotify.entity.SongTag;
import com.fan.spotify.service.TagService;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * 歌曲打标签：查询 / 新增 / 删除。
 */
@RestController
@RequestMapping("/api/tag")
public class TagController {

    private final TagService tagService;

    public TagController(TagService tagService) {
        this.tagService = tagService;
    }

    /**
     * 查标签：带 trackId 查某首歌的标签，不带则返回最新的 N 条。
     * GET /api/tag?trackId=xxx   或   GET /api/tag?limit=10
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
     * 打标签。
     * POST /api/tag   body: {"trackId":"0u2P...","tagName":"循环单曲"}
     * @return 201 + 数据库里的真实记录
     * @throws com.fan.spotify.common.BizException 400 参数不合法 / 409 这首歌已有该标签
     */
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public SongTag create(@RequestBody TagRequest req) {
        return tagService.create(req.trackId, req.tagName);
    }

    /**
     * 删标签。
     * DELETE /api/tag/{id}
     * @param id 标签主键
     */
    @DeleteMapping("/{id}")
    public int delete(@PathVariable("id") Long id) {
        return tagService.delete(id);
    }
}
