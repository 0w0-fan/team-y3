package com.spotify.dashboard.dto;

import java.util.ArrayList;
import java.util.List;

/**
 * /api/genre/trend 响应体：年份数组 + 6 条流派序列（缺失组合补 0）。
 */
public class TrendResponse {

    private List<Integer> years;
    private List<Series> series;
    private int grandTotal;

    public List<Integer> getYears() {
        return years;
    }

    public void setYears(List<Integer> years) {
        this.years = years;
    }

    public List<Series> getSeries() {
        return series;
    }

    public void setSeries(List<Series> series) {
        this.series = series;
    }

    public int getGrandTotal() {
        return grandTotal;
    }

    public void setGrandTotal(int grandTotal) {
        this.grandTotal = grandTotal;
    }

    /** 单条流派序列 */
    public static class Series {

        private String genre;
        private List<Integer> values = new ArrayList<Integer>();
        private int total;

        public Series() {
        }

        public Series(String genre, List<Integer> values, int total) {
            this.genre = genre;
            this.values = values;
            this.total = total;
        }

        public String getGenre() {
            return genre;
        }

        public void setGenre(String genre) {
            this.genre = genre;
        }

        public List<Integer> getValues() {
            return values;
        }

        public void setValues(List<Integer> values) {
            this.values = values;
        }

        public int getTotal() {
            return total;
        }

        public void setTotal(int total) {
            this.total = total;
        }
    }
}
