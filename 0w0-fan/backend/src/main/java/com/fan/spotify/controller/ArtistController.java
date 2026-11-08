package com.fan.spotify.controller;

import com.fan.spotify.dto.ArtistPoint;
import com.fan.spotify.service.SongService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * 歌手联想接口：给「关注歌手」的输入框做候选提示。
 *
 * <p>和 {@link SongController} 的区别：那个搜歌曲，这个搜歌手。
 * 两个模式共用一个搜索面板，靠前端切换按钮决定调用哪一个。</p>
 */
@RestController
@RequestMapping("/api/artist")
public class ArtistController {

    private final SongService songService;

    public ArtistController(SongService songService) {
        this.songService = songService;
    }

    /**
     * 歌手联想搜索（大小写不敏感）。
     * GET /api/artist/search?q=billie&limit=8
     * @param q     歌手名片段
     * @param limit 返回条数，默认 8
     * @return 歌手列表：name / works 作品数 / avgPop 平均热度 / albumCount 专辑数
     */
    @GetMapping("/search")
    public List<ArtistPoint> search(@RequestParam(name = "q", defaultValue = "") String q,
                                    @RequestParam(name = "limit", defaultValue = "8") int limit) {
        return songService.searchArtists(q, limit);
    }
}
