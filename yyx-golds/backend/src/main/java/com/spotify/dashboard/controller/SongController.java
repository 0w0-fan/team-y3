package com.spotify.dashboard.controller;

import com.spotify.dashboard.dto.PageResult;
import com.spotify.dashboard.entity.Song;
import com.spotify.dashboard.service.SongService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 明细检索（查）：分页 + 流派 / 子流派 / 关键词 / 热度区间过滤。
 */
@RestController
@RequestMapping("/api/song")
public class SongController {

    private final SongService songService;

    public SongController(SongService songService) {
        this.songService = songService;
    }

    @GetMapping("/page")
    public PageResult<Song> page(@RequestParam(value = "page", defaultValue = "1") int page,
                                 @RequestParam(value = "size", defaultValue = "10") int size,
                                 @RequestParam(value = "genre", required = false) String genre,
                                 @RequestParam(value = "subgenre", required = false) String subgenre,
                                 @RequestParam(value = "keyword", required = false) String keyword,
                                 @RequestParam(value = "minPop", required = false) Integer minPop,
                                 @RequestParam(value = "maxPop", required = false) Integer maxPop,
                                 @RequestParam(value = "sort", defaultValue = "popularity") String sort,
                                 @RequestParam(value = "order", defaultValue = "desc") String order) {
        return songService.page(genre, subgenre, keyword, minPop, maxPop, page, size, sort, order);
    }

    @GetMapping("/{id}")
    public ResponseEntity<Song> detail(@PathVariable("id") int id) {
        Song song = songService.detail(id);
        return song == null ? ResponseEntity.notFound().build() : ResponseEntity.ok(song);
    }
}
