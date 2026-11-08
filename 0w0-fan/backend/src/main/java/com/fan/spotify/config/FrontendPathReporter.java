package com.fan.spotify.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.ApplicationArguments;
import org.springframework.stereotype.Component;

import java.io.File;
import java.util.ArrayList;
import java.util.List;

/**
 * 启动时把「前端目录到底解析到哪儿」打印出来。
 *
 * <p>大屏前端没有打进 jar，而是由后端按文件路径直接提供（见 application.yml 的
 * spring.web.resources.static-locations）。这个路径是相对「工作目录」的，
 * 而工作目录会随启动方式变化（IDEA 运行配置 / mvn spring-boot:run / java -jar）。
 * 一旦候选路径全都不对，页面就会返回 404，且很难看出原因。</p>
 *
 * <p>所以这里在启动日志里明确列出：每个候选目录的绝对路径、是否存在 index.html、
 * 最终生效的是哪一个。答辩演示前扫一眼日志就知道前端有没有被正确挂上。</p>
 */
@Component
public class FrontendPathReporter implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(FrontendPathReporter.class);

    /** 与 application.yml 的 static-locations 保持一致的候选列表 */
    private static final String[] CANDIDATES = {
            "../frontend",
            "./frontend",
            "../0w0-fan/frontend",
            "0w0-fan/frontend",
            "./0w0-fan/frontend",
            "team-y3/0w0-fan/frontend"
    };

    @Override
    public void run(ApplicationArguments args) {
        String workDir = System.getProperty("user.dir");
        log.info("大屏静态资源检查 —— 当前工作目录: {}", workDir);

        List<String> hits = new ArrayList<>();
        for (String candidate : CANDIDATES) {
            File dir = new File(candidate);
            File index = new File(dir, "index.html");
            boolean exists = index.isFile();
            log.info("  [{}] {} → {}",
                    exists ? "命中" : "跳过",
                    index.getAbsolutePath(),
                    exists ? "OK" : "不存在");
            if (exists) {
                hits.add(dir.getAbsolutePath());
            }
        }

        if (hits.isEmpty()) {
            log.error("没有找到任何前端目录！浏览器访问 http://localhost:8088/ 会返回 404。"
                    + "请在 0w0-fan/backend 目录下启动，或把前端目录补进 application.yml 的 static-locations。");
        } else {
            log.info("前端目录可用: {}（改完 CSS/JS 直接刷新浏览器即可）", hits.get(0));
        }
    }
}
