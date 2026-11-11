package org.springboot.demo.controller;

import org.springboot.demo.demos.web.User;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.ui.ModelMap;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.ModelAndView;
import java.util.ArrayList;
import java.util.List;

// restful  接口设计规范 请求类型（操作类型）， url地址（网络路径）
//          通过这两项信息，能够清晰的知道该接口的作用。
//  请求类型：
//  （浏览器直接访问）get：获取信息或数据。get请求可以被缓存。参数大小2m
//  post：提交信息或数据。post请求不可以被缓存。参数无大小限制
//  put：修改
//  delete：删除
//  url地址：
//  /users 用户列表
//  GET/users/123   获取id为123的用户
//  PUT /users/123  修改id为123的用户
//  DELETE/users/123    删除id为123的用户

//  HTTP状态码 2XX表示成功 3XX表示跳转 4XX客户端错误 5XX服务端错误
//  200 201 204 206
//  301 302 303
//  404 Not Found找不到页面  403Forbidden没有权限    404UnAuth没有鉴权
//  500 502 503

@Controller
public class HelloworldController {

    @RequestMapping("/testThymeleaf")
    public String testThymeleaf(String name, Model model) {
        model.addAttribute("what",name);
        model.addAttribute("style","color:#0284C7; font-size:32px");
        return "hello";
    }

//  获取所有用户信息
    @GetMapping("/users")
    @ResponseBody
    public String user() {
        return "返回了用户列表";
    }

//  返回单用户
    @GetMapping("/users/{usersId}")
    @ResponseBody
    public String user(@PathVariable("usersId") String usersId) {
        return "返回用户：" + usersId;
    }

    @RequestMapping("/helloWorld1")
    @ResponseBody
    public String helloWorld1() { return "Hello World!"; }

    @RequestMapping("/helloWorld2")
    @ResponseBody
    public String helloWorld2() { return "Hello World!"; }

    @RequestMapping("/helloWorld3")
    @ResponseBody
    public String helloWorld3() { return "Hello World!"; }
}
