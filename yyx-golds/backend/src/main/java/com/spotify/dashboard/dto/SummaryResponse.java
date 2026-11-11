package com.spotify.dashboard.dto;

import java.util.List;

/**
 * /api/genre/summary 响应体。
 */
public class SummaryResponse {

    private int total;
    private String granularity;
    private List<GenreSummary> genres;

    public SummaryResponse() {
    }

    public SummaryResponse(int total, String granularity, List<GenreSummary> genres) {
        this.total = total;
        this.granularity = granularity;
        this.genres = genres;
    }

    public int getTotal() {
        return total;
    }

    public void setTotal(int total) {
        this.total = total;
    }

    public String getGranularity() {
        return granularity;
    }

    public void setGranularity(String granularity) {
        this.granularity = granularity;
    }

    public List<GenreSummary> getGenres() {
        return genres;
    }

    public void setGenres(List<GenreSummary> genres) {
        this.genres = genres;
    }
}
