package com.spotify.dashboard.service;

import com.spotify.dashboard.dto.BinCountRow;
import com.spotify.dashboard.dto.BinResponse;
import com.spotify.dashboard.dto.FeatureAvgRow;
import com.spotify.dashboard.dto.GenreSummary;
import com.spotify.dashboard.dto.MedianRow;
import com.spotify.dashboard.dto.RadarResponse;
import com.spotify.dashboard.dto.SankeyResponse;
import com.spotify.dashboard.dto.SankeyRow;
import com.spotify.dashboard.dto.SubGenreRankItem;
import com.spotify.dashboard.dto.SubGenreRankResponse;
import com.spotify.dashboard.dto.SummaryResponse;
import com.spotify.dashboard.dto.TrendResponse;
import com.spotify.dashboard.dto.TrendRow;
import com.spotify.dashboard.mapper.SpotifyMapper;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 六张图的取数与换算。基数都是 spotify_songs 全量 32,833 行，不去重、不过滤，
 * 只有趋势图在 SQL 里限定 1990-2019。
 */
@Service
public class DashboardService {

    // 顺序和前端配色表一致，趋势图 series、雷达、分箱都按它输出
    public static final List<String> GENRE_ORDER =
            Collections.unmodifiableList(Arrays.asList("pop", "rap", "rock", "latin", "r&b", "edm"));

    // 雷达用的 7 个维度，tempo / loudness / duration 量纲差太远，没放进来
    public static final List<String> FEATURES = Collections.unmodifiableList(Arrays.asList(
            "danceability", "energy", "speechiness", "acousticness",
            "instrumentalness", "liveness", "valence"));

    private static final String[] BIN_LABELS = {"0-20", "21-40", "41-60", "61-80", "81-100"};

    private final SpotifyMapper mapper;

    public DashboardService(SpotifyMapper mapper) {
        this.mapper = mapper;
    }

    public long totalSongs() {
        return mapper.countAll();
    }

    public SummaryResponse summary() {
        long total = mapper.countAll();
        List<GenreSummary> genres = mapper.selectGenreSummary();
        Map<String, Integer> medians = new HashMap<String, Integer>();
        for (MedianRow row : mapper.selectMedianPopularity()) {
            medians.put(row.getGenre(), row.getMedianPop());
        }
        for (GenreSummary g : genres) {
            g.setShare(round2(g.getSongCount() * 100.0 / total));
            g.setMedianPopularity(medians.get(g.getGenre()));
        }
        return new SummaryResponse((int) total, "playlist_track_row", genres);
    }

    // 透视成 30×6，缺的 (年, 流派) 组合补 0，实测只有 178 行
    public TrendResponse trend(int from, int to) {
        int start = Math.min(from, to);
        int end = Math.max(from, to);
        // 数据实际是 1957-2020，传超了就往回收一下
        start = Math.max(1957, start);
        end = Math.min(2020, end);
        if (start > end) {
            start = 1990;
            end = 2019;
        }

        int size = end - start + 1;
        int[][] matrix = new int[GENRE_ORDER.size()][size];

        for (TrendRow row : mapper.selectTrend(start, end)) {
            int gi = GENRE_ORDER.indexOf(row.getGenre());
            int yi = row.getYear() - start;
            if (gi >= 0 && yi >= 0 && yi < size) {
                matrix[gi][yi] = row.getSongCount() == null ? 0 : row.getSongCount();
            }
        }

        List<Integer> years = new ArrayList<Integer>(size);
        for (int y = start; y <= end; y++) {
            years.add(y);
        }

        List<TrendResponse.Series> series = new ArrayList<TrendResponse.Series>();
        int grandTotal = 0;
        for (int gi = 0; gi < GENRE_ORDER.size(); gi++) {
            List<Integer> values = new ArrayList<Integer>(size);
            int sum = 0;
            for (int yi = 0; yi < size; yi++) {
                values.add(matrix[gi][yi]);
                sum += matrix[gi][yi];
            }
            grandTotal += sum;
            series.add(new TrendResponse.Series(GENRE_ORDER.get(gi), values, sum));
        }

        TrendResponse resp = new TrendResponse();
        resp.setYears(years);
        resp.setSeries(series);
        resp.setGrandTotal(grandTotal);
        return resp;
    }

    public SubGenreRankResponse subGenreRank(int top) {
        int totalSub = mapper.countSubGenres();
        int limit = Math.max(1, Math.min(top, totalSub <= 0 ? 1 : totalSub));
        List<SubGenreRankItem> items = mapper.selectSubGenreRank(limit);
        for (int i = 0; i < items.size(); i++) {
            items.get(i).setRank(i + 1);
        }
        return new SubGenreRankResponse(limit, totalSub, items);
    }

    // 每个维度在 6 个流派之间 min-max 到 0-100，原始均值一起返回给 tooltip
    public RadarResponse radar() {
        List<FeatureAvgRow> rows = mapper.selectFeatureAvg();
        Map<String, FeatureAvgRow> byGenre = new HashMap<String, FeatureAvgRow>();
        for (FeatureAvgRow row : rows) {
            byGenre.put(row.getGenre(), row);
        }

        int gCount = GENRE_ORDER.size();
        int fCount = FEATURES.size();
        double[][] raw = new double[gCount][fCount];
        for (int gi = 0; gi < gCount; gi++) {
            FeatureAvgRow row = byGenre.get(GENRE_ORDER.get(gi));
            raw[gi] = vectorOf(row);
        }

        double[] min = new double[fCount];
        double[] max = new double[fCount];
        for (int fi = 0; fi < fCount; fi++) {
            min[fi] = Double.MAX_VALUE;
            max[fi] = -Double.MAX_VALUE;
            for (int gi = 0; gi < gCount; gi++) {
                min[fi] = Math.min(min[fi], raw[gi][fi]);
                max[fi] = Math.max(max[fi], raw[gi][fi]);
            }
        }

        List<RadarResponse.Series> series = new ArrayList<RadarResponse.Series>();
        for (int gi = 0; gi < gCount; gi++) {
            List<Double> values = new ArrayList<Double>(fCount);
            Map<String, Double> rawMap = new LinkedHashMap<String, Double>();
            for (int fi = 0; fi < fCount; fi++) {
                double span = max[fi] - min[fi];
                double norm = span == 0 ? 0.0 : (raw[gi][fi] - min[fi]) / span * 100.0;
                values.add(round1(norm));
                rawMap.put(FEATURES.get(fi), round4(raw[gi][fi]));
            }
            RadarResponse.Series s = new RadarResponse.Series();
            s.setGenre(GENRE_ORDER.get(gi));
            s.setValues(values);
            s.setRaw(rawMap);
            series.add(s);
        }

        RadarResponse resp = new RadarResponse();
        resp.setFeatures(FEATURES);
        resp.setMax(100);
        resp.setSeries(series);
        return resp;
    }

    private double[] vectorOf(FeatureAvgRow row) {
        if (row == null) {
            return new double[FEATURES.size()];
        }
        return new double[]{
                nz(row.getDanceability()), nz(row.getEnergy()), nz(row.getSpeechiness()),
                nz(row.getAcousticness()), nz(row.getInstrumentalness()), nz(row.getLiveness()),
                nz(row.getValence())
        };
    }

    public BinResponse bin() {
        Map<String, Map<String, Integer>> counts = new LinkedHashMap<String, Map<String, Integer>>();
        for (String label : BIN_LABELS) {
            Map<String, Integer> inner = new LinkedHashMap<String, Integer>();
            for (String g : GENRE_ORDER) {
                inner.put(g, 0);
            }
            counts.put(label, inner);
        }

        for (BinCountRow row : mapper.selectBinCount()) {
            Map<String, Integer> inner = counts.get(row.getPopBin());
            if (inner != null && inner.containsKey(row.getGenre())) {
                inner.put(row.getGenre(), row.getSongCount() == null ? 0 : row.getSongCount());
            }
        }

        List<BinResponse.Bin> bins = new ArrayList<BinResponse.Bin>();
        for (Map.Entry<String, Map<String, Integer>> entry : counts.entrySet()) {
            int total = 0;
            for (Integer v : entry.getValue().values()) {
                total += v;
            }
            Map<String, Double> shares = new LinkedHashMap<String, Double>();
            for (Map.Entry<String, Integer> e : entry.getValue().entrySet()) {
                shares.put(e.getKey(), total == 0 ? 0.0 : round2(e.getValue() * 100.0 / total));
            }
            BinResponse.Bin item = new BinResponse.Bin();
            item.setLabel(entry.getKey());
            item.setTotal(total);
            item.setCounts(entry.getValue());
            item.setShares(shares);
            bins.add(item);
        }

        BinResponse resp = new BinResponse();
        resp.setBins(bins);
        return resp;
    }

    public SankeyResponse sankey() {
        List<SankeyRow> rows = mapper.selectSankey();

        Map<String, Integer> genreTotals = new LinkedHashMap<String, Integer>();
        for (String g : GENRE_ORDER) {
            genreTotals.put(g, 0);
        }

        List<SankeyResponse.Link> links = new ArrayList<SankeyResponse.Link>();
        for (SankeyRow row : rows) {
            int v = row.getValue() == null ? 0 : row.getValue();
            links.add(new SankeyResponse.Link(row.getSrc(), row.getDst(), v));
            if (genreTotals.containsKey(row.getSrc())) {
                genreTotals.put(row.getSrc(), genreTotals.get(row.getSrc()) + v);
            }
        }

        List<SankeyResponse.Node> nodes = new ArrayList<SankeyResponse.Node>();
        for (String g : GENRE_ORDER) {
            nodes.add(new SankeyResponse.Node(g, 0, genreTotals.get(g)));
        }
        // 子流派节点：先按所属流派固定顺序，再按歌曲数降序，保证布局稳定
        for (String g : GENRE_ORDER) {
            List<SankeyRow> children = new ArrayList<SankeyRow>();
            for (SankeyRow row : rows) {
                if (g.equals(row.getSrc())) {
                    children.add(row);
                }
            }
            Collections.sort(children, (a, b) -> {
                int va = a.getValue() == null ? 0 : a.getValue();
                int vb = b.getValue() == null ? 0 : b.getValue();
                if (va != vb) {
                    return vb - va;
                }
                return a.getDst().compareTo(b.getDst());
            });
            for (SankeyRow row : children) {
                nodes.add(new SankeyResponse.Node(row.getDst(), 1, row.getValue() == null ? 0 : row.getValue()));
            }
        }

        SankeyResponse resp = new SankeyResponse();
        resp.setNodes(nodes);
        resp.setLinks(links);
        return resp;
    }

    private static double nz(Double v) {
        return v == null ? 0.0 : v;
    }

    private static double round1(double v) {
        return Math.round(v * 10.0) / 10.0;
    }

    private static double round2(double v) {
        return Math.round(v * 100.0) / 100.0;
    }

    private static double round4(double v) {
        return Math.round(v * 10000.0) / 10000.0;
    }
}
