package com.spotify.dashboard.service;

import com.spotify.dashboard.dto.PageResult;
import com.spotify.dashboard.entity.Song;
import com.spotify.dashboard.mapper.SpotifyMapper;
import org.springframework.stereotype.Service;

import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 明细分页检索（查）。spotify_songs 只读，不提供写操作。
 */
@Service
public class SongService {

    /** 排序字段白名单：前端只传 key，禁止把用户输入拼进 ORDER BY */
    private static final Map<String, String> SORTABLE = new HashMap<String, String>();

    static {
        SORTABLE.put("id", "id");
        SORTABLE.put("popularity", "track_popularity");
        SORTABLE.put("year", "release_year");
        SORTABLE.put("duration", "duration_sec");
        SORTABLE.put("track", "track_name");
        SORTABLE.put("artist", "track_artist");
    }

    private final SpotifyMapper mapper;

    public SongService(SpotifyMapper mapper) {
        this.mapper = mapper;
    }

    public PageResult<Song> page(String genre, String subgenre, String keyword,
                                 Integer minPop, Integer maxPop,
                                 int page, int size, String sort, String order) {

        int safePage = Math.max(1, page);
        int safeSize = Math.max(1, Math.min(size, 200));
        String column = SORTABLE.get(sort == null ? "popularity" : sort.toLowerCase());
        if (column == null) {
            column = "track_popularity";
        }
        String direction = "asc".equalsIgnoreCase(order) ? "ASC" : "DESC";

        String g = trimToNull(genre);
        String sg = trimToNull(subgenre);
        String kw = trimToNull(keyword);
        Integer lo = clampPop(minPop);
        Integer hi = clampPop(maxPop);

        long total = mapper.countSongs(g, sg, kw, lo, hi);
        int totalPages = total == 0 ? 0 : (int) Math.ceil(total * 1.0 / safeSize);
        if (totalPages > 0 && safePage > totalPages) {
            safePage = totalPages;
        }

        List<Song> records = total == 0
                ? Collections.<Song>emptyList()
                : mapper.selectSongPage(g, sg, kw, lo, hi, column, direction, (safePage - 1) * safeSize, safeSize);

        return new PageResult<Song>(total, safePage, safeSize, totalPages, records);
    }

    public Song detail(int id) {
        return mapper.selectSongById(id);
    }

    private static String trimToNull(String s) {
        if (s == null) {
            return null;
        }
        String t = s.trim();
        return t.isEmpty() ? null : t;
    }

    private static Integer clampPop(Integer v) {
        if (v == null) {
            return null;
        }
        return Math.max(0, Math.min(100, v));
    }
}
