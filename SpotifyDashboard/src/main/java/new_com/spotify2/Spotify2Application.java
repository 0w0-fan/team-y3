package new_com.spotify2;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/*
 * 方向六 · “响度战争”与音乐物理属性变迁史 —— 启动类
 *
 * 工程：SpotifyDashboard（独立工程，不再挂在 Demo 里）
 * 包名：new_com.spotify2（沿用旧工程的命名，方便对照此前交付的代码分析报告）
 *
 * 与旧工程的关键差别：
 *   旧工程 pom 里混着 mybatis-plus / data-jpa / thymeleaf，那是别的课程练习留下的。
 *   它们的自动配置会去扫 classpath 下所有 mapper/*.xml，同一个 XML 出现两次就报
 *   “Result Maps collection already contains value for ...”，启动直接失败，
 *   而且报错指向跟本模块毫无关系的 ArticleMapper。
 *   新工程只留 web + jdbc + druid + mysql，这些自动配置根本不存在，
 *   所以这里**不需要**任何 exclude，启动更干净也更快。
 *
 * 数据来源：MySQL spotify_db.spotify_tracks（28,351 行）
 *   建表与数据脚本：Desktop/数据分析可视化/spotify_tracks.sql
 *   连接参数：src/main/resources/application.properties
 *
 * 启动后：
 *   大屏      http://localhost:8080/time/index.html
 *   接口自检  http://localhost:8080/api/time/overview
 */
@SpringBootApplication
public class Spotify2Application {
    public static void main(String[] args) {
        SpringApplication.run(Spotify2Application.class, args);
    }
}
