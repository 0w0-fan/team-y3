package com.fan.spotify.common;

import org.springframework.http.HttpStatus;

/**
 * 业务异常：由 Controller 层统一转换成对应 HTTP 状态码。
 */
public class BizException extends RuntimeException {

    private final HttpStatus status;

    /**
     * 构造业务异常。
     * @param status  希望返回给前端的 HTTP 状态码
     * @param message 给用户看的中文提示
     */
    public BizException(HttpStatus status, String message) {
        super(message);
        this.status = status;
    }

    /**
     * 参数不合法 -> 400。
     * @param message 提示语
     */
    public static BizException badRequest(String message) {
        return new BizException(HttpStatus.BAD_REQUEST, message);
    }

    /**
     * 记录不存在 -> 404。
     * @param message 提示语
     */
    public static BizException notFound(String message) {
        return new BizException(HttpStatus.NOT_FOUND, message);
    }

    /**
     * 重复提交/状态冲突 -> 409。
     * @param message 提示语
     */
    public static BizException conflict(String message) {
        return new BizException(HttpStatus.CONFLICT, message);
    }

    /**
     * 给异常处理器取用，决定返回哪个 HTTP 状态码。
     */
    public HttpStatus getStatus() {
        return status;
    }
}
