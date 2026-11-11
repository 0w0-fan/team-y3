package com.spotify.dashboard.dto;

/**
 * 图表 ② 的子流派条目（排名在 Service 层填）。
 */
public class SubGenreRankItem {

    private Integer rank;
    private String genre;
    private String subgenre;
    private Integer songCount;
    private Double avgPopularity;

    public Integer getRank() {
        return rank;
    }

    public void setRank(Integer rank) {
        this.rank = rank;
    }

    public String getGenre() {
        return genre;
    }

    public void setGenre(String genre) {
        this.genre = genre;
    }

    public String getSubgenre() {
        return subgenre;
    }

    public void setSubgenre(String subgenre) {
        this.subgenre = subgenre;
    }

    public Integer getSongCount() {
        return songCount;
    }

    public void setSongCount(Integer songCount) {
        this.songCount = songCount;
    }

    public Double getAvgPopularity() {
        return avgPopularity;
    }

    public void setAvgPopularity(Double avgPopularity) {
        this.avgPopularity = avgPopularity;
    }
}
