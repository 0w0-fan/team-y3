package com.fan.spotify.controller;

import com.fan.spotify.dto.SongBrief;
import com.fan.spotify.service.SongService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * 歌曲检索接口。
 */
@RestController
@RequestMapping("/api/song")
public class SongController {

    private final SongService songService;

    public SongController(SongService songService) {
        this.songService = songService;
    }

    /**
     * 歌曲检索（给「歌曲打标签」交互件选歌用）。
     * GET /api/song/search?q=love&limit=8
     * @param q     歌名或歌手名关键词
     * @param limit 返回条数，默认 8
     */
    @GetMapping("/search")
    public List<SongBrief> search(@RequestParam(name = "q", defaultValue = "") String q,
                                  @RequestParam(name = "limit", defaultValue = "8") int limit) {
        return songService.search(q, limit);
    }
}
