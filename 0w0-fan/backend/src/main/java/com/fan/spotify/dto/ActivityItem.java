package com.fan.spotify.dto;

import com.fasterxml.jackson.annotation.JsonFormat;

import java.time.LocalDateTime;

/**
 * 底部滚动流的一条动态：关注歌手 或 打标签。
 */
public class ActivityItem {

    /** favorite / tag */
    public String type;
    /** 关注时是歌手名，打标签时是标签名 */
    public String title;
    /** 关注时是备注，打标签时是歌曲名 */
    public String detail;

    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss", timezone = "Asia/Shanghai")
    public LocalDateTime time;

    public ActivityItem() {
    }
}
