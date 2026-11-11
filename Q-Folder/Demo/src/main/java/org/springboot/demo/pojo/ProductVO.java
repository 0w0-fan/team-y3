package org.springboot.demo.pojo;

import lombok.Getter;
import lombok.Setter;
import lombok.ToString;

// 商品视图对象：在逆向生成的Product基础上扩展“所属分类”，不修改生成的代码
@Getter
@Setter
@ToString(callSuper = true)
// VO -> view Object    视图的实体类
public class ProductVO extends Product{
    private Category category;
}