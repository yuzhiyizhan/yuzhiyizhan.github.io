/*! For license information please see index.browser.js.LICENSE.txt */



var btn = document.getElementById('jsobfuscator_btn')
btn.addEventListener('click', function(e){
	var config = document.getElementById('jsobfuscator_config')
	var input = document.getElementById('jsobfuscator_input')
	var code = document.getElementById('jsobfuscator_code')
	
	config = eval('1,' + (config.value.trim() || '{}'))
	var obfuscationResult = JavaScriptObfuscator.obfuscate(input.value, config)
	code.value = obfuscationResult._obfuscatedCode
})

var btn = document.getElementById('jsobfuscator_get_config_btn')
btn.addEventListener('click', function(e){
	var config = document.getElementById('jsobfuscator_config')
	config.value = `
{
  compact: false,                            // 输出是否为一行内容（若selfDefending开关开启，则这里强制为true）
  controlFlowFlattening: true,               // 控制流平坦化开关
  controlFlowFlatteningThreshold: 0.75,      // 控制流使用率
  deadCodeInjection: true,                   // 注入死代码
  deadCodeInjectionThreshold: 0.4,           // 死代码注入率
  debugProtection: true,                     // debugger 反调试开关
  debugProtectionInterval: 4000,             // debugger 定时反调试开关时间间隔
  disableConsoleOutput: true,                // console 清空，反输出
  domainLock: [],                            // 指定运行作用域
  domainLockRedirectUrl: 'about:blank',      // 在非作用域运行时自动重定向的url
  forceTransformStrings: [],
  identifierNamesCache: null,
  identifierNamesGenerator: 'mangled',       // 变量混淆风格 hexadecimal:(_0xabc123) mangled:(a,b,c)
  identifiersDictionary: [],
  identifiersPrefix: '',
  ignoreImports: false,
  inputFileName: '',
  log: false,
  numbersToExpressions: false,
  optionsPreset: 'default',
  renameGlobals: false,
  renameProperties: false,
  renamePropertiesMode: 'safe',
  reservedNames: [],
  reservedStrings: [],
  seed: 0,
  selfDefending: true,                       // 函数格式化保护
  simplify: true,
  sourceMap: false,
  sourceMapBaseUrl: '',
  sourceMapFileName: '',
  sourceMapMode: 'separate',
  sourceMapSourcesMode: 'sources-content',
  splitStrings: false,                       // 字符串碎片化 "asdfasdf" => "asd" + "fas" + "df"
  splitStringsChunkLength: 10,               // 切片长度
  stringArray: true,                         // 属性字符串列表化开关（也就是ob头部一长串字符串）
  stringArrayCallsTransform: true,           // 属性字符串函数化比例
  stringArrayCallsTransformThreshold: 0.5,   // 转化比例
  stringArrayEncoding: ['base64'],           // 解密属性字符串的方式 'none','base64','rc4'
  stringArrayIndexesType: [
      'hexadecimal-number'
  ],
  stringArrayIndexShift: true,
  stringArrayRotate: true,
  stringArrayShuffle: true,
  stringArrayWrappersCount: 1,
  stringArrayWrappersChainedCalls: true,
  stringArrayWrappersParametersMaxCount: 2,
  stringArrayWrappersType: 'variable',
  stringArrayThreshold: 0.75,
  target: 'browser',
  transformObjectKeys: false,
  unicodeEscapeSequence: false
}
`
})

