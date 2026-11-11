package org.springboot.demo.jpa.repository;

import org.springboot.demo.jpa.entity.ProductEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;

import java.math.BigDecimal;
import java.util.List;

// 继承JpaRepository获得基础CRUD，继承JpaSpecificationExecutor获得动态条件查询
public interface ProductRepository extends JpaRepository<ProductEntity, Integer>,
        JpaSpecificationExecutor<ProductEntity> {

    // 方法命名查询：where name like %?% and status = ?
    List<ProductEntity> findByNameContainingAndStatus(String name, Integer status);

    // 方法命名查询：where price between ? and ? order by price asc
    List<ProductEntity> findByPriceBetweenOrderByPriceAsc(BigDecimal min, BigDecimal max);

    // 方法命名查询：按关联对象的属性查询 where category.name = ?
    List<ProductEntity> findByCategory_Name(String categoryName);
}
