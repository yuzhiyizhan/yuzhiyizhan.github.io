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

function NumListReduce(jscode){
    let ast = parser.parse(jscode)
    function NumListReduces(path) {
        // 数组函数简化
        let node = path.node;//获取路径节点
        if(!t.isIdentifier(node.id))return;//不是标识符则退出
        if(!t.isArrayExpression(node.init))return;//不是数组表达式则退出
        let name=node.id.name;//数组的名称
        let init_obj=node.init.elements;//数组元素
        if (init_obj.length==0)return;//数组元素为空则退出

        let scope = path.scope;//获取路径的作用域
        let binding = scope.getBinding(name);//获取绑定

        if (!binding || binding.constantViolations.length > 0) {//检查该变量的值是否被修改--一致性检测
            return;
        }
        let paths = binding.referencePaths;//绑定引用的路径
        let paths_sums=0;//路径计数
        paths.map(function (refer_path) {
            let bindpath = refer_path.parentPath;//父路径
            let binnode=bindpath.node;//父路径的节点
            if(!t.isMemberExpression(bindpath.node))return;//数字表达式判断
            if (binnode.object.name!=name)return;//标识符判定
            if(!t.isNumericLiteral(binnode.property))return;//数字类型判断
            bindpath.replaceInline(init_obj[binnode.property.value])//子节点信息替换
            paths_sums+=1;//路径+1
        });
        if (paths_sums==paths.length){//若绑定的每个路径都已处理 ，则移除当前路径
            path.remove();//删除路径
        }

    }
    traverse(ast, {VariableDeclarator: {exit: [NumListReduces]},});
    let {code} = generator(ast,opts = {jsescOption:{"minimal":true}})
    return code;
}


