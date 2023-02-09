---
layout: post
title: "使用XMLHttpRequest发请求"
date:   2023-02-07
tags: [JS]
comments: true
author: 0基础的菜狗
---


## 请求百度例子
```
let xhr = new XMLHttpRequest()
xhr.open('GET', `https://www.baidu.com/`, true)
xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded')
xhr.onreadystatechange = function() {
  if (this.readyState === XMLHttpRequest.DONE && this.status === 200) {
    console.log(this.responseText);
  }
};
xhr.send()
```

要在www.baidu.com下才能请求(不能跨域)
