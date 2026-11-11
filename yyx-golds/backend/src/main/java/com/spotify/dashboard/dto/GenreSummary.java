package com.spotify.dashboard.dto;

/**
 * 图表 ① 的单个流派：歌曲数、占比、平均热度、中位热度。
 */
public class GenreSummary {

    private String genre;
    private Integer songCount;
    private Double share;
    private Double avgPopularity;
    private Integer medianPopularity;

    public GenreSummary() {
    }

    public GenreSummary(String genre, Integer songCount, Double share, Double avgPopularity, Integer medianPopularity) {
        this.genre = genre;
        this.songCount = songCount;
        this.share = share;
        this.avgPopularity = avgPopularity;
        this.medianPopularity = medianPopularity;
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

    public Double getShare() {
        return share;
    }

    public void setShare(Double share) {
        this.share = share;
    }

    public Double getAvgPopularity() {
        return avgPopularity;
    }

    public void setAvgPopularity(Double avgPopularity) {
        this.avgPopularity = avgPopularity;
    }

    public Integer getMedianPopularity() {
        return medianPopularity;
    }

    public void setMedianPopularity(Integer medianPopularity) {
        this.medianPopularity = medianPopularity;
    }
}
