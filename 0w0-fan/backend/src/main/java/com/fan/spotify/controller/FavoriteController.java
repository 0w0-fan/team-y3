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

    @GetMapping
    public List<ArtistFavorite> list() {
        return favoriteService.list();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public ArtistFavorite create(@RequestBody FavoriteRequest req) {
        return favoriteService.create(req.artistName, req.note);
    }

    @PutMapping("/{id}")
    public ArtistFavorite update(@PathVariable("id") Long id, @RequestBody FavoriteRequest req) {
        return favoriteService.update(id, req.artistName, req.note);
    }

    @DeleteMapping("/{id}")
    public int delete(@PathVariable("id") Long id) {
        return favoriteService.delete(id);
    }
}
