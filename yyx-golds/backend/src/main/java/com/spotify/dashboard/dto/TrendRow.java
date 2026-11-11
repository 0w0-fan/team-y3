package com.spotify.dashboard.dto;

/**
 * 图表 ③ 的原始聚合行：(年, 流派) -> 歌曲数。
 */
public class TrendRow {

    private Integer year;
    private String genre;
    private Integer songCount;

    public Integer getYear() {
        return year;
    }

    public void setYear(Integer year) {
        this.year = year;
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
