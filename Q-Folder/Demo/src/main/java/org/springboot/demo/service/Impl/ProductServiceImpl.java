package org.springboot.demo.service.Impl;

import com.github.pagehelper.PageHelper;
import com.github.pagehelper.PageInfo;
import org.springboot.demo.mapper.CategoryMapper;
import org.springboot.demo.mapper.ProductExtMapper;
import org.springboot.demo.pojo.Category;
import org.springboot.demo.pojo.ProductVO;
import org.springboot.demo.service.ProductService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import java.math.BigDecimal;
import java.util.List;

@Service
public class ProductServiceImpl implements ProductService {
    @Autowired
    private ProductExtMapper productExtMapper;   // 手写的扩展Mapper
    @Autowired
    private CategoryMapper categoryMapper;       // 逆向生成的Mapper

    @Override
    public PageInfo<ProductVO> searchProductPage(String name, BigDecimal minPrice, BigDecimal maxPrice, Integer categoryId, int PageNum, int PageSize) {

        PageHelper.startPage(PageNum, PageSize);
        List<ProductVO> list = productExtMapper.searchProduct(name, minPrice, maxPrice, categoryId);
        return new PageInfo<>(list);
    }
    @Override
    public List<Category> getAllCategory() {
        return categoryMapper.selectAll();
    }
    @Override
    public int updateStatusBatch(List<Integer> ids, Integer status) {
        return productExtMapper.updateStatusBatch(ids, status);
    }
}