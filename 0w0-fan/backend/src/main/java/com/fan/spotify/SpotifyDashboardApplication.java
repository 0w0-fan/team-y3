package com.fan.spotify;

import org.mybatis.spring.annotation.MapperScan;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * Spotify 歌手与专辑「产量-热度」效率分析大屏 · 启动类
 *
 * <p>启动后访问 http://localhost:8088/ 即可打开大屏页面。</p>
 */
@SpringBootApplication
@MapperScan("com.fan.spotify.mapper")
public class SpotifyDashboardApplication {

    public static void main(String[] args) {
        SpringApplication.run(SpotifyDashboardApplication.class, args);
    }
}
