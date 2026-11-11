package org.springboot.demo;

import org.junit.jupiter.api.Test;
import org.springboot.demo.jpa.entity.ProductEntity;
import org.springboot.demo.jpa.repository.ProductRepository;
import org.springboot.demo.jpa.service.JpaProductService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.data.domain.Page;

import java.math.BigDecimal;

@SpringBootTest
public class JpaProductTests {

//    @Autowired
//    private ProductRepository productRepository;
//
//    // 方法命名查询
//    @Test
//    public void testMethodName() {
//        productRepository.findByNameContainingAndStatus("小米", 1)
//                .forEach(p -> System.out.println(p.getName()));
//        productRepository.findByPriceBetweenOrderByPriceAsc(new BigDecimal("100"), new BigDecimal("300"))
//                .forEach(p -> System.out.println(p.getName() + " " + p.getPrice()));
//        productRepository.findByCategory_Name("图书音像")
//                .forEach(p -> System.out.println(p.getName()));
//    }

    @Autowired
    private JpaProductService jpaProductService;

//    // Specification多条件查询：名称包含“小米”且价格不超过1000
//    @Test
//    public void testSearch() {
//        jpaProductService.searchProduct("小米", null, new BigDecimal("1000"), null)
//                .forEach(p -> System.out.println(p.getId() + " " + p.getName() + " " + p.getCategory().getName()));
//    }

    // 多条件 + 分页：最低价格100，查询第2页，每页8条
    @Test
    public void testPage() {
        Page<ProductEntity> page = jpaProductService.searchProductPage(null, new BigDecimal("100"), null, null, 2, 8);
        System.out.println("总条数：" + page.getTotalElements() + "，总页数：" + page.getTotalPages()
                + "，当前页：" + (page.getNumber() + 1));
        page.getContent().forEach(p -> System.out.println(p.getId() + " " + p.getName()));
    }
}
