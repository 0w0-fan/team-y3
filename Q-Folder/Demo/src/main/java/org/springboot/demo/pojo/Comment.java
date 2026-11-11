package org.springboot.demo.pojo;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.ToString;

@Data
@NoArgsConstructor
@AllArgsConstructor
@ToString
public class Comment {
    private Integer id;
    private String content;
    private String author;
    private Integer aId;
//  在mybatis中可以配置   下划线（数据库规范）  驼峰（Java规范）  的映射。
}
