package com.spotify.dashboard;

import org.mybatis.spring.annotation.MapperScan;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * 启动类。页面和接口在同一个进程里，端口 8088。
 */
@SpringBootApplication
@MapperScan("com.spotify.dashboard.mapper")
public class SpotifyDashboardApplication {

    public static void main(String[] args) {
        SpringApplication.run(SpotifyDashboardApplication.class, args);
        System.out.println("dashboard ready -> http://localhost:8088/");
    }
}
