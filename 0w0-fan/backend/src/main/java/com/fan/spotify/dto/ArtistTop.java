package com.fan.spotify.dto;

/**
 * 平均热度 TOP 榜单条目。
 */
public class ArtistTop {

    public int rank;
    public String name;
    public int works;
    public double avgPop;
    /** 专辑数：COUNT(DISTINCT track_album_id)，给前端「专辑数」度量与气泡大小用 */
    public int albumCount;
    /** 最早发行年份（可能为 0 表示该歌手没有合法年份） */
    public int minYear;
    /** 最晚发行年份（可能为 0） */
    public int maxYear;
    /** 平均时长（分钟） */
    public double avgDur;

    public ArtistTop() {
    }
}
