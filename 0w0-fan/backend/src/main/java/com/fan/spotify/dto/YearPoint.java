package com.fan.spotify.dto;

/**
 * 年度趋势点：某一年有多少首歌、多少位歌手、多少张专辑、平均热度与平均时长。
 */
public class YearPoint {

    /** 发行年份 */
    public int year;
    /** 该年去重歌曲数 */
    public int songs;
    /** 该年歌曲平均热度 */
    public double avgPop;
    /** 该年涉及的去重歌手数 */
    public int artists;
    /** 该年涉及的去重专辑数 */
    public int albums;
    /** 该年歌曲平均时长（分钟） */
    public double avgDur;
    /** 该年最热歌曲的热度 */
    public int maxPop;

    public YearPoint() {
    }
}
