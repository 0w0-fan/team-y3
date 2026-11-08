package com.fan.spotify.dto;

/**
 * 分箱计数：作品数分箱 -> 歌手数 / 歌曲数 / 平均热度。
 */
public class BinCount {

    /** 分箱标签，如 "1" "6-10" "21+" */
    public String bin;
    /** 该箱内歌手数 */
    public int artists;
    /** 该箱内去重歌曲数（歌手作品数之和） */
    public int songs;
    /** 该箱内全部歌曲的平均热度 */
    public double avgPop;

    public BinCount() {
    }

    public BinCount(String bin, int artists) {
        this.bin = bin;
        this.artists = artists;
    }
}
