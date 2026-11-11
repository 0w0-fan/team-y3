package new_com.spotify2.common2;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataAccessException;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

import javax.servlet.http.HttpServletRequest;

/**
 * 方向六 · 全局异常处理
 *
 * 为什么需要它：
 *   前端 screen.js 的契约是 —— 任何响应都必须是 {code, msg, data} 结构，
 *   并在 unwrap() 里统一判断 code !== 200 就抛错。
 *   一旦后端抛异常，Spring 默认返回 Whitelabel HTML（或 Boot 2.3+ 的默认 JSON error 结构
 *   {timestamp,status,error,path}），后者没有 code/msg 字段，
 *   前端 res.code !== 200 成立但 msg 为空，只能显示 "bad response"，排查时毫无线索。
 *
 * 设计取舍：
 *   1. 业务码与 HTTP 状态码解耦：异常时仍返回 HTTP 200，错误信息放 code=500 / msg 里。
 *      好处是 fetch 的 .then 不会被 4xx/5xx 打断；坏处是监控抓不到 5xx —— 所以这里
 *      用 log.error 把堆栈完整打进日志，可观测性从日志侧补回来。
 *   2. 只扫描 new_com.spotify2 包（由启动类的 @SpringBootApplication 决定），
 *      不会影响 org.springboot.demo 下 DemoApplication 那套老接口。
 *   3. 具体的数据库异常单独给一句话提示：连不上库是这个项目最容易踩的坑
 *      （MySQL 没启动 / 表没导入 / 密码不对），堆栈对使用者没意义。
 *   4. 这里**不处理** 405（方法不支持）和 404。原因不是懒得写，是实测过接不住：
 *      @RestControllerAdvice 带了 basePackages 限定，而 405 是在 handler 映射阶段抛的，
 *      此时 Spring 拿不到 handlerMethod，解析不到对应的 ControllerAdvice，
 *      异常直接落到 DefaultHandlerExceptionResolver，最终还是默认错误结构。
 *      写一个永远不触发的 @ExceptionHandler 只会误导后来人，所以删掉了。
 *      真要做到全 JSON 化，得开 spring.mvc.throw-exception-if-no-handler-found
 *      并实现 ErrorController —— 那是全局改动，会波及老 Demo，本项目不做。
 */
@RestControllerAdvice(basePackages = "new_com.spotify2")
public class GlobalExceptionHandler2 {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler2.class);

    /** 数据库层异常：连不上库、SQL 写错、表不存在，都归到这里 */
    @ExceptionHandler(DataAccessException.class)
    public Result2<Void> handleDataAccess(DataAccessException e, HttpServletRequest req) {
        log.error("[spotify2] 数据访问失败 uri={} -> {}", req.getRequestURI(), e.getMessage(), e);
        String root = rootMessage(e);
        return Result2.fail("数据库访问失败，请确认 MySQL 已启动、spotify_db.spotify_tracks 已导入：" + root);
    }

    /** 参数类型不对，例如 /scatter?from=abc */
    @ExceptionHandler({MethodArgumentTypeMismatchException.class, MissingServletRequestParameterException.class})
    public Result2<Void> handleBadParam(Exception e, HttpServletRequest req) {
        log.warn("[spotify2] 参数不合法 uri={} -> {}", req.getRequestURI(), e.getMessage());
        return Result2.fail("请求参数不合法：" + e.getMessage());
    }

    /**
     * 业务校验失败（CRUD 里最常见：必填为空、数值越界、track_id 重复、记录不存在）。
     * 这类错误是“调用方写错了”，不是“服务端坏了”，所以给 code=400 而不是 500，
     * 前端可以直接把 msg 弹给用户，用户改完再提交。
     */
    @ExceptionHandler(IllegalArgumentException.class)
    public Result2<Void> handleIllegalArgument(IllegalArgumentException e, HttpServletRequest req) {
        log.warn("[spotify2] 校验失败 uri={} -> {}", req.getRequestURI(), e.getMessage());
        return new Result2<>(400, e.getMessage(), null);
    }

    /** 请求体解析失败（本模块全是 GET，留着防以后加 POST） */
    @ExceptionHandler(HttpMessageNotReadableException.class)
    public Result2<Void> handleUnreadable(HttpMessageNotReadableException e, HttpServletRequest req) {
        log.warn("[spotify2] 请求体无法解析 uri={} -> {}", req.getRequestURI(), e.getMessage());
        return Result2.fail("请求体无法解析：" + e.getMessage());
    }

    /** 兜底：任何没被上面接住的异常，都不许把 HTML 错误页漏给前端 */
    @ExceptionHandler(Exception.class)
    public Result2<Void> handleOther(Exception e, HttpServletRequest req) {
        log.error("[spotify2] 未捕获异常 uri={}", req.getRequestURI(), e);
        return Result2.fail("服务端异常：" + e.getClass().getSimpleName() + " - " + e.getMessage());
    }

    /** 取最内层 cause 的 message，比最外层的包装信息有用得多 */
    private String rootMessage(Throwable e) {
        Throwable t = e;
        while (t.getCause() != null && t.getCause() != t) {
            t = t.getCause();
        }
        String m = t.getMessage();
        if (m == null) {
            return t.getClass().getSimpleName();
        }
        /* JDBC 驱动的 message 常常几百字符，截断避免把整个页面撑爆 */
        return m.length() > 300 ? m.substring(0, 300) + "..." : m;
    }
}
