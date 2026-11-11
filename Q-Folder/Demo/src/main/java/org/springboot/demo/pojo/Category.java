package org.springboot.demo.pojo;

import lombok.*;
import java.util.Date;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@ToString
public class Category {
    private Integer id;

    private String name;

    private Integer sort;

    private Date createTime;
}