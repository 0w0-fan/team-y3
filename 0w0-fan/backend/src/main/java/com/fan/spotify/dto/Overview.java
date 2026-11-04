package com.fan.spotify.dto;

/**
 * 大屏顶部概览指标，全部来自数据库实时统计。
 */
public class Overview {

    /** 主表行数（歌曲-歌单记录数） */
    public long rows;
    /** 去重后歌曲数 */
    public long songs;
    /** 唯一歌手数 */
    public long artists;
    /** 唯一专辑数 */
    public long albums;
    /** 全局平均热度（主表口径，四象限 y 分割线用它） */
    public double avgPopularity;
    /** 去重视图口径的平均热度（参考值） */
    public double avgPopularityDedup;
    /** 关注歌手数 */
    public long favorites;
    /** 标签数 */
    public long tags;

    public Overview() {
    }
}
