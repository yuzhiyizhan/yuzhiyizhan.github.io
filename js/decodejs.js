function decry_str(jscode) {
    let ast = parser.parse(jscode)
    traverse(ast, {
        'StringLiteral|NumericLiteral|DirectiveLiteral'(path) {//迭代字符串|迭代数组匹配--16进制文本还原
            delete path.node.extra; //删除节点的额外部分-触发原始值处理
        },
    });
    let {code} = generator(ast,opts = {jsescOption:{"minimal":true}})
    return code
}

function merge_obj(jscode){
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
    let {code} = generator(ast,opts = {jsescOption:{"minimal":true}})
    return code
}
