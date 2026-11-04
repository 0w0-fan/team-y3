package com.fan.spotify.common;

import org.springframework.http.HttpStatus;

/**
 * 业务异常：由 Controller 层统一转换成对应 HTTP 状态码。
 */
public class BizException extends RuntimeException {

    private final HttpStatus status;

    public BizException(HttpStatus status, String message) {
        super(message);
        this.status = status;
    }

    public static BizException badRequest(String message) {
        return new BizException(HttpStatus.BAD_REQUEST, message);
    }

    public static BizException notFound(String message) {
        return new BizException(HttpStatus.NOT_FOUND, message);
    }

    public static BizException conflict(String message) {
        return new BizException(HttpStatus.CONFLICT, message);
    }

    public HttpStatus getStatus() {
        return status;
    }
}
