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

    /**
     * 应用入口。@SpringBootApplication 负责组件扫描与自动配置，
     * @MapperScan 告诉 MyBatis 去哪里找 Mapper 接口（否则每个接口都要单独加 @Mapper）。
     * @param args 命令行参数，本工程支持 --server.port=xxxx 之类的覆盖
     */
    public static void main(String[] args) {
        SpringApplication.run(SpotifyDashboardApplication.class, args);
    }
}
