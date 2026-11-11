package com.spotify.dashboard.entity;

/**
 * 流派关注列表（genre_watch），大屏「增删改查」的落库实体。
 */
public class GenreWatch {

    private Integer id;
    private String genre;
    private Integer watchLevel;
    private String note;
    private String createdAt;
    private String updatedAt;

    public Integer getId() {
        return id;
    }

    public void setId(Integer id) {
        this.id = id;
    }

    public String getGenre() {
        return genre;
    }

    public void setGenre(String genre) {
        this.genre = genre;
    }

    public Integer getWatchLevel() {
        return watchLevel;
    }

    public void setWatchLevel(Integer watchLevel) {
        this.watchLevel = watchLevel;
    }

    public String getNote() {
        return note;
    }

    public void setNote(String note) {
        this.note = note;
    }

    public String getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(String createdAt) {
        this.createdAt = createdAt;
    }

    public String getUpdatedAt() {
        return updatedAt;
    }

    public void setUpdatedAt(String updatedAt) {
        this.updatedAt = updatedAt;
    }
}
