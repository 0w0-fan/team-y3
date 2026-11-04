package com.fan.spotify.service;

import com.fan.spotify.dto.AlbumBin;
import com.fan.spotify.dto.ArtistPoint;
import com.fan.spotify.dto.ArtistSpan;
import com.fan.spotify.dto.ArtistTop;
import com.fan.spotify.dto.BinCount;
import com.fan.spotify.dto.Overview;
import com.fan.spotify.dto.SongPoint;
import com.fan.spotify.mapper.FavoriteMapper;
import com.fan.spotify.mapper.SongMapper;
import com.fan.spotify.mapper.TagMapper;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 六张图表的取数逻辑。所有口径见 README「指标口径」一节。
 */
@Service
public class ChartService {

    /** 图 2 的分箱顺序 */
    private static final List<String> ARTIST_BIN_ORDER =
            Arrays.asList("1", "2", "3", "4", "5", "6-10", "11-20", "21+");

    /** 图 4 的分箱顺序 */
    private static final List<String> ALBUM_BIN_ORDER =
            Arrays.asList("2", "3-4", "5-9", "10+");

    private final SongMapper songMapper;
    private final FavoriteMapper favoriteMapper;
    private final TagMapper tagMapper;

    public ChartService(SongMapper songMapper, FavoriteMapper favoriteMapper, TagMapper tagMapper) {
        this.songMapper = songMapper;
        this.favoriteMapper = favoriteMapper;
        this.tagMapper = tagMapper;
    }

    /** 顶部概览指标 */
    public Overview overview() {
        Overview o = new Overview();
        o.rows = songMapper.countRows();
        o.songs = songMapper.countSongs();
        o.artists = songMapper.countArtists();
        o.albums = songMapper.countAlbums();
        o.avgPopularity = songMapper.avgPopularity();
        o.avgPopularityDedup = songMapper.avgPopularityDedup();
        o.favorites = favoriteMapper.count();
        o.tags = tagMapper.count();
        return o;
    }

    /**
     * 图 1：四象限散点。
     * x = 作品数，y = 平均热度；筛作品数 >= 3；分割线 = x 中位数、y 全局均值。
     */
    public Map<String, Object> quadrant() {
        List<ArtistPoint> points = songMapper.selectQuadrant();

        List<Integer> works = new ArrayList<>(points.size());
        for (ArtistPoint p : points) {
            works.add(p.works);
        }
        Collections.sort(works);
        double medianWorks = works.isEmpty() ? 0 : median(works);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("points", points);
        result.put("count", points.size());
        result.put("medianWorks", medianWorks);
        result.put("globalAvgPop", songMapper.avgPopularity());
        return result;
    }

    private static double median(List<Integer> sorted) {
        int n = sorted.size();
        if (n % 2 == 1) {
            return sorted.get(n / 2);
        }
        return (sorted.get(n / 2 - 1) + sorted.get(n / 2)) / 2.0;
    }

    /** 图 2：歌手作品数长尾分布（8 个分箱，y 轴对数） */
    public List<BinCount> artistDistribution() {
        List<BinCount> raw = songMapper.selectArtistDistribution();
        List<BinCount> ordered = new ArrayList<>(ARTIST_BIN_ORDER.size());
        for (String bin : ARTIST_BIN_ORDER) {
            BinCount hit = null;
            for (BinCount b : raw) {
                if (bin.equals(b.bin)) {
                    hit = b;
                    break;
                }
            }
            ordered.add(hit == null ? new BinCount(bin, 0) : hit);
        }
        return ordered;
    }

    /** 图 3：平均热度 TOP N（作品数 >= 3），带排名 */
    public List<ArtistTop> topArtists(int limit) {
        List<ArtistTop> list = songMapper.selectTopArtists(normalizeLimit(limit, 20, 100));
        for (int i = 0; i < list.size(); i++) {
            list.get(i).rank = i + 1;
        }
        return list;
    }

    /** 图 4：专辑曲目数分箱 -> 专辑数 / 歌曲平均热度（4 个箱） */
    public List<AlbumBin> albumBins() {
        List<AlbumBin> raw = songMapper.selectAlbumBins();
        List<AlbumBin> ordered = new ArrayList<>(ALBUM_BIN_ORDER.size());
        for (String bin : ALBUM_BIN_ORDER) {
            AlbumBin hit = null;
            for (AlbumBin b : raw) {
                if (bin.equals(b.bin)) {
                    hit = b;
                    break;
                }
            }
            if (hit != null) {
                ordered.add(hit);
            }
        }
        return ordered;
    }

    /** 图 5：歌手活跃年份跨度 TOP N（作品数 >= 3，两年份均非空） */
    public List<ArtistSpan> topSpans(int limit) {
        return songMapper.selectTopSpans(normalizeLimit(limit, 20, 100));
    }

    /** 图 6：热度 × 时长 全量散点（28,356 点） */
    public Map<String, Object> popularityDuration() {
        List<SongPoint> points = songMapper.selectPopularityDuration();
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("total", points.size());
        result.put("points", points);
        return result;
    }

    private static int normalizeLimit(int limit, int def, int max) {
        if (limit <= 0) {
            return def;
        }
        return Math.min(limit, max);
    }
}
