import { describe, expect, it } from 'vitest'
import {
  MAX_JSONPATH_MATCHES,
  TREE_DEFAULT_EXPAND_DEPTH,
  buildJsonTree,
  evalJsonPath,
  evalJsonPathText,
  minifyJson,
} from '../jsonInspect'

const DOC = '{"store":{"book":[{"author":"A","price":8},{"author":"B","price":12}]}}'

describe('minify 压缩输出', () => {
  it('解析后单行序列化,去除所有空白差异', () => {
    expect(minifyJson('{ "a": 1,\n  "b": [1, 2] }')).toBe('{"a":1,"b":[1,2]}')
    expect(minifyJson('  null ')).toBe('null')
  })

  it('非法 JSON 抛错(组件收口展示)', () => {
    expect(() => minifyJson('{')).toThrow()
  })
})

describe('JSONPath 常用子集', () => {
  it('$ 与属性链', () => {
    const doc = { a: { b: 42 } }
    expect(evalJsonPath(doc, '$').map((m) => m.value)).toEqual([doc])
    expect(evalJsonPath(doc, '$.a.b')).toEqual([{ path: '$.a.b', value: 42 }])
  })

  it('brief 示例:$store.book[*].author 按文档顺序命中', () => {
    expect(evalJsonPathText(DOC, '$.store.book[*].author')).toEqual([
      { path: "$.store.book[0].author", value: 'A' },
      { path: "$.store.book[1].author", value: 'B' },
    ])
  })

  it('.* 对象通配与 [*] 数组通配', () => {
    const doc = { x: 1, y: 2 }
    expect(evalJsonPath(doc, '$.*').length).toBe(2)
    expect(evalJsonPath([10, 20, 30], '$[*]')[1]).toEqual({ path: '$[1]', value: 20 })
  })

  it('[n] 下标支持负数(从尾部计)', () => {
    const doc = { list: [1, 2, 3] }
    expect(evalJsonPath(doc, '$.list[-1]').map((m) => m.value)).toEqual([3])
    // 越界下标无匹配
    expect(evalJsonPath(doc, '$.list[9]')).toEqual([])
  })

  it('[start:end(:step)] 切片(JS 语义)', () => {
    const doc = { l: [0, 1, 2, 3, 4] }
    expect(evalJsonPath(doc, '$.l[1:3]').map((m) => m.value)).toEqual([1, 2])
    expect(evalJsonPath(doc, '$.l[-2:]').map((m) => m.value)).toEqual([3, 4])
    expect(evalJsonPath(doc, '$.l[::2]').map((m) => m.value)).toEqual([0, 2, 4])
  })

  it("联合索引/联合键:['a','b']、[0,2]", () => {
    const doc = { a: 1, b: 2, c: 3 }
    expect(evalJsonPath(doc, "$['a','c']").map((m) => m.value)).toEqual([1, 3])
    const arrDoc = { rows: [{ v: 1 }, { v: 2 }, { v: 3 }] }
    expect(evalJsonPath(arrDoc, '$.rows[0,2].v').map((m) => m.value)).toEqual([1, 3])
  })

  it('递归下降 $..name 含嵌套对象与数组内元素', () => {
    const doc = { a: { id: 1 }, b: [{ id: 2 }], c: { d: { id: 3 } } }
    expect(evalJsonPath(doc, '$..id').map((m) => m.value)).toEqual([1, 2, 3])
    // 根即匹配的形态($..id 的 $ 简写等价)
    expect(evalJsonPath(doc, '$.b[*].id').map((m) => m.value)).toEqual([2])
  })

  it("..* 收集全部后代值", () => {
    const doc = { a: { b: 7 } }
    const values = evalJsonPath(doc, '$..*').map((m) => m.value)
    expect(values).toContainEqual({ b: 7 })
    expect(values).toContainEqual(7)
  })

  it('引号键含特殊字符 $["a.b"] / 单引号', () => {
    const doc = { 'a.b': 9, k: { 'dot.name': 1 } }
    expect(evalJsonPath(doc, `$['a.b']`).map((m) => m.value)).toEqual([9])
    expect(evalJsonPath(doc, '$["k"]["dot.name"]').map((m) => m.value)).toEqual([1])
  })

  it('过滤与脚本表达式显式不支持(报错列出子集)', () => {
    expect(() => evalJsonPath({ a: [] }, '$.a[?(@.x)]')).toThrow(/不支持/)
    expect(() => evalJsonPath({}, '$.(a,b)')).toThrow(/不支持/)
  })

  it('表达式必须以 $ 开头;括号不闭合报错', () => {
    expect(() => evalJsonPath({}, 'a.b')).toThrow(/\$/)
    expect(() => evalJsonPath({}, '$.a[')).toThrow()
  })

  it(`命中数护栏 ${String(MAX_JSONPATH_MATCHES)} 截断`, () => {
    const big = Array.from({ length: MAX_JSONPATH_MATCHES + 500 }, (_, i) => i)
    const r = evalJsonPath(big, '$[*]')
    expect(r.length).toBe(MAX_JSONPATH_MATCHES)
    expect(r[MAX_JSONPATH_MATCHES - 1]?.value).toBe(MAX_JSONPATH_MATCHES - 1)
  })

  it('原型污染防护:只读自有属性,不触达继承链', () => {
    const doc = { own: 1 }
    // constructor/proto 路径不得泄露 Object/Function 原型链
    expect(evalJsonPath(doc, '$.__proto__.constructor')).toEqual([])
    expect(evalJsonPath(doc, '$.constructor.prototype')).toEqual([])
    expect(evalJsonPath(doc, '$..isPrototypeOf')).toEqual([])
    // JSON.parse 的 __proto__ 是自有数据属性,应被正常读取而非触发 getter
    const parsed = JSON.parse('{"__proto__":{"x":1}}')
    expect(evalJsonPath(parsed, '$.__proto__.x').map((m) => m.value)).toEqual([1])
    // wildcard 也只枚举自有键
    expect(Object.keys(JSON.parse('{"__proto__":1,"a":2}'))).toContain('__proto__')
    expect(evalJsonPath(JSON.parse('{"__proto__":1,"a":2}'), '$.*').length).toBe(2)
  })
})

describe('大 JSON 折叠树(buildJsonTree)', () => {
  const NESTED = '{"obj":{"deep":{"arr":[1,{"x":true}]},"s":"文本"},"n":null}'
  let root: ReturnType<typeof buildJsonTree>

  it('根容器与键名标签正确生成', () => {
    root = buildJsonTree(NESTED)
    expect(root.kind).toBe('object')
    expect(root.childCount).toBe(2)
    expect(root.depth).toBe(0)
    expect(root.children.map((c) => c.keyLabel)).toEqual(['obj', 'n'])
  })

  it('叶子预览带类型痕迹(null/bool/string/数字)', () => {
    const n = buildJsonTree('{"n":null,"t":false,"i":3,"s":"hi"}')
    const byKey = (k: string) => n.children.find((c) => c.keyLabel === k)!
    expect(byKey('n').preview).toBe('null')
    expect(byKey('t').preview).toBe('false')
    expect(byKey('i').preview).toBe('3')
    expect(byKey('s').preview).toBe('"hi"')
  })

  it('长字符串叶子截断并标注省略', () => {
    const long = 'x'.repeat(200)
    const n = buildJsonTree(JSON.stringify({ s: long }))
    expect(n.children[0]!.preview.length).toBeLessThan(160)
    expect(n.children[0]!.preview.endsWith('…')).toBe(true)
  })

  it('深度字段逐层递增;默认展开深度常量可消费', () => {
    root = buildJsonTree(NESTED)
    const obj = root.children.find((c) => c.keyLabel === 'obj')!
    const deep = obj.children.find((c) => c.keyLabel === 'deep')!
    const arr = deep.children.find((c) => c.keyLabel === 'arr')!
    expect(obj.depth).toBe(1)
    expect(deep.depth).toBe(2)
    expect(arr.depth).toBe(3)
    expect(TREE_DEFAULT_EXPAND_DEPTH).toBeGreaterThanOrEqual(1)
  })

  it('原型危险键名仅作字符串标签,树结构不含可写命名对象', () => {
    const n = buildJsonTree('{"__proto__":{"a":1},"constructor":2}')
    const labels = n.children.map((c) => c.keyLabel)
    expect(labels).toContain('__proto__')
    expect(labels).toContain('constructor')
    // 折叠集合按数字 id 记录,keyLabel 永远只是展示字符串
    expect(typeof n.children.find((c) => c.keyLabel === '__proto__')!.id).toBe('number')
  })

  it('非法 JSON 抛错', () => {
    expect(() => buildJsonTree('{bad')).toThrow()
  })

  it('数组根也支持', () => {
    const n = buildJsonTree('[{"v":1},{"v":2}]')
    expect(n.kind).toBe('array')
    expect(n.childCount).toBe(2)
    expect(n.children.map((c) => c.keyLabel)).toEqual(['0', '1'])
  })
})
