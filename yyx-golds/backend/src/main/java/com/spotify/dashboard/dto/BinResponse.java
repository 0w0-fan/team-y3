package com.spotify.dashboard.dto;

import java.util.List;
import java.util.Map;

/**
 * /api/genre/bin 响应体：5 个分箱，每箱 6 个流派的绝对数与列内占比。
 */
public class BinResponse {

    private List<Bin> bins;

    public List<Bin> getBins() {
        return bins;
    }

    public void setBins(List<Bin> bins) {
        this.bins = bins;
    }

    public static class Bin {

        private String label;
        private int total;
        private Map<String, Integer> counts;
        private Map<String, Double> shares;

        public String getLabel() {
            return label;
        }

        public void setLabel(String label) {
            this.label = label;
        }

        public int getTotal() {
            return total;
        }

        public void setTotal(int total) {
            this.total = total;
        }

        public Map<String, Integer> getCounts() {
            return counts;
        }

        public void setCounts(Map<String, Integer> counts) {
            this.counts = counts;
        }

        public Map<String, Double> getShares() {
            return shares;
        }

        public void setShares(Map<String, Double> shares) {
            this.shares = shares;
        }
    }
}
