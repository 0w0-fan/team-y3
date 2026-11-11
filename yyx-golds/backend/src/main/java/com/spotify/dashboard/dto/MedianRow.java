package com.spotify.dashboard.dto;

/**
 * 中位热度查询行。
 */
public class MedianRow {

    private String genre;
    private Integer medianPop;

    public String getGenre() {
        return genre;
    }

    public void setGenre(String genre) {
        this.genre = genre;
    }

    public Integer getMedianPop() {
        return medianPop;
    }

    public void setMedianPop(Integer medianPop) {
        this.medianPop = medianPop;
    }
}
