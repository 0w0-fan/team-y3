package org.springboot.demo;

import com.alibaba.druid.wall.WallConfig;
import com.sun.org.apache.xerces.internal.util.SynchronizedSymbolTable;
import org.apache.ibatis.session.SqlSessionFactory;
import org.junit.jupiter.api.Test;
import org.mybatis.spring.annotation.MapperScan;
import org.springboot.demo.controller.HelloworldController;
import org.springboot.demo.mapper.ArticleMapper;
import org.springboot.demo.mapper.CommentMapper;
import org.springboot.demo.mapper.ProductExtMapper;
import org.springboot.demo.mapper.ProductMapper;
import org.springboot.demo.pojo.Article;
import org.springboot.demo.pojo.Comment;
import org.springboot.demo.pojo.Product;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.UpdateWrapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.List;


@SpringBootTest
@Transactional
class DemoApplicationTests {

    // 自动注入：获取Bean容器（Spring）的对象，注入在下述对象中
//    @Autowired
//    HelloworldController helloWorldController;
//    @Autowired
//    CommentMapper commentMapper;
//    @Autowired
//    private ArticleMapper articleMapper;


//    @Test
//    public void test1() {
//        Comment comment = commentMapper.findById(1);
//        System.out.println(comment);

//        List<Comment> comments = commentMapper.getAllComment();
//        for (Comment comment : comments) {
//            System.out.println(comment);
//        }


//        Comment comment = new Comment();
//        comment.setContent("你好");
//        comment.setAuthor("电摇闯");
//        comment.setAId(3);
//        commentMapper.insertComment(comment);

//        Article article = articleMapper.selectArticle(1);
//        System.out.println(article);

//        Article article = new Article();
//        article.setId(1);
//        article.setTitle("应用开发");
//        article.setContent("321");
//        articleMapper.updateArticle(article);
//        }

    //    MyBatis传统配置测试
//    @Autowired
//    private ProductMapper productMapper;          // 逆向生成
//    @Autowired
//    private ProductExtMapper productExtMapper;    // 手写扩展
//
//    @Test
//    public void testGeneratedMapper() {
//        System.out.println("商品总数：" + productMapper.selectAll().size());
//        System.out.println(productMapper.selectByPrimaryKey(1).getName());
//    }
//
//    @Test
//    public void testUpdateSelective() {
//        Product p = new Product();
//        p.setId(9);
//        p.setStock(36);          // 只修改库存，其他字段为null不会被更新
//        System.out.println("影响行数：" + productExtMapper.updateSelective(p));
//    }


    //    MyBatis-Plus配置测试
    @Autowired
    private ProductMapper productMapper;

    // 增添操作
    @Test
    public void testInsert() {
        Product p = new Product();
        p.setName("Apple iPhone 15");
        p.setPrice(new BigDecimal("5999.00"));
        p.setStock(50);
        p.setSales(0);

        // insert() 返回受影响的行数
        int rows = productMapper.insert(p);
        System.out.println("插入成功！影响行数：" + rows);

        // 插入后，MP 会自动将生成的自增主键回填到实体类的 id 属性中
        System.out.println("刚刚插入的商品 ID 是：" + p.getId());
    }

    // 查询操作
    @Test
    public void testSelect() {
        // 1. 根据 ID 查询单条记录
        Product p = productMapper.selectById(1);
        System.out.println("查询 ID 为 1 的商品：" + p);

        // 2. 查询所有记录（传 null 代表无条件）
        List<Product> list = productMapper.selectList(null);
        System.out.println("商品总数：" + list.size());

        // 3. 条件查询（QueryWrapper 条件构造器）
        QueryWrapper<Product> wrapper = new QueryWrapper<>();
        // 查询名字包含 "测试"，且价格大于 50 的商品
        wrapper.like("name", "测试").gt("price", 50);
        List<Product> result = productMapper.selectList(wrapper);
        System.out.println("符合条件的商品数量：" + result.size());
    }

    // 修改操作
    @Test
    public void testUpdate() {
        // 根据ID更新
        Product p = new Product();
        p.setId(1);
        p.setStock(999);
        p.setPrice(new BigDecimal("8888.00"));  // 调整价格
        // 其他字段如name为null，MP会自动忽略，不会将其更新为null

        int rows = productMapper.updateById(p);
        System.out.println("更新成功！影响行数：" + rows);

        // 条件更新
        UpdateWrapper<Product> wrapper = new UpdateWrapper<>();
        wrapper.eq("brand", "Apple"); // 匹配所有Apple品牌的商品
        Product updateEntity = new Product();
        updateEntity.setStatus(0);    // 状态（0-下架；1-上架）
        productMapper.update(updateEntity, wrapper);
    }

    // 删除操作
    @Test
    public void testDelete() {
        // ID删除单条记录
        int rows = productMapper.deleteById(1);
        System.out.println("删除成功！影响行数：" + rows);

        // 条件删除
        QueryWrapper<Product> wrapper = new QueryWrapper<>();
        wrapper.lt("stock", 10); // 删除所有库存小于 10 的商品
        productMapper.delete(wrapper);

        // 批量删除
        // List<Integer> ids = Arrays.asList(1, 2, 3);
        // productMapper.deleteBatchIds(ids);
    }
}

