package com.fan.spotify.common;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 统一异常出口：任何异常都以 JSON 返回，前端不会拿到 HTML 错误页。
 */
@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    private static Map<String, Object> body(int code, String message) {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("code", code);
        map.put("message", message);
        return map;
    }

    /**
     * 业务异常：按异常自带的 HTTP 状态码返回，body 形如 {"code":409,"message":"..."}。
     */
    @ExceptionHandler(BizException.class)
    public ResponseEntity<Map<String, Object>> handleBiz(BizException e) {
        return ResponseEntity.status(e.getStatus())
                .body(body(e.getStatus().value(), e.getMessage()));
    }

    /**
     * 唯一索引冲突（并发下 Service 的查重可能漏过，这里兜底）-> 409。
     */
    @ExceptionHandler(DuplicateKeyException.class)
    public ResponseEntity<Map<String, Object>> handleDuplicate(DuplicateKeyException e) {
        return ResponseEntity.status(HttpStatus.CONFLICT).body(body(409, "记录已存在，不要重复提交"));
    }

    /**
     * 请求体不是合法 JSON -> 400。没有这一层的话前端会收到 500，排查起来会误以为是服务端问题。
     */
    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<Map<String, Object>> handleUnreadable(HttpMessageNotReadableException e) {
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(body(400, "请求体不是合法 JSON：" + e.getMessage()));
    }

    /**
     * 路径变量或查询参数类型不对（例如 /api/favorite/abc 想转成 Long）-> 400。
     */
    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    public ResponseEntity<Map<String, Object>> handleTypeMismatch(MethodArgumentTypeMismatchException e) {
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(body(400, "参数类型不正确：" + e.getName()));
    }

    /**
     * IllegalArgumentException -> 400。
     */
    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<Map<String, Object>> handleIllegalArgument(IllegalArgumentException e) {
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(body(400, e.getMessage()));
    }

    /**
     * 兜底：其它未预料的异常打日志 + 返回 500，保证接口永远返回 JSON 而不是 HTML 错误页。
     */
    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String, Object>> handleOther(Exception e) {
        log.error("未处理异常", e);
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(body(500, e.getClass().getSimpleName() + ": " + e.getMessage()));
    }
}
