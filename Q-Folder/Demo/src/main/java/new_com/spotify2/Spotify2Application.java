package new_com.spotify2;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/*
 * 方向六 · “响度战争”与音乐物理属性变迁史
 * 独立启动类：只扫描 new_com.spotify2 包
 * 启动后访问 http://localhost:8080/time/index.html
 */

//  scanBasePackages：为了限制扫描范围避免启动失败
@SpringBootApplication(scanBasePackages = "new_com.spotify2")
public class Spotify2Application {
    public static void main(String[] args) {
        SpringApplication.run(Spotify2Application.class, args);
    }
}
