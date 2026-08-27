// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { RECENT_TOOLS_MAX, RECENT_TOOLS_STORAGE_KEY, loadRecentTools, useRecentTools } from '../useRecentTools'

/**
 * useRecentTools:工具中心「最近使用」的存储与响应式层。
 * 覆盖:写入持久化 / 去重 / 上限 / 时间倒序 / ?tool= 直达同源计入 /
 * 脏数据兜底 / 存储失败降级。
 */

const KEY = RECENT_TOOLS_STORAGE_KEY

const memoryBackend = (): Storage => ({
  length: 0,
  clear: () => undefined,
  key: () => null,
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined,
})

/** 从 storage 读取原始快照(test 视角验证落盘内容) */
function storedRaw(): string | null {
  return localStorage.getItem(KEY)
}

function storedEntries(): Array<{ key: string; usedAt: number }> {
  return JSON.parse(storedRaw() ?? '[]')
}

beforeEach(() => {
  localStorage.clear()
})

describe('RECENT_TOOLS_STORAGE_KEY', () => {
  it('沿用 geekwaves-tools 命名空间(github 惯例见 brief)', () => {
    expect(KEY).toBe('geekwaves-tools:recent')
  })

  it('上限为 5(brief 建议 N=5)', () => {
    expect(RECENT_TOOLS_MAX).toBe(5)
  })
})

describe('loadRecentTools(纯函数)', () => {
  it('空存储返回空数组且不回写', () => {
    expect(loadRecentTools()).toEqual([])
    expect(storedRaw()).toBeNull()
  })

  it('合法快照按时间倒序返回(新在前)', () => {
    localStorage.setItem(
      KEY,
      JSON.stringify([
        { key: 'b64', usedAt: 100 },
        { key: 'json', usedAt: 300 },
        { key: 'ts', usedAt: 200 },
      ]),
    )
    expect(loadRecentTools().map((e) => e.key)).toEqual(['json', 'ts', 'b64'])
  })

  it('脏数据(JSON 坏串/非数组)不抛错,按空处理', () => {
    localStorage.setItem(KEY, '{broken!')
    expect(loadRecentTools()).toEqual([])

    localStorage.setItem(KEY, '"str"')
    expect(loadRecentTools()).toEqual([])

    localStorage.setItem(KEY, '{"key":"json"}')
    expect(loadRecentTools()).toEqual([])
  })

  it('条目级脏数据被剔除,合法条目保留(key 非字符串/usedAt 非有限数字均无效)', () => {
    localStorage.setItem(
      KEY,
      JSON.stringify([
        { key: 'json', usedAt: 300 },
        { key: 42, usedAt: 200 },
        { key: 'ts', usedAt: Number.NaN },
        { key: 'b64', usedAt: 100 },
        'junk',
        null,
      ]),
    )
    expect(loadRecentTools().map((e) => e.key)).toEqual(['json', 'b64'])
  })
})

describe('useRecentTools.record(组合式)', () => {
  it('首次记录即持久化,含时间戳', () => {
    const { record } = useRecentTools()
    record('json', 1000)

    expect(storedEntries()).toEqual([{ key: 'json', usedAt: 1000 }])
  })

  it('去重:同名 key 再记录只留一条并提到最前、更新时间戳', () => {
    const { record } = useRecentTools()
    record('json', 1000)
    record('ts', 2000)
    record('json', 3000)

    expect(storedEntries().map((e) => e.key)).toEqual(['json', 'ts'])
    expect(storedEntries()[0]).toEqual({ key: 'json', usedAt: 3000 })
  })

  it(`上限 ${RECENT_TOOLS_MAX}:超过后淘汰最旧条目`, () => {
    const { record } = useRecentTools()
    ;['a', 'b', 'c', 'd', 'e'].forEach((k, i) => record(k, i + 1))
    record('f', 100)

    const keys = storedEntries().map((e) => e.key)
    expect(keys).toHaveLength(RECENT_TOOLS_MAX)
    expect(keys).toEqual(['f', 'e', 'd', 'c', 'b']) // 最旧的 'a' 出局
  })

  it('record 早于旧条目时间戳时仍按 usedAt 倒序排列', () => {
    localStorage.setItem(KEY, JSON.stringify([{ key: 'old', usedAt: 500 }]))
    const { record } = useRecentTools()
    record('newer-key', 100)

    expect(loadRecentTools().map((e) => e.key)).toEqual(['old', 'newer-key'])
  })

  it('Storage 写入失败时静默降级,内存态仍可用不抛错', () => {
    const quotaFull: Storage = memoryBackend()
    quotaFull.getItem = () => null
    quotaFull.setItem = () => {
      throw new DOMException('quota exceeded', 'QuotaExceededError')
    }

    const { record } = useRecentTools(quotaFull)
    expect(() => record('json', 7)).not.toThrow()

    const api = useRecentTools()
    api.record('b64', 9)
    expect(api.recentTools.value.map((e) => e.key)).toEqual(['b64'])
  })
})

describe('useRecentTools.recentTools(响应式列表)', () => {
  it('惰性注水:实例创建时读入已有持久化数据(供侧栏直达渲染)', () => {
    localStorage.setItem(
      KEY,
      JSON.stringify([
        { key: 'hash', usedAt: 20 },
        { key: 'jwt', usedAt: 40 },
      ]),
    )
    const { recentTools } = useRecentTools()
    expect(recentTools.value.map((e) => e.key)).toEqual(['jwt', 'hash'])
  })

  it('record 后列表实时刷新(驱动侧栏分组重渲染)', () => {
    const { recentTools, record } = useRecentTools()
    expect(recentTools.value).toEqual([])

    record('regex', 1)
    record('b64', 2)

    expect(recentTools.value.map((e) => e.key)).toEqual(['b64', 'regex'])
  })

  it('可注入自定义 Storage 后端', () => {
    const backed = memoryBackend()
    const { record } = useRecentTools(backed)
    expect(() => record('json', 1)).not.toThrow()
    expect(localStorage.getItem(KEY)).toBeNull() // 未污染真实后端
  })
})
