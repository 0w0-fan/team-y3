package org.springboot.demo;

import com.github.pagehelper.PageInfo;
import org.springboot.demo.service.ProductService;
import org.springboot.demo.pojo.ProductVO;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.annotation.Transactional;
import org.junit.jupiter.api.Test;
import java.math.BigDecimal;


@SpringBootTest
@Transactional
public class PageHelperTests {

    @Autowired
    private ProductService productService;

    @Test
    public void testDefaultPagination() {
        // 默认第1页，每页10条
        PageInfo<ProductVO> pageInfo = productService.searchProductPage(
                null, null, null, null, 1, 10);

        System.out.println("总条数：" + pageInfo.getTotal());
        System.out.println("总页数：" + pageInfo.getPages());
        System.out.println("当前页数据量：" + pageInfo.getList().size());
        // 断言可以自己加，比如：
        // assertTrue(pageInfo.getList().size() <= 8);
    }

    @Test
    public void testConditionAndPaging() {
        // 条件：最低价格 100，查询第 2 页
        PageInfo<ProductVO> pageInfo = productService.searchProductPage(
                null, new BigDecimal("100"), null, null, 2, 8);

        System.out.println("符合条件总条数：" + pageInfo.getTotal());
        System.out.println("当前页码：" + pageInfo.getPageNum());
        System.out.println("当前页数据量：" + pageInfo.getList().size());
    }

    @Test
    public void testPageNumOutOfBounds() {
        // 页码越界，配合 reasonable=true 应回到最后一页
        PageInfo<ProductVO> pageInfo = productService.searchProductPage(
                null, null, null, null, 100, 8);

        System.out.println("请求页码 100，实际返回页码：" + pageInfo.getPageNum());
        System.out.println("总页数：" + pageInfo.getPages());
    }
}
