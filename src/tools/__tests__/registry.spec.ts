import { describe, expect, it } from 'vitest'
import { toolRegistry } from '../registry'

/**
 * 工具注册表共享模块(T1c 从 ToolsView 抽取):结构契约由本守则固定,
 * 保证侧栏渲染、命令面板数据源、?tool= 校验三者消费同一单一事实源。
 */
describe('toolRegistry 结构契约', () => {
  const allKeys = toolRegistry.flatMap((g) => g.items.map((i) => i.key))

  it('包含全部既有工具,key 唯一且分组顺序稳定', () => {
    expect(allKeys).toEqual([
      'json', 'ts', 'b64', 'hash', 'radix', 'regex', 'jwt', 'markdown', 'diff', 'cron', 'http',
    ])
    expect(toolRegistry.map((g) => g.group)).toEqual(['编解码', '哈希/ID', '文本', '接口'])
  })

  it('每个条目 label/key 非空字符串', () => {
    for (const item of toolRegistry.flatMap((g) => g.items)) {
      expect(item.label.length).toBeGreaterThan(0)
      expect(item.key.length).toBeGreaterThan(0)
    }
  })
})
