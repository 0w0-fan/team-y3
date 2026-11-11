package org.springboot.demo.mapper;

import org.apache.ibatis.annotations.*;
import org.springboot.demo.pojo.Comment;

import java.util.List;

@Mapper
public interface CommentMapper {

//  查询数据操作
    @Select("SELECT * FROM t_comment WHERE id =#{id}")
    public Comment findById(Integer id);

    @Select("SELECT * FROM t_comment")
    public List<Comment> getAllComment();

//  插入数据操作
    @Insert("INSERT INTO t_comment(content,author,a_id) " +
            "values (#{content},#{author},#{aId})")
    public int insertComment(Comment comment);

//  更新数据操作
    @Update("UPDATE t_comment SET content=#{content} WHERE id=#{id}")
    public int updateComment(Comment comment);

//  删除数据操作
    @Delete("DELETE FROM t_comment WHERE id=#{id}")
    public int deleteComment(Integer id);

}
