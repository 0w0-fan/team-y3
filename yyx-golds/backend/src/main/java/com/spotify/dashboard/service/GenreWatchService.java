package com.spotify.dashboard.service;

import com.spotify.dashboard.entity.GenreWatch;
import com.spotify.dashboard.mapper.GenreWatchMapper;
import org.springframework.stereotype.Service;

import java.util.List;

/**
 * 关注列表的增删改查。流派名限定为 6 个合法值，等级 1-5。
 */
@Service
public class GenreWatchService {

    private final GenreWatchMapper mapper;

    public GenreWatchService(GenreWatchMapper mapper) {
        this.mapper = mapper;
    }

    public List<GenreWatch> list() {
        return mapper.selectAll();
    }

    public GenreWatch create(GenreWatch item) {
        normalize(item, false);
        mapper.insert(item);
        return mapper.selectById(item.getId());
    }

    public GenreWatch update(int id, GenreWatch item) {
        if (mapper.selectById(id) == null) {
            throw new IllegalArgumentException("关注记录不存在: id=" + id);
        }
        item.setId(id);
        normalize(item, true);
        mapper.update(item);
        return mapper.selectById(id);
    }

    public boolean delete(int id) {
        return mapper.deleteById(id) > 0;
    }

    private void normalize(GenreWatch item, boolean forUpdate) {
        if (item == null) {
            throw new IllegalArgumentException("请求体不能为空");
        }
        String genre = item.getGenre() == null ? null : item.getGenre().trim().toLowerCase();
        if (genre == null || !DashboardService.GENRE_ORDER.contains(genre)) {
            throw new IllegalArgumentException("genre 必须是 6 个流派之一: " + DashboardService.GENRE_ORDER);
        }
        item.setGenre(genre);

        Integer level = item.getWatchLevel();
        if (level == null) {
            item.setWatchLevel(3);
        } else if (level < 1 || level > 5) {
            throw new IllegalArgumentException("watchLevel 取值 1-5");
        }

        String note = item.getNote();
        if (note != null) {
            note = note.trim();
            if (note.isEmpty()) {
                note = null;
            } else if (note.length() > 255) {
                note = note.substring(0, 255);
            }
        }
        item.setNote(note);
        if (forUpdate && item.getId() == null) {
            throw new IllegalArgumentException("缺少 id");
        }
    }
}
