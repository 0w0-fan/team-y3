# -*- coding: utf-8 -*-
"""
Spotify 流派大屏 — 方向一（流派与子流派的流行度结构与演进）
数据清洗 + 六张图聚合预计算

输入 : C:\\Users\\yyx\\Desktop\\实践数据\\data.csv        （原始 32,833 x 23）
输出 : 本目录下
        genre_songs_clean.csv      清洗后的明细宽表（导入 MySQL 用）
        genre_dashboard_data.xlsx  六张图的聚合结果 + 数据字典 + 清洗日志
        clean_report.json          机器可读的校验基准（接口对数字用）

设计原则
  1) 不删行、不去重。每一行都带有效的流派/子流派/热度，删了只会让口径对不上。
     重复 track_id 是"同一首歌进了多个歌单"，跨流派的占 1,687 个，去重会破坏供给口径。
  2) 只做"空值转 NULL / 派生列 / 质量标记"这三件事，不改任何原始数值。
  3) 所有派生规则写死在 DERIVE 节，改规则必须同步改任务文档。

运行（必须用装了 pymysql/openpyxl 的那个解释器）：
  C:\\Users\\yyx\\.workbuddy\\binaries\\python\\envs\\default\\Scripts\\python.exe 01_clean_and_aggregate.py
"""
import csv
import json
import os
import re
from collections import Counter, defaultdict

RAW = r"C:\Users\yyx\Desktop\实践数据\data.csv"
OUT_DIR = os.path.dirname(os.path.abspath(__file__))

AUDIO7 = ["danceability", "energy", "speechiness", "acousticness",
          "instrumentalness", "liveness", "valence"]
GENRES = ["pop", "rap", "rock", "latin", "r&b", "edm"]          # 固定顺序，前端配色按此
BINS = [(0, 20, "0-20"), (21, 40, "21-40"), (41, 60, "41-60"),
        (61, 80, "61-80"), (81, 100, "81-100")]
YEAR_FROM, YEAR_TO = 1990, 2019                                  # 趋势图区间


def fnum(s):
    """空串 -> None，其余转 float。原始数据里没有脏数值，保留异常值不拦截。"""
    s = (s or "").strip()
    if s == "":
        return None
    return float(s)


def snone(v):
    """文本列的缺失值归一：空串 / 'NA' / 'N/A' / 'null' 一律转 None。
    原始数据里有 5 行把缺失写成了字面量 'NA'，不处理会在页面 tooltip 里显示成 "NA" 歌手。"""
    v = (v or "").strip()
    if v == "" or v.upper() in ("NA", "N/A", "NULL", "NONE", "NAN"):
        return None
    return v


def parse_date(s):
    """三格式解析：YYYY-MM-DD / YYYY-MM / YYYY -> (year, month, precision)"""
    s = (s or "").strip()
    m = re.match(r"^(\d{4})-(\d{2})-(\d{2})$", s)
    if m:
        return int(m.group(1)), int(m.group(2)), "day"
    m = re.match(r"^(\d{4})-(\d{2})$", s)
    if m:
        return int(m.group(1)), int(m.group(2)), "month"
    m = re.match(r"^(\d{4})$", s)
    if m:
        return int(m.group(1)), None, "year"     # 只有年份，月份必须留空，不能补 1 月
    raise ValueError("无法解析的日期: %r" % s)


def pop_bin(p):
    for lo, hi, label in BINS:
        if lo <= p <= hi:
            return label
    raise ValueError("热度越界: %r" % p)


def clean():
    with open(RAW, encoding="utf-8-sig", newline="") as f:
        rows = list(csv.DictReader(f))

    log = {"raw_rows": len(rows)}
    out = []
    flag_counter = Counter()

    for i, r in enumerate(rows, start=1):
        year, month, precision = parse_date(r["track_album_release_date"])
        pop = int(float(r["track_popularity"]))

        tempo = fnum(r["tempo"])
        track_name = snone(r["track_name"])
        flags = []
        if tempo is None or tempo == 0:        # 0 BPM 物理上不可能，视为缺失
            flags.append("tempo_missing")
            tempo = None
        if track_name is None:
            flags.append("meta_missing")
        dur_ms = fnum(r["duration_ms"])
        dur_sec = int(round(dur_ms / 1000.0))
        if dur_sec < 30:
            flags.append("short_track")
        elif dur_sec > 900:
            flags.append("long_track")

        quality = ",".join(flags) if flags else "ok"
        for x in flags:
            flag_counter[x] += 1

        rec = {
            "id": i,
            "track_id": r["track_id"],
            "track_name": track_name,
            "track_artist": snone(r["track_artist"]),
            "playlist_id": r["playlist_id"],
            "playlist_name": r["playlist_name"],
            "playlist_genre": r["playlist_genre"].strip(),
            "playlist_subgenre": r["playlist_subgenre"].strip(),
            "track_popularity": pop,
            "popularity_bin": pop_bin(pop),
            "release_year": year,
            "release_month": month,
            "date_precision": precision,
            "danceability": fnum(r["danceability"]),
            "energy": fnum(r["energy"]),
            "speechiness": fnum(r["speechiness"]),
            "acousticness": fnum(r["acousticness"]),
            "instrumentalness": fnum(r["instrumentalness"]),
            "liveness": fnum(r["liveness"]),
            "valence": fnum(r["valence"]),
            "tempo": tempo,
            "loudness": fnum(r["loudness"]),
            "duration_sec": dur_sec,
            "quality_flag": quality,
        }
        out.append(rec)

    log["clean_rows"] = len(out)
    log["dropped_rows"] = log["raw_rows"] - log["clean_rows"]
    log["flag_counter"] = dict(flag_counter)
    log["genres"] = dict(Counter(x["playlist_genre"] for x in out))
    log["subgenre_count"] = len(set(x["playlist_subgenre"] for x in out))
    log["distinct_track_id"] = len(set(x["track_id"] for x in out))
    log["date_precision"] = dict(Counter(x["date_precision"] for x in out))
    log["year_range"] = [min(x["release_year"] for x in out),
                         max(x["release_year"] for x in out)]
    return out, log


# ---------------------------------------------------------------- 聚合
def agg_summary(rows):
    total = len(rows)
    res = []
    for g in GENRES:
        v = [x["track_popularity"] for x in rows if x["playlist_genre"] == g]
        v_sorted = sorted(v)
        n = len(v)
        median = (v_sorted[(n - 1) // 2] + v_sorted[n // 2]) / 2.0
        res.append({
            "genre": g, "songCount": n,
            "share": round(n * 100.0 / total, 2),
            "avgPopularity": round(sum(v) / n, 2),
            "medianPopularity": round(median, 0),
        })
    res.sort(key=lambda x: -x["songCount"])
    return res


def agg_subgenre(rows):
    d = defaultdict(list)
    for x in rows:
        d[(x["playlist_genre"], x["playlist_subgenre"])].append(x["track_popularity"])
    items = [{"genre": g, "subgenre": s, "songCount": len(v),
              "avgPopularity": round(sum(v) / len(v), 2)}
             for (g, s), v in d.items()]
    items.sort(key=lambda x: -x["avgPopularity"])
    for i, it in enumerate(items, start=1):
        it["rank"] = i
        it["inTop15"] = i <= 15
    return items


def agg_trend(rows):
    tab = defaultdict(Counter)
    for x in rows:
        if YEAR_FROM <= x["release_year"] <= YEAR_TO:
            tab[x["release_year"]][x["playlist_genre"]] += 1
    years = list(range(YEAR_FROM, YEAR_TO + 1))
    series = [{"genre": g, "values": [tab[y][g] for y in years],
               "total": sum(tab[y][g] for y in years)} for g in GENRES]
    return {"years": years, "series": series,
            "grandTotal": sum(sum(s["values"]) for s in series)}


def agg_radar(rows):
    raw = {}
    for g in GENRES:
        v = [x for x in rows if x["playlist_genre"] == g]
        raw[g] = {k: sum(float(x[k]) for x in v) / len(v) for k in AUDIO7}
    norm = {g: {} for g in GENRES}
    for k in AUDIO7:
        lo = min(raw[g][k] for g in GENRES)
        hi = max(raw[g][k] for g in GENRES)
        for g in GENRES:
            norm[g][k] = round((raw[g][k] - lo) / (hi - lo) * 100, 1) if hi > lo else 50.0
    return {
        "features": AUDIO7,
        "max": 100,
        "series": [{"genre": g,
                    "values": [norm[g][k] for k in AUDIO7],
                    "raw": {k: round(raw[g][k], 4) for k in AUDIO7}} for g in GENRES],
    }


def agg_bins(rows):
    res = []
    for lo, hi, label in BINS:
        sub = [x for x in rows if x["popularity_bin"] == label]
        cnt = Counter(x["playlist_genre"] for x in sub)
        t = len(sub)
        res.append({
            "label": label, "total": t,
            "counts": {g: cnt[g] for g in GENRES},
            "shares": {g: round(cnt[g] * 100.0 / t, 2) for g in GENRES},
        })
    return res


def agg_sankey(rows):
    nodes = [{"name": g, "layer": 0,
              "value": sum(1 for x in rows if x["playlist_genre"] == g)} for g in GENRES]
    links = []
    d = Counter((x["playlist_genre"], x["playlist_subgenre"]) for x in rows)
    for (g, s), v in d.items():
        nodes.append({"name": s, "layer": 1, "value": v})
        links.append({"source": g, "target": s, "value": v})
    links.sort(key=lambda x: -x["value"])
    return {"nodes": nodes, "links": links}


def sensitivity(rows):
    """敏感性：剔除 meta_missing 的占位行后，各流派平均热度变动多少、排序是否改变。
    用来回答答辩必问的「那 5 条 NA 记录你们怎么处理了」。"""
    keep = [x for x in rows if "meta_missing" not in x["quality_flag"]]

    def avg_map(rs):
        d = defaultdict(list)
        for x in rs:
            d[x["playlist_genre"]].append(x["track_popularity"])
        return {g: sum(v) / len(v) for g, v in d.items()}

    a, b = avg_map(rows), avg_map(keep)
    return {
        "rowsKept": len(keep),
        "avgDeltaByGenre": {g: round(b[g] - a[g], 3) for g in GENRES},
        "maxAbsDelta": round(max(abs(b[g] - a[g]) for g in GENRES), 3),
        "rankUnchanged": (sorted(a, key=lambda g: -a[g]) == sorted(b, key=lambda g: -b[g])),
    }


# ---------------------------------------------------------------- 输出
def write_csv(rows):
    path = os.path.join(OUT_DIR, "genre_songs_clean.csv")
    cols = list(rows[0].keys())
    with open(path, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=cols)
        w.writeheader()
        w.writerows(rows)
    return path, cols


def write_xlsx(summary, subgenre, trend, radar, bins, sankey, log):
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill, Alignment
    from openpyxl.utils import get_column_letter

    head_font = Font(bold=True, color="FFFFFF", size=11)
    head_fill = PatternFill("solid", fgColor="1F4E79")
    title_font = Font(bold=True, size=13, color="1F4E79")

    wb = Workbook()

    def style(ws, widths, freeze="A2"):
        for i, wd in enumerate(widths, start=1):
            ws.column_dimensions[get_column_letter(i)].width = wd
        for c in ws[1]:
            c.font = head_font
            c.fill = head_fill
            c.alignment = Alignment(horizontal="center", vertical="center")
        ws.freeze_panes = freeze

    # 00 说明
    ws = wb.active
    ws.title = "00_说明与口径"
    ws["A1"] = "Spotify 流派大屏 · 方向一 数据清洗与口径说明"
    ws["A1"].font = title_font
    lines = [
        ("原始数据", os.path.basename(RAW) + "（32,833 行 × 23 列）"),
        ("清洗后明细", "genre_songs_clean.csv（32,833 行 × 24 列，未删任何行）"),
        ("粒度", "一条记录 = 一首歌出现在一个歌单里；同一首歌可出现在多个歌单"),
        ("为什么不去重", "3,166 个重复 track_id 中有 1,687 个跨流派，去重会破坏供给口径"),
        ("派生列 release_year", "从 track_album_release_date 取前 4 位"),
        ("派生列 release_month", "仅 YYYY-MM / YYYY-MM-DD 有值；只有年份的 1,855 行留空，不能补 1 月"),
        ("派生列 popularity_bin", "0-20 / 21-40 / 41-60 / 61-80 / 81-100，边界含本数"),
        ("派生列 duration_sec", "duration_ms / 1000 四舍五入"),
        ("tempo 处理", "1 条 tempo=0 视为缺失置 NULL（0 BPM 物理不可能）"),
        ("quality_flag", "ok / tempo_missing / meta_missing / short_track / long_track，多标记逗号分隔"),
        ("趋势图区间", "1990–2019（2020 仅 785 行，抓取时点截断，画进去会变成假断崖）"),
        ("雷达口径", "7 个音频特征，每特征在 6 流派间 min-max 归一到 0–100；不含 tempo/loudness/duration"),
        ("结论表述边界", "本数据集是固定歌单采样，兴衰只能表述为「歌单供给结构变化」，不是全球产量"),
    ]
    ws["A2"] = "项目"
    ws["B2"] = "内容"
    for c in ("A2", "B2"):
        ws[c].font = head_font
        ws[c].fill = head_fill
    for i, (k, v) in enumerate(lines, start=3):
        ws.cell(row=i, column=1, value=k).font = Font(bold=True)
        ws.cell(row=i, column=2, value=v)
    ws.column_dimensions["A"].width = 24
    ws.column_dimensions["B"].width = 96

    # 01 流派汇总
    ws = wb.create_sheet("01_流派汇总")
    ws.append(["流派", "歌曲数", "占比%", "平均热度", "中位热度"])
    for x in summary:
        ws.append([x["genre"], x["songCount"], x["share"],
                   x["avgPopularity"], x["medianPopularity"]])
    style(ws, [12, 12, 10, 12, 12])

    # 02 子流派
    ws = wb.create_sheet("02_子流派全量")
    ws.append(["排名", "流派", "子流派", "歌曲数", "平均热度", "是否TOP15"])
    for x in subgenre:
        ws.append([x["rank"], x["genre"], x["subgenre"], x["songCount"],
                   x["avgPopularity"], "是" if x["inTop15"] else ""])
    style(ws, [8, 10, 30, 10, 12, 12])

    # 03 年份 x 流派
    ws = wb.create_sheet("03_年份x流派")
    ws.append(["年份"] + GENRES + ["合计"])
    for idx, y in enumerate(trend["years"]):
        row = [y] + [s["values"][idx] for s in trend["series"]]
        row.append(sum(s["values"][idx] for s in trend["series"]))
        ws.append(row)
    ws.append(["合计"] + [s["total"] for s in trend["series"]] + [trend["grandTotal"]])
    for c in ws[ws.max_row]:
        c.font = Font(bold=True)
    style(ws, [8] + [9] * len(GENRES) + [10])

    # 04 桑基
    ws = wb.create_sheet("04_流派子流派构成")
    ws.append(["流派", "子流派", "歌曲数"])
    for lk in sankey["links"]:
        ws.append([lk["source"], lk["target"], lk["value"]])
    style(ws, [10, 30, 10])

    # 05 雷达
    ws = wb.create_sheet("05_音频特征雷达")
    ws.append(["流派"] + AUDIO7 + ["—"] + [k + "_归一" for k in AUDIO7])
    for s in radar["series"]:
        ws.append([s["genre"]] + [s["raw"][k] for k in AUDIO7] + ["→"] + s["values"])
    style(ws, [10] + [16] * len(AUDIO7) + [4] + [18] * len(AUDIO7))

    # 06 分箱
    ws = wb.create_sheet("06_热度分箱x流派")
    ws.append(["热度分箱", "合计"] + [g + "_数" for g in GENRES] + [g + "_占比%" for g in GENRES])
    for b in bins:
        ws.append([b["label"], b["total"]] +
                  [b["counts"][g] for g in GENRES] +
                  [b["shares"][g] for g in GENRES])
    style(ws, [12, 10] + [10] * len(GENRES) + [12] * len(GENRES))

    # 07 数据字典
    ws = wb.create_sheet("07_数据字典")
    ws.append(["字段", "类型", "含义", "来源/规则"])
    dic = [
        ("id", "INT", "行号主键 1..32833", "CSV 行序，仅作主键"),
        ("track_id", "VARCHAR(32)", "Spotify 曲目 ID", "原样"),
        ("track_name", "VARCHAR(512)", "曲名", "空值转 NULL（5 行）"),
        ("track_artist", "VARCHAR(512)", "歌手", "空值转 NULL（5 行）"),
        ("playlist_id", "VARCHAR(64)", "歌单 ID", "原样，471 个"),
        ("playlist_name", "VARCHAR(160)", "歌单名", "原样，449 个"),
        ("playlist_genre", "VARCHAR(16)", "流派", "原样，6 值"),
        ("playlist_subgenre", "VARCHAR(48)", "子流派", "原样，24 值，一对一归属流派"),
        ("track_popularity", "TINYINT", "热度 0-100", "原样整数"),
        ("popularity_bin", "VARCHAR(8)", "热度分箱", "派生 CASE 分档"),
        ("release_year", "SMALLINT", "发行年 1957-2020", "日期串前 4 位"),
        ("release_month", "TINYINT NULL", "发行月", "仅日和月精度有值，1,855 行为 NULL"),
        ("date_precision", "VARCHAR(8)", "日期精度", "day/month/year"),
        ("danceability", "DOUBLE", "可舞性 0-1", "原样"),
        ("energy", "DOUBLE", "能量 0-1", "原样"),
        ("speechiness", "DOUBLE", "口语度 0-1", "原样"),
        ("acousticness", "DOUBLE", "原声度 0-1", "原样"),
        ("instrumentalness", "DOUBLE", "器乐度 0-1", "原样，12,089 行 =0"),
        ("liveness", "DOUBLE", "现场感 0-1", "原样"),
        ("valence", "DOUBLE", "愉悦度 0-1", "原样"),
        ("tempo", "DOUBLE NULL", "BPM", "0 视为缺失置 NULL（1 行）"),
        ("loudness", "DOUBLE", "响度 dB", "原样，-46.45 ~ 1.28"),
        ("duration_sec", "INT", "时长秒", "duration_ms/1000"),
        ("quality_flag", "VARCHAR(32)", "质量标记", "ok/…，见 00_说明"),
    ]
    for d in dic:
        ws.append(list(d))
    style(ws, [20, 16, 26, 44])

    # 08 清洗日志
    ws = wb.create_sheet("08_清洗日志")
    ws.append(["检查项", "结果"])
    items = [
        ("原始行数", log["raw_rows"]),
        ("清洗后行数", log["clean_rows"]),
        ("删除行数", log["dropped_rows"]),
        ("唯一 track_id", log["distinct_track_id"]),
        ("流派数", len(log["genres"])),
        ("子流派数", log["subgenre_count"]),
        ("日期精度分布", json.dumps(log["date_precision"], ensure_ascii=False)),
        ("年份范围", "{}–{}".format(*log["year_range"])),
        ("质量标记计数", json.dumps(log["flag_counter"], ensure_ascii=False)),
        ("各流派行数", json.dumps(log["genres"], ensure_ascii=False)),
    ]
    for k, v in items:
        ws.append([k, v])
    style(ws, [20, 70])

    path = os.path.join(OUT_DIR, "genre_dashboard_data.xlsx")
    wb.save(path)
    return path


def main():
    rows, log = clean()
    csv_path, cols = write_csv(rows)

    summary = agg_summary(rows)
    subgenre = agg_subgenre(rows)
    trend = agg_trend(rows)
    radar = agg_radar(rows)
    bins = agg_bins(rows)
    sankey = agg_sankey(rows)

    xlsx_path = write_xlsx(summary, subgenre, trend, radar, bins, sankey, log)
    sens = sensitivity(rows)

    report = {
        "log": log,
        "summary": summary,
        "subgenreTop15": [x for x in subgenre if x["inTop15"]],
        "trend": trend,
        "radar": radar,
        "bins": bins,
        "sankey": {"nodeCount": len(sankey["nodes"]), "linkCount": len(sankey["links"]),
                   "links": sankey["links"]},
        "sensitivity": sens,
    }
    rp = os.path.join(OUT_DIR, "clean_report.json")
    with open(rp, "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)

    print("=" * 62)
    print("清洗完成")
    print("  明细 CSV :", csv_path, "列数", len(cols))
    print("  聚合 XLSX:", xlsx_path)
    print("  校验 JSON:", rp)
    print("  行数 %d -> %d（删除 %d）" % (log["raw_rows"], log["clean_rows"], log["dropped_rows"]))
    print("  质量标记 :", log["flag_counter"])
    print("-" * 62)
    print("流派汇总:")
    for x in summary:
        print("  %-6s n=%-5d %5.2f%%  avg=%.2f  median=%.0f" %
              (x["genre"], x["songCount"], x["share"], x["avgPopularity"], x["medianPopularity"]))
    print("子流派 TOP15:")
    for x in report["subgenreTop15"]:
        print("  %2d %-6s %-28s n=%-5d avg=%.2f" %
              (x["rank"], x["genre"], x["subgenre"], x["songCount"], x["avgPopularity"]))
    print("趋势: %d 年 x %d 系列, 合计 %d" %
          (len(trend["years"]), len(trend["series"]), trend["grandTotal"]))
    print("雷达: rap.danceability=%.1f, r&b.energy=%.1f" %
          (radar["series"][1]["values"][0], radar["series"][4]["values"][1]))
    print("分箱: %s" % ", ".join("%s=%d" % (b["label"], b["total"]) for b in bins))
    print("桑基: %d 节点 / %d 连线" % (len(sankey["nodes"]), len(sankey["links"])))
    print("敏感性: 剔除 meta_missing 后最大变动 %.3f 分，排序是否不变=%s" %
          (sens["maxAbsDelta"], sens["rankUnchanged"]))
    print("=" * 62)


if __name__ == "__main__":
    main()
