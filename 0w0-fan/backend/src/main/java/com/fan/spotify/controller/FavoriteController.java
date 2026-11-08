package com.fan.spotify.controller;

import com.fan.spotify.dto.FavoriteRequest;
import com.fan.spotify.entity.ArtistFavorite;
import com.fan.spotify.service.FavoriteService;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * 关注歌手：4 个 CRUD 接口。
 */
@RestController
@RequestMapping("/api/favorite")
public class FavoriteController {

    private final FavoriteService favoriteService;

    public FavoriteController(FavoriteService favoriteService) {
        this.favoriteService = favoriteService;
    }

    /**
     * 关注列表。
     * GET /api/favorite
     */
    @GetMapping
    public List<ArtistFavorite> list() {
        return favoriteService.list();
    }

    /**
     * 新增关注。
     * POST /api/favorite   body: {"artistName":"Billie Eilish","note":"备注"}
     * @return 201 + 数据库里的真实记录
     * @throws com.fan.spotify.common.BizException 400 参数不合法 / 409 已经关注过
     */
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public ArtistFavorite create(@RequestBody FavoriteRequest req) {
        return favoriteService.create(req.artistName, req.note);
    }

    /**
     * 修改关注（改备注或改歌手名）。
     * PUT /api/favorite/{id}   body: {"artistName":"可省略","note":"新备注"}
     * @param id 关注记录主键
     */
    @PutMapping("/{id}")
    public ArtistFavorite update(@PathVariable("id") Long id, @RequestBody FavoriteRequest req) {
        return favoriteService.update(id, req.artistName, req.note);
    }

    /**
     * 取消关注。
     * DELETE /api/favorite/{id}
     * @param id 关注记录主键
     * @return 删除行数（正常为 1）
     */
    @DeleteMapping("/{id}")
    public int delete(@PathVariable("id") Long id) {
        return favoriteService.delete(id);
    }
}
