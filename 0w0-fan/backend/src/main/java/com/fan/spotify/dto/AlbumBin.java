package com.fan.spotify.dto;

/**
 * 专辑曲目数分箱 -> 专辑数 / 歌曲平均热度。
 */
public class AlbumBin {

    /** 分箱标签："2" "3-4" "5-9" "10+" */
    public String bin;
    /** 该箱内专辑数 */
    public int albums;
    /** 该箱内全部歌曲的平均热度 */
    public double avgPop;

    public AlbumBin() {
    }
}
