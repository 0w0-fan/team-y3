package com.spotify.dashboard.dto;

/**
 * 图表 ④ 原始行：流派 -> 子流派 -> 歌曲数。
 */
public class SankeyRow {

    private String src;
    private String dst;
    private Integer value;

    public String getSrc() {
        return src;
    }

    public void setSrc(String src) {
        this.src = src;
    }

    public String getDst() {
        return dst;
    }

    public void setDst(String dst) {
        this.dst = dst;
    }

    public Integer getValue() {
        return value;
    }

    public void setValue(Integer value) {
        this.value = value;
    }
}
