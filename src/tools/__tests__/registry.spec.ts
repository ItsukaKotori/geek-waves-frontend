import { describe, expect, it } from 'vitest'
import { resolveToolKey, toolRegistry } from '../registry'

/**
 * 工具注册表共享模块(T1c 从 ToolsView 抽取):结构契约由本守则固定,
 * 保证侧栏渲染、命令面板数据源、?tool= 校验三者消费同一单一事实源。
 */
describe('toolRegistry 结构契约', () => {
  const allKeys = toolRegistry.flatMap((g) => g.items.map((i) => i.key))

  it('包含全部既有工具,key 唯一且分组顺序稳定', () => {
    expect(allKeys).toEqual([
      'json', 'codegen', 'ts', 'b64', 'hash', 'radix', 'pwd', 'regex', 'jwt', 'markdown', 'diff', 'cron', 'http', 'cidr', 'color',
    ])
  })

  it('分组顺序固定,新增分组按区块插入', () => {
    expect(toolRegistry.map((g) => g.group)).toEqual(['编解码', '哈希/ID', '生成', '文本', '接口', '计算'])
  })

  it('每个条目 label/key 非空字符串', () => {
    for (const item of toolRegistry.flatMap((g) => g.items)) {
      expect(item.label.length).toBeGreaterThan(0)
      expect(item.key.length).toBeGreaterThan(0)
    }
  })
})

describe('resolveToolKey(?tool= 统一解析语义)', () => {
  it('合法 key 原样返回', () => {
    expect(resolveToolKey('radix')).toBe('radix')
  })

  it('非字符串(缺失 null/undefined、重复参数数组)回落注册表首项', () => {
    expect(resolveToolKey(undefined)).toBe('json')
    expect(resolveToolKey(null)).toBe('json')
    expect(resolveToolKey(['radix'])).toBe('json')
  })

  it('未知 key 回落注册表首项(与首项 key 一致)', () => {
    expect(resolveToolKey('nope')).toBe('json')
    expect(resolveToolKey('nope')).toBe(toolRegistry[0]!.items[0]!.key)
  })
})
