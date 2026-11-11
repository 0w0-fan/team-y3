package org.springboot.demo.mapper;
import org.springboot.demo.pojo.Product;
import org.springboot.demo.pojo.ProductVO;
import org.apache.ibatis.annotations.Param;

import java.math.BigDecimal;
import java.util.List;

// 手写的扩展Mapper：与逆向生成的ProductMapper分开存放，重新生成时不会被覆盖

public interface ProductExtMapper {
    // 多条件动态查询（<where> + <if> + <resultMap>）
    List<ProductVO> searchProduct(@Param("name") String name,
                                  @Param("minPrice") BigDecimal minPrice,
                                  @Param("maxPrice") BigDecimal maxPrice,
                                  @Param("categoryId") Integer categoryId);

    // 批量上架/下架（<foreach>）
    int updateStatusBatch(@Param("ids") List<Integer> ids, @Param("status") Integer status);

    // 只修改非空字段（<set> + <if>）
    int updateSelective(Product product);
}
