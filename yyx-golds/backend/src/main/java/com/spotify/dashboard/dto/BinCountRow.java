package com.spotify.dashboard.dto;

/**
 * 图表 ⑥ 原始行：(热度分箱, 流派) -> 歌曲数。
 */
public class BinCountRow {

    private String popBin;
    private String genre;
    private Integer songCount;

    public String getPopBin() {
        return popBin;
    }

    public void setPopBin(String popBin) {
        this.popBin = popBin;
    }

    public String getGenre() {
        return genre;
    }

    public void setGenre(String genre) {
        this.genre = genre;
    }

    public Integer getSongCount() {
        return songCount;
    }

    public void setSongCount(Integer songCount) {
        this.songCount = songCount;
    }
}
