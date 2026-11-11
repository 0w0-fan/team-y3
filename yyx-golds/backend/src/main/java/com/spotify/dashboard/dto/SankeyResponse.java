package com.spotify.dashboard.dto;

import java.util.List;

/**
 * /api/genre/sankey 响应体：30 个节点（6 流派 + 24 子流派）、24 条连线。
 */
public class SankeyResponse {

    private List<Node> nodes;
    private List<Link> links;

    public List<Node> getNodes() {
        return nodes;
    }

    public void setNodes(List<Node> nodes) {
        this.nodes = nodes;
    }

    public List<Link> getLinks() {
        return links;
    }

    public void setLinks(List<Link> links) {
        this.links = links;
    }

    public static class Node {

        private String name;
        private int layer;
        private int value;

        public Node() {
        }

        public Node(String name, int layer, int value) {
            this.name = name;
            this.layer = layer;
            this.value = value;
        }

        public String getName() {
            return name;
        }

        public void setName(String name) {
            this.name = name;
        }

        public int getLayer() {
            return layer;
        }

        public void setLayer(int layer) {
            this.layer = layer;
        }

        public int getValue() {
            return value;
        }

        public void setValue(int value) {
            this.value = value;
        }
    }

    public static class Link {

        private String source;
        private String target;
        private int value;

        public Link() {
        }

        public Link(String source, String target, int value) {
            this.source = source;
            this.target = target;
            this.value = value;
        }

        public String getSource() {
            return source;
        }

        public void setSource(String source) {
            this.source = source;
        }

        public String getTarget() {
            return target;
        }

        public void setTarget(String target) {
            this.target = target;
        }

        public int getValue() {
            return value;
        }

        public void setValue(int value) {
            this.value = value;
        }
    }
}
