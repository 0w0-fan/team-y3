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

    @GetMapping
    public List<SongTag> list(@RequestParam(name = "trackId", required = false) String trackId,
                              @RequestParam(name = "limit", required = false, defaultValue = "0") int limit) {
        if (trackId == null || trackId.trim().isEmpty()) {
            return tagService.latest(limit);
        }
        return tagService.listByTrack(trackId);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public SongTag create(@RequestBody TagRequest req) {
        return tagService.create(req.trackId, req.tagName);
    }

    @DeleteMapping("/{id}")
    public int delete(@PathVariable("id") Long id) {
        return tagService.delete(id);
    }
}
