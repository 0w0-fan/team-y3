package new_com.spotify2.controller2;

import new_com.spotify2.common2.Result2;
import new_com.spotify2.service2.TrackService2;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * 方向六 · 曲目明细 CRUD 接口
 *
 *   GET    /api/tracks?page=1&size=15&kw=&genre=&yearFrom=&yearTo=   查（分页 + 条件）
 *   GET    /api/tracks/{id}                                          查单条
 *   POST   /api/tracks                                               增
 *   PUT    /api/tracks/{id}                                          改
 *   DELETE /api/tracks/{id}                                          删
 *
 * 与 StatsController2 的分工：这边动数据，那边只读聚合。
 * 写操作成功返回受影响后的那条记录，前端拿到就能直接刷新表格行，不用再查一次。
 */
@RestController("trackCrudController")
@RequestMapping("/api/tracks")
public class TrackController2 {

    @Autowired
    private TrackService2 tracks;

    /** 查：不传 page/size 时默认第 1 页 15 条 */
    @GetMapping
    public Result2<Map<String, Object>> list(
            @RequestParam(name = "page", defaultValue = "1") int page,
            @RequestParam(name = "size", defaultValue = "15") int size,
            @RequestParam(name = "kw", required = false) String kw,
            @RequestParam(name = "genre", required = false) String genre,
            @RequestParam(name = "yearFrom", required = false) Integer yearFrom,
            @RequestParam(name = "yearTo", required = false) Integer yearTo) {
        return Result2.ok(tracks.list(page, size, kw, genre, yearFrom, yearTo));
    }

    /** 查单条：编辑前回填表单 */
    @GetMapping("/{id}")
    public Result2<Map<String, Object>> get(@PathVariable("id") String id) {
        return Result2.ok(tracks.get(id));
    }

    /** 增 */
    @PostMapping
    public Result2<Map<String, Object>> create(@RequestBody Map<String, Object> body) {
        return Result2.ok(tracks.create(body));
    }

    /** 改 */
    @PutMapping("/{id}")
    public Result2<Map<String, Object>> update(@PathVariable("id") String id,
                                               @RequestBody Map<String, Object> body) {
        return Result2.ok(tracks.update(id, body));
    }

    /** 删 */
    @DeleteMapping("/{id}")
    public Result2<Map<String, Object>> delete(@PathVariable("id") String id) {
        int n = tracks.delete(id);
        return Result2.ok(java.util.Collections.singletonMap("deleted", n));
    }
}
