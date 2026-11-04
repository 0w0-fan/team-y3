package com.fan.spotify.dto;

/**
 * 歌手活跃年份跨度条目。
 */
public class ArtistSpan {

    public String name;
    public int works;
    public int minYear;
    public int maxYear;
    /** maxYear - minYear */
    public int span;

    public ArtistSpan() {
    }
}
