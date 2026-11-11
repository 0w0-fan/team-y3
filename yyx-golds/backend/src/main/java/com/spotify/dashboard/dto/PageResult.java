package com.spotify.dashboard.dto;

import java.util.List;

/**
 * 通用分页结果。
 */
public class PageResult<T> {

    private long total;
    private int page;
    private int size;
    private int totalPages;
    private List<T> records;

    public PageResult() {
    }

    public PageResult(long total, int page, int size, int totalPages, List<T> records) {
        this.total = total;
        this.page = page;
        this.size = size;
        this.totalPages = totalPages;
        this.records = records;
    }

    public long getTotal() {
        return total;
    }

    public void setTotal(long total) {
        this.total = total;
    }

    public int getPage() {
        return page;
    }

    public void setPage(int page) {
        this.page = page;
    }

    public int getSize() {
        return size;
    }

    public void setSize(int size) {
        this.size = size;
    }

    public int getTotalPages() {
        return totalPages;
    }

    public void setTotalPages(int totalPages) {
        this.totalPages = totalPages;
    }

    public List<T> getRecords() {
        return records;
    }

    public void setRecords(List<T> records) {
        this.records = records;
    }
}
