package com.fan.spotify.dto;

/**
 * 收藏歌曲 / 打标签的请求体。
 *
 * <p>两种用法：</p>
 * <ul>
 *   <li>从搜索结果里选中的歌：{@code trackId} 有值（Spotify 的 base62 id），
 *       {@code songName} 带上是歌名，服务端会判断它是不是库里的歌；</li>
 *   <li>自己手输、库里没有的歌：{@code trackId} 留空，只给 {@code songName}，
 *       服务端会生成一个 custom: 开头的占位 id，并标记 in_dataset=false。</li>
 * </ul>
 */
public class TagRequest {

    /** 歌曲 ID，可为空（手输歌曲时为空） */
    public String trackId;

    /** 歌名，手输歌曲时必填 */
    public String songName;

    /** 标签；不填时服务端会用默认的「收藏」 */
    public String tagName;

    public TagRequest() {
    }
}
