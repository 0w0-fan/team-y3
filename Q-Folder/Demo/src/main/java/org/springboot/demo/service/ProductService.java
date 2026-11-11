package org.springboot.demo.service;

import org.springboot.demo.pojo.Category;
import org.springboot.demo.pojo.ProductVO;
import java.math.BigDecimal;
import java.util.List;
import com.github.pagehelper.PageInfo;

public interface ProductService {
    PageInfo<ProductVO> searchProductPage(String name, BigDecimal minPrice, BigDecimal maxPrice, Integer categoryId, int pageNum, int pageSize);

    List<Category> getAllCategory();

    int updateStatusBatch(List<Integer> ids, Integer status);
}
