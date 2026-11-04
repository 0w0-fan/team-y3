package com.fan.spotify.controller;

import com.fan.spotify.mapper.SongMapper;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 健康检查：确认后端能连上 MySQL 并读到主表。
 */
@RestController
@RequestMapping("/api")
public class PingController {

    private final SongMapper songMapper;

    public PingController(SongMapper songMapper) {
        this.songMapper = songMapper;
    }

    @GetMapping("/ping")
    public Map<String, Object> ping() {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("count", songMapper.countRows());
        map.put("status", "ok");
        return map;
    }
}
