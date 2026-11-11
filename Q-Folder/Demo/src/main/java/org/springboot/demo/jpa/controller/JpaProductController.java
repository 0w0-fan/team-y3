package org.springboot.demo.jpa.controller;

import org.springboot.demo.jpa.repository.CategoryRepository;
import org.springboot.demo.jpa.service.JpaProductService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springboot.demo.jpa.entity.ProductEntity;
import org.springframework.data.domain.Page;


import java.math.BigDecimal;

// JPA版本的控制器：使用独立的请求路径和独立的页面jpa/productList.html
@Controller
public class JpaProductController {

    @Autowired
    private JpaProductService jpaProductService;
    @Autowired
    private CategoryRepository categoryRepository;

    @GetMapping("/jpa/product/list")
    public String list(Model model,
                       @RequestParam(required = false) String name,
                       @RequestParam(required = false) BigDecimal minPrice,
                       @RequestParam(required = false) BigDecimal maxPrice,
                       @RequestParam(required = false) Integer categoryId,
                       @RequestParam(defaultValue = "1") int pageNum,
                       @RequestParam(defaultValue = "10") int pageSize)
    {
        Page<ProductEntity> page = jpaProductService.searchProductPage(name, minPrice, maxPrice, categoryId, pageNum, pageSize);
        model.addAttribute("page", page);
        model.addAttribute("categories", categoryRepository.findAll());
        // 把查询条件放回页面，实现条件回显
        model.addAttribute("name", name);
        model.addAttribute("minPrice", minPrice);
        model.addAttribute("maxPrice", maxPrice);
        model.addAttribute("categoryId", categoryId);
        return "jpa/productList";
    }
}