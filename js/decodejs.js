function decry_str(jscode) {
    let ast = parser.parse(jscode)
    traverse(ast, {
        'StringLiteral|NumericLiteral|DirectiveLiteral'(path) {//迭代字符串|迭代数组匹配--16进制文本还原
            delete path.node.extra; //删除节点的额外部分-触发原始值处理
        },
    });
    let {code} = generator(ast, opts = {jsescOption: {"minimal": true}})
    return code
}

function merge_obj(jscode) {
    let ast = parser.parse(jscode)

    function merge_objs(path) {
        // 将拆分的对象重新合并
        const {id, init} = path.node;//提取节点指定的值
        if (!t.isObjectExpression(init))//如果指定属性不是对象表达式，退出
            return;

        let name = id.name;//获取id的名称
        let properties = init.properties;//获取初始属性数组
        let scope = path.scope;//获取路径的作用域
        let binding = scope.getBinding(name);//

        if (!binding || binding.constantViolations.length > 0) {//检查该变量的值是否被修改--一致性检测
            return;
        }
        let paths = binding.referencePaths;//绑定引用的路径
        paths.map(function (refer_path) {
            let bindpath = refer_path.parentPath;//父路径
            if (!t.isVariableDeclarator(bindpath.node)) return;//变量声明
            let bindname = bindpath.node.id.name;//获取变量节点声明的值
            bindpath.scope.rename(bindname, name, bindpath.scope.block);//变量名重命名，传作用域参数
            bindpath.remove();//删除节点
        });

        scope.traverse(scope.block, {
            AssignmentExpression: function (_path) {//赋值表达式
                const left = _path.get("left");//节点路径左侧信息
                const right = _path.get("right");//节点路径右侧信息
                if (!left.isMemberExpression())//左侧是否为成员表达式
                    return;
                const object = left.get("object");//获取左侧信息的对象
                const property = left.get("property");//获取左侧信息的属性
                //a={},a['b']=5；合并后a={'b':5}
                if (object.isIdentifier({name: name}) && property.isStringLiteral() && _path.scope == scope) {
                    properties.push(t.ObjectProperty(t.valueToNode(property.node.value), right.node));
                    _path.remove();
                }
                //a={},a.b=5；合并后a={'b':5}
                if (object.isIdentifier({name: name}) && property.isIdentifier() && _path.scope == scope) {
                    properties.push(t.ObjectProperty(t.valueToNode(property.node.name), right.node));
                    _path.remove();
                }
            }
        })
    }

    traverse(ast, {VariableDeclarator: {exit: [merge_objs]},});
    let {code} = generator(ast, opts = {jsescOption: {"minimal": true}})
    return code
}


function Mem(jscode) {
    let ast = parser.parse(jscode)

    function add_Mem_str(path) {
        let node = path.node;
        if (node.computed && t.isBinaryExpression(node.property) && node.property.operator == '+') {
            let BinNode = node.property;//属性节点
            let tmpast = parser.parse(generator(BinNode).code);
            let addstr = '';
            traverse(tmpast, {
                BinaryExpression: {
                    exit: function (_p) {
                        if (t.isStringLiteral(_p.node.right) && t.isStringLiteral(_p.node.left)) {//二进制表达式左右有一个类型为字符型
                            _p.replaceWith(t.StringLiteral(eval(generator(_p.node).code)))      // 值替换节点
                        }
                        addstr = _p.toString();
                    }

                }
            })
            node.property = t.Identifier(addstr);
        }
    }

    traverse(ast, {MemberExpression: {exit: [add_Mem_str]},});
    let {code} = generator(ast, opts = {jsescOption: {"minimal": true}})
    return code
}


function eval_constant(jscode) {
    let ast = parser.parse(jscode)

    function eval_constants(path) {
        // 常量计算
        if (path.type == "UnaryExpression") {
            const {operator, argument} = path.node;
            if (operator == "-" && t.isLiteral(argument)) {
                return;
            }
        }
        try {
            let value = eval(path.toString())
            // 无限计算则退出，如1/0与-(1/0)
            if (value == Infinity || value == -Infinity)
                return;
            path.replaceWith(t.valueToNode(value));
        } catch (e) {
        }
    }

    traverse(ast, {                                         // 常量计算，慎用！
        "UnaryExpression|BinaryExpression|ConditionalExpression|CallExpression": eval_constants,
    });
    code = generator(ast).code;
    return code;


}


function FunToRetu(jscode) {
    let ast = parser.parse(jscode)
    let Rerurn_sum = 3;//return简化执行的次数-函数花指令嵌套几层，这里设置几层
    let delete_return = false;//return删除标志符
    function FunToRetus(path) {
        // return函数简化
        let node = path.node;//获取路径节点

        if (!t.isBlockStatement(node.body)) return;//块语句判定
        if (!t.isReturnStatement(node.body.body[0])) return;//return 语句判定
        let funName = node.id.name;//函数名称

        let retStmt = node.body.body[0];//定位到returnStatement
        let paramsName = node.params //函数参数列表

        let scope = path.scope;//获取路径的作用域
        let binding = scope.getBinding(funName);//获取绑定

        if (!binding || binding.constantViolations.length > 0) {//检查该变量的值是否被修改--一致性检测
            return;
        }
        let paths = binding.referencePaths;//绑定引用的路径
        let paths_sums = 0;//路径计数

        paths.map(function (refer_path) {
            let bindpath = refer_path.parentPath;//父路径

            let binnode = bindpath.node;//父路径的节点

            if (!t.isCallExpression(binnode)) return;//回调表达式判断

            if (!t.isIdentifier(binnode.callee)) return;//不是标识符则退出
            if (funName != binnode.callee.name) return;//函数名不等于回调函数名称则退出
            let args = bindpath.node.arguments;//获取节点的参数

            if (paramsName.length != args.length) return;//形参与实参数目不等，退出
            let strA = generator(retStmt.argument).code//return ast语句转js语句

            let tmpAst = parser.parse(strA);//重新解析为ast
            for (var a = 0; a < args.length; a++) {//遍历所有的实参
                let name = paramsName[a].name;//形参
                let strB = generator(args[a]).code//实参
                traverse(tmpAst, {//函数内部
                    Identifier: function (_p) {//调用表达式匹配
                        if (_p.node.name == name) {//return中的形参与传入的形参一致
                            _p.node.name = strB;//实参替换形参
                        }
                    }
                })
            }

            bindpath.replaceWith(t.Identifier(generator(tmpAst).code.replaceAll(';', '')))//子节点信息替换

            paths_sums += 1;//路径+1
        });

        if (paths_sums == paths.length && delete_return) {//若绑定的每个路径都已处理 ，则移除当前路径
            path.remove();//删除路径
        }
    }

    ast = parser.parse(generator(ast).code);
    for (var a = 1; a < Rerurn_sum; a++) {
        if (a == Rerurn_sum - 1) delete_return = true;//return删除标志符
        traverse(ast, {FunctionDeclaration: {exit: [FunToRetus]},});
        ast = parser.parse(generator(ast).code);//刷新ast
    }
    code = generator(ast).code;
    return code;

}

function delete_false(jscode) {
    let ast = parser.parse(jscode)

    function delete_falses(path) {
//删除if语句不执行的代码
        try {
            let Ifnode = path.node;//路径的节点
            if (!t.isBooleanLiteral(Ifnode.test) && !t.isNumericLiteral(Ifnode.test)) {//布尔类型判断
                return;
            }

            if (Ifnode.test.value) {//布尔值为真
                if (t.isReturnStatement(Ifnode.consequent)) {
                    path.replaceInline(Ifnode.consequent);
                } else {
                    path.replaceInline(Ifnode.consequent.body);
                }
            } else {//布尔值为假

                if (Ifnode.alternate) {
                    if (t.isReturnStatement(Ifnode.alternate)) {
                        path.replaceInline(Ifnode.alternate);
                    } else {
                        path.replaceInline(Ifnode.alternate.body);
                    }

                } else {
                    path.remove()
                }

            }
        } catch (e) {
        }
    }

    traverse(ast, {IfStatement: {exit: [delete_falses]},});
    let {code} = generator(ast, opts = {jsescOption: {"minimal": true}})
    return code;
}

function NumListReduce(jscode) {
    let ast = parser.parse(jscode)

    function NumListReduces(path) {
        // 数组函数简化
        let node = path.node;//获取路径节点
        if (!t.isIdentifier(node.id)) return;//不是标识符则退出
        if (!t.isArrayExpression(node.init)) return;//不是数组表达式则退出
        let name = node.id.name;//数组的名称
        let init_obj = node.init.elements;//数组元素
        if (init_obj.length == 0) return;//数组元素为空则退出

        let scope = path.scope;//获取路径的作用域
        let binding = scope.getBinding(name);//获取绑定

        if (!binding || binding.constantViolations.length > 0) {//检查该变量的值是否被修改--一致性检测
            return;
        }
        let paths = binding.referencePaths;//绑定引用的路径
        let paths_sums = 0;//路径计数
        paths.map(function (refer_path) {
            let bindpath = refer_path.parentPath;//父路径
            let binnode = bindpath.node;//父路径的节点
            if (!t.isMemberExpression(bindpath.node)) return;//数字表达式判断
            if (binnode.object.name != name) return;//标识符判定
            if (!t.isNumericLiteral(binnode.property)) return;//数字类型判断
            bindpath.replaceInline(init_obj[binnode.property.value])//子节点信息替换
            paths_sums += 1;//路径+1
        });
        if (paths_sums == paths.length) {//若绑定的每个路径都已处理 ，则移除当前路径
            path.remove();//删除路径
        }

    }

    traverse(ast, {VariableDeclarator: {exit: [NumListReduces]},});
    let {code} = generator(ast, opts = {jsescOption: {"minimal": true}})
    return code;
}


function member(jscode) {
    let ast = parser.parse(jscode)
    traverse(ast, {
        MemberExpression(path) {//成员表达式
            //将l.o变更为l['o']类型
            if (t.isIdentifier(path.node.property)) {//标识符类型判断
                let name = path.node.property.name;//节点属性名称
                path.node.property = t.StringLiteral(name);
            }
            path.node.computed = true;//布尔类型修改
        },
    });

    let {code} = generator(ast, opts = {jsescOption: {"minimal": true}})
    return code
}

function DelIdent(jscode) {
    let ast = parser.parse(jscode)

    function DelIdents(path) {
        // 标识符简化
        try {
            let node = path.node;//获取路径节点
            let funName = node.name;//函数名称

            let scope = path.scope;//获取路径的作用域
            let binding = scope.getBinding(funName);//获取绑定
            if (!binding || binding.constantViolations.length > 0) {//检查该变量的值是否被修改--一致性检测
                return;
            }

            let paths = binding.referencePaths;//绑定引用的路径

            if (paths.length == 0) {//被使用的次数为0，删除
                if (t.isCatchClause(path.parentPath)) return; //如果是try catch中的e,不处理
                path.parentPath.remove();
            } else {
                // console.log(paths.length);
                // console.log(paths.toString())
                // path.remove();
            }

        } catch (e) {
            //此处异常是因为，未使用的变量里面嵌套未使用的变量，删除时，直接从外层进行删除，但是缓存还在，删除内层时发现不存在导致的报错
        }

    }

    traverse(ast, {Identifier: {exit: [DelIdents]},});
    let {code} = generator(ast, opts = {jsescOption: {"minimal": true}})
    return code;
}

function replaceWhile(jscode) {
    let ast = parser.parse(jscode)

    function replaceWhiles(path) {
        debugger
        // 反控制流平坦化
        let node = path.node;//路径节点
        // 判断是否是目标节点
        if (!(t.isBooleanLiteral(node.test) || t.isUnaryExpression(node.test)))
            // 如果while中不为true或!![]
            return;
        if (!(node.test.prefix || node.test.value))
            // 如果while中的值不为true
            return;
        if (!t.isBlockStatement(node.body))
            return;
        let body = node.body.body;
        if (!t.isSwitchStatement(body[0]) || !t.isMemberExpression(body[0].discriminant) || !t.isBreakStatement(body[1]))
            return;

        // 获取数组名及自增变量名
        let swithStm = body[0];
        let arrName = swithStm.discriminant.object.name;
        let argName = swithStm.discriminant.property.argument.name
        let arr = [];

        // 找到path节点的前一个兄弟节点，即数组所在的节点，然后获取数组
        let all_presibling = path.getAllPrevSiblings();
        // console.log(all_presibling)
        all_presibling.forEach(pre_path => {
            const {declarations} = pre_path.node;
            let {id, init} = declarations[0]
            if (arrName == id.name) {
                // 数组节点
                arr = init.callee.object.value.split('|');
                pre_path.remove()
            }
            if (argName == id.name) {
                // 自增变量节点
                pre_path.remove()
            }
        })

        // SwitchCase节点集合
        let caseList = swithStm.cases;
        // 存放按正确顺序取出的case节点
        let resultBody = [];
        arr.map(targetIdx => {
            let targetBody = caseList[targetIdx].consequent;
            // 删除ContinueStatement块(continue语句)
            if (t.isContinueStatement(targetBody[targetBody.length - 1]))
                targetBody.pop();
            resultBody = resultBody.concat(targetBody)
        });
        path.replaceInline(resultBody);
    }

    traverse(ast, {WhileStatement: {exit: [replaceWhiles]},});
    let {code} = generator(ast, opts = {jsescOption: {"minimal": true}})
    return code;

}

function callToStr(jscode) {
    let ast = parser.parse(jscode)

    function callToStrs(path) {
        // 将对象进行替换
        var node = path.node;//获取路径节点
        if (!t.isObjectExpression(node.init))//不是对象表达式则退出
            return;
        var objPropertiesList = node.init.properties;    // 获取对象内所有属性
        if (objPropertiesList.length == 0) // 对象内属性列表为0则退出
            return;
        var objName = node.id.name;   // 对象名
        let scope = path.scope;//获取路径的作用域
        let binding = scope.getBinding(objName);//

        if (!binding || binding.constantViolations.length > 0) {//检查该变量的值是否被修改--一致性检测
            return;
        }
        let paths = binding.referencePaths;//绑定引用的路径
        let paths_sums = 0;//路径计数

        objPropertiesList.forEach(prop => {
            var key = prop.key.value;//属性名

            if (t.isFunctionExpression(prop.value))//属性值为函数表达式
            {
                var retStmt = prop.value.body.body[0];//定位到ReturnStatement

                path.scope.traverse(path.scope.block, {
                    CallExpression: function (_path) {//调用表达式匹配
                        let _path_binding = _path.scope.getBinding(objName);//当前作用域获取绑定
                        if (_path_binding != binding) return;//两者绑定对比
                        if (!t.isMemberExpression(_path.node.callee))//成员表达式判定
                            return;
                        var _node = _path.node.callee;//回调函数节点
                        if (!t.isIdentifier(_node.object) || _node.object.name !== objName)//非标识符检测||节点对象名全等验证
                            return;
                        if (!(t.isStringLiteral(_node.property) || t.isIdentifier(_node.property)))//节点属性非可迭代字符验证||节点属性标识符验证
                            return;
                        if (!(_node.property.value == key || _node.property.name == key))//节点属性值与名称等于指定值验证
                            return;
                        if (!t.isStringLiteral(_node.property) || _node.property.value != key)//节点属性可迭代字符验证与节点属性值与指定值等于验证
                            return;

                        var args = _path.node.arguments;//获取节点的参数

                        // 二元运算
                        if (t.isBinaryExpression(retStmt.argument) && args.length === 2)//二进制表达式判定且参数为两个
                        {
                            _path.replaceWith(t.binaryExpression(retStmt.argument.operator, args[0], args[1]));//二进制表达式替换当前节点
                        }
                        // 逻辑运算
                        else if (t.isLogicalExpression(retStmt.argument) && args.length == 2)//与二元运算一样
                        {
                            _path.replaceWith(t.logicalExpression(retStmt.argument.operator, args[0], args[1]));
                        }
                        // 函数调用
                        else if (t.isCallExpression(retStmt.argument) && t.isIdentifier(retStmt.argument.callee))//回调函数表达式判定及回调参数部分判定
                        {
                            _path.replaceWith(t.callExpression(args[0], args.slice(1)))
                        }
                        paths_sums += 1;//删除计数标志
                    }
                })
            } else if (t.isStringLiteral(prop.value)) {//属性值为可迭代字符类型
                var retStmt = prop.value.value;//属性值的值即A:B中的B部分
                path.scope.traverse(path.scope.block, {
                    MemberExpression: function (_path) {//成员表达式
                        let _path_binding = _path.scope.getBinding(objName);//当前作用域获取绑定
                        if (_path_binding != binding) return;//两者绑定对比
                        var _node = _path.node;
                        if (!t.isIdentifier(_node.object) || _node.object.name !== objName)//节点对象标识符验证|节点对象名验证
                            return;
                        if (!(t.isStringLiteral(_node.property) || t.isIdentifier(_node.property)))//节点属性可迭代字符验证|标识符验证
                            return;
                        if (!(_node.property.value == key || _node.property.name == key))//节点属性值与名称等于指定值验证
                            return;
                        if (!t.isStringLiteral(_node.property) || _node.property.value != key)//节点属性可迭代字符判定|节点属性值等于指定值验证
                            return;
                        _path.replaceWith(t.stringLiteral(retStmt))//节点替换
                        paths_sums += 1;//删除计数标志
                    }
                })
            }
        });
        if (paths_sums == paths.length) {//若绑定的每个路径都已处理 ，则移除当前路径
            path.remove();//删除路径
        }
    }

    traverse(ast, {VariableDeclarator: {exit: [callToStrs]},});
    let {code} = generator(ast, opts = {jsescOption: {"minimal": true}})
    return code
}

function convParam(jscode) {
    let ast = parser.parse(jscode)

    function convParams(path) {
        // 自执行函数实参替换形参
        var node = path.node;
        if (!t.isCallExpression(node.expression))//回调表达式判断
            return;
        //实参未定义|形参未定义|实参数大于形参数
        if (node.expression.arguments == undefined || node.expression.callee.params == undefined || node.expression.arguments.length > node.expression.callee.params.length)
            return;
        var argumentList = node.expression.arguments;//实参列表
        var paramList = node.expression.callee.params;//形参列表

        for (var i = 0; i < argumentList.length; i++) {//遍历实参
            var paramName = paramList[i].name;//形参
            let argumentName = generator(argumentList[i]).code//实参
            path.traverse({
                Identifier: function (_path) {
                    if (_path.node.name.length != paramName.length) return;//长度不等
                    if (_path.node.name !== paramName) return;//名称不等
                    _path.node.name = argumentName;//更改形参为实参名称
                }
            });
        }
        node.expression.arguments = [];//实参列表置空
        node.expression.callee.params = paramList.slice(argumentList.length,);//形参列表设置

    }

    traverse(ast, {ExpressionStatement: convParams,});           // 自执行实参替换形参

    let {code} = generator(ast, opts = {jsescOption: {"minimal": true}})
    return code
}

function delConvParam(jscode) {
    let ast = parser.parse(jscode)

    function delConvParams(path) {
        // 替换空参数的自执行方法为顺序语句
        let node = path.node;//路径节点
        let node_exp = node.expression;//节点表达式

        //回调表达式|一元表达式
        if (!t.isCallExpression(node_exp) && !t.isUnaryExpression(node_exp))
            return;
        //实参列表为空且长度不大于0
        if (node.expression.arguments !== undefined && node.expression.arguments.length > 0)
            return;
        if (t.isUnaryExpression(node_exp) && node_exp.operator == '!') {//第二种自执行修改为第一种类型
            node_exp = node_exp.argument;
        }
        if (t.isCallExpression(node_exp)) {//第一种自执行
            if (!t.isFunctionExpression(node_exp.callee))//函数表达式判断
                return;
            let paramsList = node_exp.callee.params//形参列表
            if (paramsList.length > 0) {
                paramsList.map(function (letname) {
                    if (t.isIdentifier(letname)) {
                        //定义一个变量，并添加到结构体中
                        let varDec = t.VariableDeclarator(t.identifier(letname.name))//
                        let localAST = t.VariableDeclaration('var', [varDec]);//
                        node_exp.callee.body.body.unshift(localAST);//添加
                    }
                })
            }
            // 替换节点
            path.replaceInline(node_exp.callee.body.body);
        }

    }

    traverse(ast, {ExpressionStatement: delConvParams,})      // 替换空参数的自执行方法为顺序语句

    let {code} = generator(ast, opts = {jsescOption: {"minimal": true}})
    return code
}

function decrypt_arr(jscode) {
    let ast = parser.parse(jscode)

    function decrypt_arrs(ast) {
        //TODO 1 解密三部分的代码执行
        let end = 3;//切片需要处理的代码块
        let newAst = parser.parse('');//新建ast
        let decrypt_code = ast.program.body.slice(0, end);//切片
        newAst.program.body = decrypt_code// 将前3个节点替换进新建ast
        let stringDecryptFunc = generator(newAst, {compact: true},).code;//转为js，由于存在格式化检测，需要指定选项，来压缩代码// 自动转义
        eval(stringDecryptFunc);//执行三部分的代码


        //TODO 2 准备工作及对解密三部分节点删除
        let stringDecryptFuncAst = ast.program.body[end - 1];// 拿到解密函数所在的节点
        let DecryptFuncName = stringDecryptFuncAst.declarations[0].id.name;//拿到解密函数的名字
        var rest_code = ast.program.body.slice(end); // 剩下的节点
        ast.program.body = rest_code;//剩下的节点替换


        //TODO 3 加密数组还原
        traverse(ast, {
            CallExpression(path) {//回调表达式匹配--替换加密数组为对应的值
                if (t.isIdentifier(path.node.callee, {name: DecryptFuncName})) {       //当变量名与解密函数名相同时，就执行相应操作
                    // console.log(path.toString());
                    // console.log(eval(path.toString()));
                    path.replaceWith(t.valueToNode(eval(path.toString())));      // 值替换节点
                }
            },
        });
        // ast = add_Mem_str(ast)//成员表达式中字符合并
        return ast;

    }

    ast = decrypt_arrs(ast)//大数组还原

    let {code} = generator(ast, opts = {jsescOption: {"minimal": true}})
    return code

}


function VarReplace(jscode) {
    let ast = parser.parse(jscode)

    function VarReplaces(path) {
        // 常量替换
        let node = path.node;//路径节点
        if (!t.isIdentifier(node.id)) return;//标识符判定
        //过滤条件
        if (!t.isStringLiteral(node.init) && !t.isNumericLiteral(node.init) && !t.isUnaryExpression(node.init) && !t.isIdentifier(node.init)) return;

        let name = node.id.name//变量名称
        let scope = path.scope;//获取路径的作用域
        let binding = scope.getBinding(name);//

        if (!binding || binding.constantViolations.length > 0) {//检查该变量的值是否被修改--一致性检测
            return;
        }
        let paths = binding.referencePaths;//绑定引用的路径
        let path_sum = 0;// 路径处理计数
        paths.map(function (refer_path) {
            if (!t.isIdentifier(refer_path)) return; //标识符判定
            refer_path.node.name = generator(node.init).code;     //标识符重命名
            path_sum += 1;                                             //路径计数+1
        });
        if (path_sum == paths.length) {         //所有相关路径都处理，删除路径
            path.remove();
        }

    }

    traverse(ast, {VariableDeclarator: VarReplaces,})      // 未修改常量替换

    let {code} = generator(ast, opts = {jsescOption: {"minimal": true}})
    return code
}

function ReIdent(jscode) {
    let ast = parser.parse(jscode);

    function ReIdents(path) {
        // 标识符简化
        let node = path.node;//获取路径节点
        if (!t.isIdentifier(node.id) || !t.isIdentifier(node.init)) return;

        let leftName = node.id.name;//函数名称
        let rightName = node.init.name;//函数名称

        let scope = path.scope;//获取路径的作用域
        let binding = scope.getBinding(leftName);//获取绑定
        if (!binding || binding.constantViolations.length > 0) {//检查该变量的值是否被修改--一致性检测
            return;
        }
        let paths = binding.referencePaths;//绑定引用的路径
        let paths_sums = 0;
        paths.map(function (refer_path) {
            refer_path.node.name = rightName;//标识符重命名
            paths_sums += 1;//路径+1
        });
        if (paths_sums == paths.length && paths_sums != 0) {//若绑定的每个路径都已处理 ，则移除当前路径
            path.remove();//删除路径
        }
    }

//标识符-重复赋值
    traverse(ast, {VariableDeclarator: {exit: [ReIdents]},});

    let {code} = generator(ast, opts = {jsescOption: {"minimal": true}})
    return code;
}

function DelConsole_one(jscode) {
    let ast = parser.parse(jscode);

    function DelConsole_ones(path) {
        // 删除console
        let node = path.node;//获取路径节点
        if (!t.isCallExpression(node.init)) return;//不是回调表达式，退出
        if (node.init.arguments.length !== 2) return;//形参不等于2个
        if (!t.isThisExpression(node.init.arguments[0])) return;//this表达式
        let thisname = node.id.name;//节点名称

        let scope = path.scope;//获取路径的作用域
        let binding = scope.getBinding(thisname);//获取绑定
        if (!binding || binding.constantViolations.length > 0) {//检查该变量的值是否被修改--一致性检测
            return;
        }
        let paths = binding.referencePaths;//绑定引用的路径
        paths.map(function (refer_path) {
            let bindpath = refer_path.parentPath;//父路径
            if (!t.isCallExpression(bindpath)) return;//回调表达式判断
            if (!t.isIdentifier(bindpath.node.callee)) return;//标识符判定
            bindpath.remove();//删除路径
        });
        path.remove();//删除路径
    }

    function DelConsole_twos(path) {
        // 删除console遗留下列未使用的定义变量
        let node = path.node;//获取路径节点
        if (!t.isCallExpression(node.init)) return;//不是回调表达式，退出
        if (node.init.arguments.length !== 0) return;//形参不等于0个
        if (!t.isFunctionExpression(node.init.callee)) return;//this表达式
        let thisname = node.id.name;//节点名称

        let scope = path.scope;//获取路径的作用域
        let binding = scope.getBinding(thisname);//获取绑定
        if (!binding || binding.constantViolations.length > 0) {//检查该变量的值是否被修改--一致性检测
            return;
        }
        let paths = binding.referencePaths;//绑定引用的路径
        if (paths.length !== 0) return;

        path.remove();//删除路径
    }

    ast = parser.parse(generator(ast).code)//刷新ast
    traverse(ast, {VariableDeclarator: {exit: [DelConsole_ones]},});
    ast = parser.parse(generator(ast).code)//刷新ast
    traverse(ast, {VariableDeclarator: {exit: [DelConsole_twos]},});

    let {code} = generator(ast, opts = {jsescOption: {"minimal": true}})
    return code;
}


function AddObjPro(jscode) {
    let ast = parser.parse(jscode);

    function AddObjPro(path) {
        if (t.isBinaryExpression(path.node.value)) {
            let BinNode = path.node.value;//属性节点
            if (!t.isBinaryExpression(BinNode)) return;//二相式表达式验证
            try {
                path.node.value = t.StringLiteral(eval(generator(BinNode).code));      // 值替换节点
            } catch (e) {
            }
        }
    }

    traverse(ast, {ObjectProperty: {exit: [AddObjPro]},});  //对象属性字符合并

    let {code} = generator(ast, opts = {jsescOption: {"minimal": true}})
    return code;
}

function remove_comma(jscode) {
    let ast = parser.parse(jscode);

    function remove_commas(path) {
        // 序列表达式还原
        let {expression} = path.node
        if (!t.isSequenceExpression(expression))
            return;
        let body = []
        expression.expressions.forEach(
            express => {
                body.push(t.expressionStatement(express))
            }
        )
        path.replaceInline(body)
    }

    traverse(ast, {ExpressionStatement: remove_commas,});        // 序列表达式还原

    let {code} = generator(ast, opts = {jsescOption: {"minimal": true}})
    return code;
}


function del_setInterval(jscode) {
    let ast = parser.parse(jscode);

    function remove_comma(path) {
        // 去除序列表达式逗号
        let {expression} = path.node
        if (!t.isSequenceExpression(expression))
            return;
        let body = []
        expression.expressions.forEach(
            express => {
                body.push(t.expressionStatement(express))
            }
        )
        path.replaceInline(body)
    }

    traverse(ast, {ExpressionStatement: remove_comma,});        // 序列表达式还原

    function del_setInterval(path) {
        // 将对象进行替换
        var node = path.node;//获取路径节点

        if (!t.isIdentifier(node.callee))//不是标识符则退出
            return;
        if (node.callee.name != 'setInterval') return;//不是定时器退出
        if (node.arguments.length !== 2) return;
        if (!t.isFunctionExpression(node.arguments[0]) || node.arguments[0].params.length !== 0) return;
        let InterNode = node.arguments[0].body.body[0];
        if (!t.isExpressionStatement(InterNode)) return;
        if (!t.isCallExpression(InterNode.expression)) return;
        if (!t.isIdentifier(InterNode.expression.callee)) return;
        let InterName = InterNode.expression.callee.name;
        let scope = path.scope;//获取路径的作用域
        let binding = scope.getBinding(InterName);//

        if (!binding || binding.constantViolations.length > 0) {//检查该变量的值是否被修改--一致性检测
            return;
        }

        let paths = binding.referencePaths;//绑定引用的路径

        // if(paths.length==0)return;//引用路径必须等于1
        let paths_sums = 0;//路径计数

        paths.map(function (refer_path) {
            let bindpath = refer_path.parentPath;//父路径
            let break_sign = true;//while循环控制

            while (break_sign) {
                try {
                    bindpath.remove();//路径删除
                    paths_sums += 1;//处理数+1
                    break_sign = false;//while循环终止
                } catch (e) {
                    bindpath = bindpath.parentPath;
                }
            }

        });
        if (paths_sums == paths.length) {//若绑定的每个路径都已处理 ，则移除当前路径
            path.remove();//删除路径
        }
    }

    traverse(ast, {CallExpression: {exit: [del_setInterval]},});  // 删减定时器


    function DelDebuger_one(path) {
        // 将对象进行替换
        var node = path.node;//获取路径节点
        if (!t.isCallExpression(node.init)) return;//回调表达式过滤
        if (node.init.arguments.length !== 0) return;//实参个数为0
        if (!t.isFunctionExpression(node.init.callee)) return;//函数表达式过滤
        if (node.init.callee.params.length !== 0) return;//形参个数过滤
        let varName = node.id.name;//定义的变量名称
        let scope = path.scope;//获取路径的作用域
        let binding = scope.getBinding(varName);//
        if (!binding || binding.constantViolations.length > 0) {//检查该变量的值是否被修改--一致性检测
            return;
        }
        let paths = binding.referencePaths;//绑定引用的路径
        let paths_sums = 0;//路径计数
        paths.map(function (refer_path) {
            let bindpath = refer_path.parentPath;//父路径
            let BinNode = bindpath.node;//获取路径节点
            if (!t.isCallExpression(BinNode)) return;//不是回调表达式，退出
            if (BinNode.arguments.length !== 2) return;//形参不等于2个
            if (!t.isThisExpression(BinNode.arguments[0])) return;//this表达式
            let thisname = BinNode.callee.name;//节点名称
            if (thisname !== varName) return;//二次确认，名称不等退出
            let break_sign = true;//while循环控制

            while (break_sign) {
                try {
                    bindpath.remove();//路径删除
                    paths_sums += 1;//处理数+1
                    break_sign = false;//while循环终止
                } catch (e) {
                    bindpath = bindpath.parentPath;
                }
            }
        });
        if (paths_sums == paths.length) {//若绑定的每个路径都已处理 ，则移除当前路径
            path.remove();//删除路径
        }
    }

    traverse(ast, {VariableDeclarator: {exit: [DelDebuger_one]}});  //禁用debugger删减

    function DelDebuger_two(path) {
        //删减deugger未引用的函数
        var node = path.node;//获取路径节点

        let varName = node.id.name;//定义的变量名称

        let scope = path.scope;//获取路径的作用域
        let binding = scope.getBinding(varName);//

        if (!binding || binding.constantViolations.length > 0) {//检查该变量的值是否被修改--一致性检测
            return;
        }
        let paths = binding.referencePaths;//绑定引用的路径
        if (paths.length !== 0) return;//引用路径必须等于1

        path.remove();//删除路径


    }

    ast = parser.parse(generator(ast).code);
    traverse(ast, {FunctionDeclaration: {enter: [DelDebuger_two]}});  //禁用debugger删减


    function delConvParam(path) {
        // 替换空参数的自执行方法为顺序语句
        let node = path.node;//路径节点
        let node_exp = node.expression;//节点表达式

        //回调表达式|一元表达式
        if (!t.isCallExpression(node_exp) && !t.isUnaryExpression(node_exp))
            return;
        //实参列表为空且长度不大于0
        if (node.expression.arguments !== undefined && node.expression.arguments.length > 0)
            return;
        if (t.isUnaryExpression(node_exp) && node_exp.operator == '!') {//第二种自执行修改为第一种类型
            node_exp = node_exp.argument;
        }
        if (t.isCallExpression(node_exp)) {//第一种自执行
            if (!t.isFunctionExpression(node_exp.callee))//函数表达式判断
                return;
            let paramsList = node_exp.callee.params//形参列表
            if (paramsList.length > 0) {
                paramsList.map(function (letname) {
                    if (t.isIdentifier(letname)) {
                        //定义一个变量，并添加到结构体中
                        let varDec = t.VariableDeclarator(t.identifier(letname.name))//
                        let localAST = t.VariableDeclaration('var', [varDec]);//
                        node_exp.callee.body.body.unshift(localAST);//添加
                    }
                })
            }
            // 替换节点
            path.replaceInline(node_exp.callee.body.body);
        }

    }

    traverse(ast, {ExpressionStatement: delConvParam,})      // 替换空参数的自执行方法为顺序语句


    let {code} = generator(ast, opts = {jsescOption: {"minimal": true}})
    return code;

}


