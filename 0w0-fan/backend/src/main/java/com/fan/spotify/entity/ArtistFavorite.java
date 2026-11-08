package com.fan.spotify.entity;

import com.fasterxml.jackson.annotation.JsonFormat;

import java.time.LocalDateTime;

/**
 * 关注的歌手（artist_favorite 表）。
 */
public class ArtistFavorite {

    private Long id;
    private String artistName;
    private String note;

    /**
     * 这位歌手在数据集里是否真实存在。
     * true  = artist_track_view 里能查到（follow 之后可以在图表里定位到他的作品）
     * false = 只有名字、库里没有这个歌手（例如自己手输的名字），页面会打一个「库外」标记
     */
    private Boolean inDataset;

    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss", timezone = "Asia/Shanghai")
    private LocalDateTime createdAt;

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getArtistName() {
        return artistName;
    }

    public void setArtistName(String artistName) {
        this.artistName = artistName;
    }

    public String getNote() {
        return note;
    }

    public void setNote(String note) {
        this.note = note;
    }

    public Boolean getInDataset() {
        return inDataset;
    }

    public void setInDataset(Boolean inDataset) {
        this.inDataset = inDataset;
    }

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(LocalDateTime createdAt) {
        this.createdAt = createdAt;
    }
}
