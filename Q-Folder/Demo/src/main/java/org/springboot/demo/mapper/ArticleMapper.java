package org.springboot.demo.mapper;

import org.apache.ibatis.annotations.Mapper;
import org.springboot.demo.pojo.Article;

@Mapper
public interface ArticleMapper {

    public Article selectArticle(Integer id);


//  增删改的操作（事务性操作）   返回的结果都一样，均是影响的行数
    public int updateArticle(Article article);
}
