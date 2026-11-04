package com.fan.spotify.dto;

/**
 * 热度 × 时长散点图的一个点。
 */
public class SongPoint {

    /** 时长（分钟） */
    public double x;
    /** 热度 0-100 */
    public int y;

    public SongPoint() {
    }
}
