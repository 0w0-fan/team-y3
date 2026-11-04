package com.fan.spotify.dto;

/**
 * 分箱计数：作品数分箱 -> 歌手数。
 */
public class BinCount {

    /** 分箱标签，如 "1" "6-10" "21+" */
    public String bin;
    /** 该箱内歌手数 */
    public int artists;

    public BinCount() {
    }

    public BinCount(String bin, int artists) {
        this.bin = bin;
        this.artists = artists;
    }
}
