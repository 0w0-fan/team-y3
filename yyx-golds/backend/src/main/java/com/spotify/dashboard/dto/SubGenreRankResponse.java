package com.spotify.dashboard.dto;

import java.util.List;

/**
 * /api/subgenre/rank 响应体。
 */
public class SubGenreRankResponse {

    private int top;
    private int total;
    private List<SubGenreRankItem> items;

    public SubGenreRankResponse() {
    }

    public SubGenreRankResponse(int top, int total, List<SubGenreRankItem> items) {
        this.top = top;
        this.total = total;
        this.items = items;
    }

    public int getTop() {
        return top;
    }

    public void setTop(int top) {
        this.top = top;
    }

    public int getTotal() {
        return total;
    }

    public void setTotal(int total) {
        this.total = total;
    }

    public List<SubGenreRankItem> getItems() {
        return items;
    }

    public void setItems(List<SubGenreRankItem> items) {
        this.items = items;
    }
}
