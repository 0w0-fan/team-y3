package com.spotify.dashboard.dto;

/**
 * 图表 ⑤ 的原始均值行：7 个音频特征。
 */
public class FeatureAvgRow {

    private String genre;
    private Double danceability;
    private Double energy;
    private Double speechiness;
    private Double acousticness;
    private Double instrumentalness;
    private Double liveness;
    private Double valence;

    public String getGenre() {
        return genre;
    }

    public void setGenre(String genre) {
        this.genre = genre;
    }

    public Double getDanceability() {
        return danceability;
    }

    public void setDanceability(Double danceability) {
        this.danceability = danceability;
    }

    public Double getEnergy() {
        return energy;
    }

    public void setEnergy(Double energy) {
        this.energy = energy;
    }

    public Double getSpeechiness() {
        return speechiness;
    }

    public void setSpeechiness(Double speechiness) {
        this.speechiness = speechiness;
    }

    public Double getAcousticness() {
        return acousticness;
    }

    public void setAcousticness(Double acousticness) {
        this.acousticness = acousticness;
    }

    public Double getInstrumentalness() {
        return instrumentalness;
    }

    public void setInstrumentalness(Double instrumentalness) {
        this.instrumentalness = instrumentalness;
    }

    public Double getLiveness() {
        return liveness;
    }

    public void setLiveness(Double liveness) {
        this.liveness = liveness;
    }

    public Double getValence() {
        return valence;
    }

    public void setValence(Double valence) {
        this.valence = valence;
    }
}
