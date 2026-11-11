package org.springboot.demo.mapper;

import java.util.List;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import org.apache.ibatis.annotations.Mapper;
import org.springboot.demo.pojo.Product;

@Mapper
public interface ProductMapper extends BaseMapper<Product> {
//    int deleteByPrimaryKey(Integer id);
//
//    int insert(Product record);
//
//    Product selectByPrimaryKey(Integer id);
//
//    List<Product> selectAll();
//
//    int updateByPrimaryKey(Product record);
}