package org.springboot.demo.pojo;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.ToString;

import java.util.List;

@Data
@NoArgsConstructor
@AllArgsConstructor
@ToString
public class Article {
    private Integer id;
    private String title;
    private String content;
    private List<Comment> commentList;
}
