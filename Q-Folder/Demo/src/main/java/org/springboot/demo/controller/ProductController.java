package org.springboot.demo.controller;

import com.github.pagehelper.PageInfo;
import org.springboot.demo.pojo.ProductVO;
import org.springboot.demo.service.ProductService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseBody;

import java.math.BigDecimal;
import java.util.List;

@Controller
public class ProductController {
    @Autowired
    private ProductService productService;

    // 商品多条件查询：所有条件均为可选
    @GetMapping("/product/list")
    public String list(Model model,         //  Param 参数 -》 mybatis的参数
                                            //  RequestParam 参数 -》 请求参数
                       @RequestParam(required = false) String name,
                       @RequestParam(required = false) BigDecimal minPrice,
                       @RequestParam(required = false) BigDecimal maxPrice,
                       @RequestParam(required = false) Integer categoryId,
                       @RequestParam(defaultValue = "1") int pageNum,
                       @RequestParam(defaultValue = "10") int pageSize) {
        PageInfo<ProductVO> pageInfo = productService.searchProductPage(name, minPrice, maxPrice, categoryId, pageNum, pageSize);
        model.addAttribute("pageInfo", pageInfo);
        model.addAttribute("categories", productService.getAllCategory());
        // 把查询条件放回页面，实现条件回显
        model.addAttribute("name", name);
        model.addAttribute("minPrice", minPrice);
        model.addAttribute("maxPrice", maxPrice);
        model.addAttribute("categoryId", categoryId);

        return "product/manageProduct";
    }

    // 批量上架/下架
    @PostMapping("/product/status")
    public String updateStatus(@RequestParam(required = false) List<Integer> ids, Integer status) {
        if (ids != null && !ids.isEmpty()) {
            productService.updateStatusBatch(ids, status);
        }
        return "redirect:/product/list";
    }

    @GetMapping("/product/page")
    @ResponseBody
    public PageInfo<ProductVO> page(String name, BigDecimal minPrice, BigDecimal maxPrice, Integer categoryId,
                                    @RequestParam(defaultValue = "1") int pageNum,
                                    @RequestParam(defaultValue = "8") int pageSize) {
        return productService.searchProductPage(name, minPrice, maxPrice, categoryId, pageNum, pageSize);
    }

}
