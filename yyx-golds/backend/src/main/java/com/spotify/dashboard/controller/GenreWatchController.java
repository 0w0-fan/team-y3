package com.spotify.dashboard.controller;

import com.spotify.dashboard.entity.GenreWatch;
import com.spotify.dashboard.service.GenreWatchService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 流派关注列表 CRUD —— 大屏的「增删改查」全部落在这张表上，
 * spotify_songs 作为分析主表保持只读，避免破坏六张图的口径。
 */
@RestController
@RequestMapping("/api/watch")
public class GenreWatchController {

    private final GenreWatchService service;

    public GenreWatchController(GenreWatchService service) {
        this.service = service;
    }

    /** 查：列表 */
    @GetMapping
    public Map<String, Object> list() {
        List<GenreWatch> items = service.list();
        Map<String, Object> body = new LinkedHashMap<String, Object>();
        body.put("total", items.size());
        body.put("items", items);
        return body;
    }

    /** 增 */
    @PostMapping
    public ResponseEntity<GenreWatch> create(@RequestBody GenreWatch item) {
        return ResponseEntity.status(HttpStatus.CREATED).body(service.create(item));
    }

    /** 改 */
    @PutMapping("/{id}")
    public GenreWatch update(@PathVariable("id") int id, @RequestBody GenreWatch item) {
        return service.update(id, item);
    }

    /** 删 */
    @DeleteMapping("/{id}")
    public Map<String, Object> delete(@PathVariable("id") int id) {
        boolean removed = service.delete(id);
        Map<String, Object> body = new LinkedHashMap<String, Object>();
        body.put("success", removed);
        body.put("id", id);
        return body;
    }
}
