package org.springboot.demo.pojo;

import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

//  MyBatis-Plus配置
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;

import java.math.BigDecimal;
import java.util.Date;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor

@TableName("t_product")   // 告诉MP这个类对应数据库的product表
public class Product {
    @TableId(type = IdType.AUTO)     // 告诉MP这是主键，且数据库是自增的

    private Integer id;
    private String name;
    private String brand;
    private String description;
    private BigDecimal price;
    private Integer stock;
    private Integer sales;
    private Integer categoryId;
    private String imageUrl;
    private Integer status;
    private Date createTime;
    private Date updateTime;
}