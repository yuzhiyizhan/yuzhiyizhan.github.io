---
layout: post
title: "使用Paddlenlp训练自己命名实体识别模型"
date:   2023-02-07
tags: [深度学习]
comments: true
author: 0基础的菜狗
---


# 注意事项 #

**暂时只在windows环境下训练成功**

## 1. 训练场地的选择 ##

第一种(推荐): 使用飞浆自己的平台[飞浆AI Studio](https://aistudio.baidu.com/aistudio/index)坑非常少而且每天能白嫖GPU

第二种: 本地 坑比较多但是幸好官方文档讲的比较详细 [UIE](https://github.com/PaddlePaddle/PaddleNLP/blob/develop/model_zoo/uie/README.md)

先下载源码到本地[PaddleNLP](https://github.com/PaddlePaddle/PaddleNLP)

命名实体识别的工作路径在

https://github.com/PaddlePaddle/PaddleNLP/tree/develop/model_zoo/uie

## 2. 数据集的准备 ##

### 需要准备数据集的格式如下: ###

    |--data  //存放数据集目录

    |--|--train.txt  //训练集
    
    |--|--test   //测试集
    
    |--|--dev.txt     //验证集

data文件夹放工作目录下

一条数据例子:

      {"content": "米佬带带弟弟", "result_list": [{"text": "米佬", "start": 1, "end": 2}], "prompt": "大佬"}
      {"content": "米佬带带弟弟", "result_list": [], "prompt": "傻逼"}
      这样就是两个类别
      content:一个句子(内容)
      result_list:实体列表(可以为空，用空列表表示)
      prompt:标签
      标签最好用英文，没有也无所谓

自己的数据集往往格式不是这么工整所以需要自己处理成这种格式

官方处理数据的例子:

使用 [doccano](https://github.com/doccano/doccano) 来进行标注后使用doccano.py进行数据的转换

标注后的一条例子如下:

      {"id":4,"text":"电池寿命不是很好，可能是低 15 分钟或高 10 分钟。说它是用于地毯的，但就价格而言，我认为它不能胜任 200 美元的真空吸尘器的工作。做一个 50 美元的真空工作。真空与附件一起使用很尴尬。上半部分又重又大，很难用附件握住。真空吸尘器我会给 2 颗星（满分 5 颗星），它便于快速完成工作，但不是深度清洁工具。\n","label":[[0,8,"差评点"]]}

更复杂的标注参考[doccano文档](https://doccano.github.io/doccano/)
和[PaddleNLP的数据标注文档](https://github.com/PaddlePaddle/PaddleNLP/blob/develop/model_zoo/uie/doccano.md)

将导出的压缩包解压后后缀改成json,并创建data文件夹后放进去,运行以下命令

      python doccano.py \
      --doccano_file ./data/doccano_ext.json \
      --task_type ext \
      --save_dir ./data \
      --splits 0.8 0.2 0

注意文件名要和自己的一样

参数是什么意思源码写的非常清楚

如遇报错在 PaddleNLP\model_zoo\uie\utils.py 代码的417行附近添加自己的捕获逻辑查看是否有数据不合逻辑

            一个非常简单的例子(轻喷,随手写的):
            try:
                items = json.loads(line)
            except Exception as e:
                print(e)
                raise ValueError(line)

当然了这是官方的例子，实际获得的命名实体识别的数据集和官方的是有差异的，由于很多所以只写一种

例如获取到的数据集长这样:

      text_a   label
      海 钓 比 赛 地 点 在 厦 门 与 金 门 之 间 的 海 域 。 O O O O O O O B-LOC I-LOC O B-LOC I-LOC O O O O O O

句子以空格隔开，标注B-LOC代表地名(一般为第一个字)，I-LOC代表地名，O代表无意义

需要自己编写脚本先处理成doccano的格式，然后在用官方的工具进行转换

这种数据集类型的脚本编写如下(也是随手写的，大佬轻喷):

```
import json
import sys
import pandas as pd


class ProcessBar(object):
    """
    实例化时需要传入两个参数:target - 进度目标 , num - 进度条长度 ( 默认20 )
    使用时每次更新时调用 show_bar 函数，将当前进度传入
    """
    not_done = ''

    def __init__(self, target, num=40):
        self.num = num
        self.target = target
        for i in range(num):
            self.not_done = self.not_done + ' '

    def show_bar(self, current):
        done = ''
        not_done = self.not_done
        target = self.target
        num = self.num

        c_num = int(num * current / target)
        for i in range(c_num):
            done = done + '#'
            not_done = not_done[:-1]
        sys.stdout.write('\r[%s%s]' % (done, not_done))
        if current == target:
            print('Finished')
        sys.stdout.flush()


def filter(value):
    value = str(value).split(' ')
    return ''.join(value)


def merge_list(label_list):
    number = 0
    result = {i: v for i, v in enumerate(label_list)}
    while True:
        value = result.get(number)
        next_value = result.get(number + 1)
        if value:
            if next_value:
                if value[1] == next_value[0] and value[2] == next_value[2]:
                    result[number + 1] = [value[0], next_value[1], value[2]]
                    del result[number]
                    number += 1
                    continue
                else:
                    number += 1
                    continue
            else:
                break
        else:
            break
    result = list(result.values())
    return result


if __name__ == "__main__":
    # 将标签转化成有实际意义的标签
    process_bar_number = 0
    label_dict = {'B-ORG': '组织', "I-ORG": '组织', "B-PER": '人名', "I-PER": '人名', "B-LOC": '地名', 'I-LOC': '地名',
                  'B-BodyPart': '身体部位', 'I-BodyPart': '身体部位', 'B-Symptom': '症状', 'I-Symptom': '症状', 'B-Disease': '疾病',
                  'I-Disease': '疾病', 'B-Examine': '检查', 'I-Examine': '检查', 'B-Cure': '治愈', 'I-Cure': '治愈',
                  'B-POS': '国家', 'I-POS': '国家'}
    data = pd.read_csv('data.tsv', sep='\t', header=0)
    target = len(list(data.iterrows()))
    process_bar = ProcessBar(target, 100)
    data['json'] = None
    for ids, (index, v) in enumerate(data.iterrows()):
        process_bar_number += 1
        process_bar.show_bar(process_bar_number)
        label_list = []
        text = v["text_a"]
        label = v["label"]
        text = filter(text)
        result_list = str(label).split(' ')
        for i, v in enumerate(result_list):
            if not v == 'O':
                value = label_dict.get(v)
                if value:
                    label_list.append([i, i + 1, value])
                else:
                    raise ValueError(text, v)
        label_list = merge_list(label_list)

        result = {'id': ids, 'text': text, 'label': label_list}
        result = json.dumps(result, ensure_ascii=False)
        data.loc[index, 'json'] = result
    data.to_excel('data.xlsx', index=False)

```

生成的data.xlsx将json那一列除了头手动拿出来放到一个json文件里面，这样就和doccano格式一样了

## 3. 装环境 ##

刚才已经在本地下载好了paddlenlp的源码打包成zip

建议用飞浆去训练基本无坑

### 下面是在本地的环境安装 ###

1. 创建虚拟环境，py版本3.8以上，因为doccano需要的py版本也是3.8以上

2. 到paddlenlp目录下执行命令

       pip install -r requirements.txt -i https://mirror.baidu.com/pypi/simple

3. 安装飞浆参考官网[paddle](https://www.paddlepaddle.org.cn/)

4. 安装Paddlenlp

       pip install paddlenlp -U

5. 写个小脚本测试一下，下面脚本放到PaddleOCR目录下

```
# -*- coding:utf-8 -*-
from pprint import pprint
from paddlenlp import Taskflow
from loguru import logger

text = """10月16日高铁从杭州到上海南站车次d5414共48元"""

schema = ['时间']
# 设定抽取目标和定制化模型权重路径
my_ie = Taskflow("information_extraction", schema=schema, task_path='uie-base')
pprint(my_ie(text))

```

至此基本完成了环境的安装

## 4. 训练 ##

```
python -u -m paddle.distributed.launch --gpus "0" finetune.py \
  --train_path ./data/train.txt \
  --dev_path ./data/dev.txt \
  --save_dir ./checkpoint \
  --learning_rate 1e-5 \
  --batch_size 32 \
  --max_seq_len 512 \
  --num_epochs 100 \
  --model uie-base \
  --seed 1000 \
  --logging_steps 10 \
  --valid_steps 100 \
  --device gpu
```

注意：训练自己的模型需要改源码

模型以大到小排列，越大精度越高速度越慢

--model ["uie-base", "uie-tiny", "uie-medium", "uie-mini", "uie-micro", "uie-nano"]

--batch_size 显卡顶不住调小这个数 最好为2^n

其他参数查看源码即可

## 5. 测试 ##

```
python evaluate.py \
    --model_path ./checkpoint/model_3200 \
    --test_path ./data/dev.txt \
    --batch_size 16 \
    --max_seq_len 512
```

--model_path为模型路径

```
python evaluate.py \
    --model_path ./checkpoint/model_3200 \
    --test_path ./data/dev.txt \
    --debug
```

--model_path为模型路径

## 6. 查看效果 ##

可以把checkpoint的模型发到工作目录去

编写下面脚本

```
# -*- coding:utf-8 -*-
from pprint import pprint
from paddlenlp import Taskflow
from loguru import logger

text = """10月16日高铁从杭州到上海南站车次d5414共48元"""

schema = ['时间']
# 设定抽取目标和定制化模型权重路径
my_ie = Taskflow("information_extraction", schema=schema, task_path='model_10200')
pprint(my_ie(text))
```

task_path为模型路径

## 7. 用百度飞浆训练 ##
   
将paddlenlp打包好后上传并解压

将data打包好放到uie目录下并解压

### 开始训练 ###

```
# 切换工作目录
import os
os.chdir("/home/aistudio/PaddleNLP")

# 装环境
!pip install -r requirements.txt -i https://mirror.baidu.com/pypi/simple
!pip install paddlenlp -U

# 切换工作目录
os.chdir("/home/aistudio/PaddleNLP/model_zoo/uie")

# 训练
!python -u -m paddle.distributed.launch --gpus "0" finetune.py \
  --train_path ./data/train.txt \
  --dev_path ./data/dev.txt \
  --save_dir ./checkpoint \
  --learning_rate 1e-5 \
  --batch_size 32 \
  --max_seq_len 512 \
  --num_epochs 1000 \
  --model uie-base \
  --seed 1000 \
  --logging_steps 10 \
  --valid_steps 100 \
  --device gpu

# 测试
!python evaluate.py \
    --model_path ./checkpoint/model_3200 \
    --test_path ./data/dev.txt \
    --batch_size 16 \
    --max_seq_len 512
    
# 测试debug模式
!python evaluate.py \
    --model_path ./checkpoint/model_3200 \
    --test_path ./data/dev.txt \
    --debug
```
训练好后将模型压缩下载回来本地进行单句测试
## 8. 部署 ##

```
暂无
```
