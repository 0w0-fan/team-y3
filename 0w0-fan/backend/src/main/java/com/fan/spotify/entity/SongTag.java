package com.fan.spotify.entity;

import com.fasterxml.jackson.annotation.JsonFormat;

import java.time.LocalDateTime;

/**
 * 歌曲标签（song_tag 表）。
 */
public class SongTag {

    private Long id;
    private String trackId;

    /**
     * 歌名。库里的歌直接用 artist_track_view 里的名字；
     * 用户自己手输、库里没有的歌也把名字存下来，方便列表里显示。
     */
    private String songName;

    private String tagName;

    /**
     * 这首歌在数据集里是否真实存在。
     * true  = track_id 能在 artist_track_view 里查到
     * false = 手输的「库外歌曲」，track_id 是 custom: 开头的占位符
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

    public String getTrackId() {
        return trackId;
    }

    public void setTrackId(String trackId) {
        this.trackId = trackId;
    }

    public String getSongName() {
        return songName;
    }

    public void setSongName(String songName) {
        this.songName = songName;
    }

    public Boolean getInDataset() {
        return inDataset;
    }

    public void setInDataset(Boolean inDataset) {
        this.inDataset = inDataset;
    }

    public String getTagName() {
        return tagName;
    }

    public void setTagName(String tagName) {
        this.tagName = tagName;
    }

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(LocalDateTime createdAt) {
        this.createdAt = createdAt;
    }
}
