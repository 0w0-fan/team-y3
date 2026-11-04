package com.fan.spotify.dto;

/**
 * 四象限散点图的一个点：一位歌手。
 */
public class ArtistPoint {

    /** 歌手名 */
    public String name;
    /** 作品数（COUNT(DISTINCT track_id)） */
    public int works;
    /** 平均热度 AVG(track_popularity) */
    public double avgPop;

    public ArtistPoint() {
    }

    public ArtistPoint(String name, int works, double avgPop) {
        this.name = name;
        this.works = works;
        this.avgPop = avgPop;
    }
}
