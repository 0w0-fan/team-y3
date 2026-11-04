package com.fan.spotify.dto;

/**
 * 年度趋势点：某一年有多少首歌、平均热度多少。
 */
public class YearPoint {

    /** 发行年份 */
    public int year;
    /** 该年去重歌曲数 */
    public int songs;
    /** 该年歌曲平均热度 */
    public double avgPop;

    public YearPoint() {
    }
}
