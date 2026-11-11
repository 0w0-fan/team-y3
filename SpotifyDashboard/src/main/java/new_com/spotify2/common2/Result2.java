package new_com.spotify2.common2;

/**
 * 统一响应结构（与方向一保持一致：code / msg / data）
 */
public class Result2<T> {
    private int code;
    private String msg;
    private T data;

    public Result2(int code, String msg, T data) {
        this.code = code;
        this.msg = msg;
        this.data = data;
    }

    public static <T> Result2<T> ok(T data) {
        return new Result2<>(200, "ok", data);
    }

    public static <T> Result2<T> fail(String msg) {
        return new Result2<>(500, msg, null);
    }

    public int getCode() { return code; }
    public String getMsg() { return msg; }
    public T getData() { return data; }
}
