package com.spotify.dashboard.dto;

import java.util.List;
import java.util.Map;

/**
 * /api/genre/radar 响应体：values 为 0-100 归一化值，raw 为原始均值（tooltip 用）。
 */
public class RadarResponse {

    private List<String> features;
    private int max;
    private List<Series> series;

    public List<String> getFeatures() {
        return features;
    }

    public void setFeatures(List<String> features) {
        this.features = features;
    }

    public int getMax() {
        return max;
    }

    public void setMax(int max) {
        this.max = max;
    }

    public List<Series> getSeries() {
        return series;
    }

    public void setSeries(List<Series> series) {
        this.series = series;
    }

    public static class Series {

        private String genre;
        private List<Double> values;
        private Map<String, Double> raw;

        public String getGenre() {
            return genre;
        }

        public void setGenre(String genre) {
            this.genre = genre;
        }

        public List<Double> getValues() {
            return values;
        }

        public void setValues(List<Double> values) {
            this.values = values;
        }

        public Map<String, Double> getRaw() {
            return raw;
        }

        public void setRaw(Map<String, Double> raw) {
            this.raw = raw;
        }
    }
}
