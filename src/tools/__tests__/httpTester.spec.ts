// @vitest-environment jsdom -- 历史函数默认后端为 localStorage(node 环境无此全局)
import { beforeEach, describe, expect, it } from 'vitest'
import {
  HISTORY_BODY_MAX_CHARS,
  HISTORY_LIMIT,
  MAX_RESPONSE_PREVIEW_CHARS,
  appendHistoryEntry,
  headerRowsToRecord,
  httpHistoryStorageKey,
  loadHttpHistory,
  parseCurl,
  recordToHeaderRows,
  renderBodyPreview,
  saveHttpHistory,
  type HttpHistoryEntry,
} from '../httpTester'

describe('parseCurl(声明范围内常用形态)', () => {
  it('最简形态:URL → GET', () => {
    expect(parseCurl('curl https://api.example.com/v1/users')).toEqual({
      method: 'GET',
      url: 'https://api.example.com/v1/users',
      headers: {},
      body: undefined,
    })
  })

  it('-X 与 --request 指定方法(空格/等号/紧连三种写法)', () => {
    for (const cmd of [
      'curl -X POST https://a.example.com',
      'curl -XPOST https://a.example.com',
      'curl --request=PUT https://a.example.com',
      "curl --request DELETE 'https://a.example.com'",
    ]) {
      const p = parseCurl(cmd)
      expect(p.url).toBe('https://a.example.com')
      expect(['POST', 'PUT', 'DELETE']).toContain(p.method)
    }
  })

  it('多个 -H 全部收集为请求头', () => {
    const p = parseCurl(
      [
        'curl https://a.example.com \\',
        "  -H 'Content-Type: application/json' \\",
        '  -H "Authorization: Bearer t0k3n" \\',
        '  -H X-Trace-Id:\\ abc-123',
      ].join('\n'),
    )
    expect(p.headers).toEqual({
      'Content-Type': 'application/json',
      Authorization: 'Bearer t0k3n',
      'X-Trace-Id': 'abc-123',
    })
  })

  it('-A/--user-agent、-e/--referer 映射对应头', () => {
    const p = parseCurl(
      "curl -A 'GeekBot/1.0' --referer 'https://ref.example.com' https://a.example.com",
    )
    expect(p.headers).toEqual({ 'User-Agent': 'GeekBot/1.0', Referer: 'https://ref.example.com' })
  })

  it('-u/--user 生成 Basic Authorization(UTF-8 安全)', () => {
    for (const cmd of [
      'curl -u user:密码 https://a.example.com',
      'curl --user u:v https://a.example.com',
    ]) {
      const p = parseCurl(cmd)
      const auth = p.headers.Authorization
      expect(auth).toMatch(/^Basic /)
      expect(typeof atob(auth.slice(6))).toBe('string')
    }
    // 空格后为 URL,故仅一个凭据参数
    expect(parseCurl('curl -u alice:wonderland https://a.example.com').headers.Authorization).toBe(
      `Basic ${btoa('alice:wonderland')}`,
    )
  })

  it('单双引号嵌套与引号相邻拼接', () => {
    const p = parseCurl(
      String.raw`curl -H "X-Mix: a'b\"c" 'https://a.example.com/post?q=1&r=2'`,
    )
    expect(p.url).toBe('https://a.example.com/post?q=1&r=2')
    expect(p.headers['X-Mix']).toBe(`a'b"c`)
  })

  it('--data-raw 内含空格与 JSON 不被拆散', () => {
    const json = '{"name": "张三", "tags": ["a b", "c"]}'
    const p = parseCurl(`curl -X POST https://a.example.com/api --data-raw '${json}'`)
    expect(p.body).toBe(json)
    expect(p.method).toBe('POST')
  })

  it('双引号包裹的 body 含转义引号与空格', () => {
    const p = parseCurl(String.raw`curl https://a.example.com -d "{\"k v\": \"x y z\"}"`)
    expect(p.body).toBe('{"k v": "x y z"}')
  })

  it('多个 data 片段按 curl 原语义以 & 连接,-d/--data/--data-binary 等价', () => {
    const p = parseCurl(
      'curl --data-binary a=1 --data "b=two words" --data c=3 https://a.example.com',
    )
    expect(p.body).toBe('a=1&b=two words&c=3')
    expect(p.method).toBe('POST')
  })

  it('无 -X 但携带 data 时方法推断为 POST;否则默认 GET', () => {
    expect(parseCurl('curl -d x=y https://a.example.com').method).toBe('POST')
    expect(parseCurl('curl https://a.example.com').method).toBe('GET')
  })

  it('--head/--get 长旗标映射请求方法,与短旗标 -I/-G 同语义', () => {
    expect(parseCurl('curl --head https://a.example.com').method).toBe('HEAD')
    expect(parseCurl('curl --get https://a.example.com').method).toBe('GET')
    expect(parseCurl('curl -I https://a.example.com').method).toBe('HEAD')
    expect(parseCurl('curl -sGk https://a.example.com').method).toBe('GET')
  })

  it('行尾反斜杠续行可解析', () => {
    const p = parseCurl(['curl https://a.example.com \\', '  -X PATCH'].join('\n'))
    expect(p.method).toBe('PATCH')
    expect(p.url).toBe('https://a.example.com')
  })

  it('解析失败给出明确错误而非静默:非 curl 开头', () => {
    expect(() => parseCurl('wget https://a.example.com')).toThrow(/curl/)
  })

  it('解析失败给出明确错误而非静默:缺少 URL / 非法协议 / 多 URL', () => {
    expect(() => parseCurl('curl -H A:b')).toThrow(/URL/)
    expect(() => parseCurl('curl ftp://a.example.com')).toThrow(/http/)
    expect(() => parseCurl('curl https://a.example.com https://b.example.com')).toThrow(/多 URL|一个 URL/)
  })

  it('未知长选项直接报错点名,不静默吞掉', () => {
    expect(() => parseCurl('curl --totally-unknown x https://a.example.com')).toThrow(
      /--totally-unknown/,
    )
  })

  it('未知短旗标簇报错点名(-z),纯噪声簇(-sik)放行', () => {
    expect(() => parseCurl('curl -sikz https://a.example.com')).toThrow(/-z/)
    expect(parseCurl('curl -sik https://a.example.com').url).toBe('https://a.example.com')
  })

  it('明确拒绝 --data-urlencode 与 @文件 数据来源', () => {
    expect(() => parseCurl('curl --data-urlencode "q=a b" https://a.example.com')).toThrow(
      /--data-urlencode/,
    )
    expect(() => parseCurl('curl --data @payload.json https://a.example.com')).toThrow(/@/)
  })

  it('-H 缺少冒号报错而不是误填', () => {
    expect(() => parseCurl("curl -H 'BrokenHeader' https://a.example.com")).toThrow(/-H|冒号/)
  })
})

describe('header 行编辑序列化', () => {
  it('行 → Record:键 trim、空键跳过、重复键后值覆盖', () => {
    expect(
      headerRowsToRecord([
        { key: ' A ', value: ' 1' },
        { key: '', value: 'ignored' },
        { key: '   ', value: 'still ignored' },
        { key: 'B', value: '' },
        { key: 'A', value: 'final' },
      ]),
    ).toEqual({ A: 'final', B: '' })
  })

  it('Record → 行 一一还原(curl/历史回填共用)', () => {
    expect(recordToHeaderRows({ Accept: '*/*', 'X-Empty': '' })).toEqual([
      { key: 'Accept', value: '*/*' },
      { key: 'X-Empty', value: '' },
    ])
  })

  it('行 ⇄ Record 往返不丢语义', () => {
    const rows = [{ key: 'Authorization', value: 'Bearer tok' }]
    expect(recordToHeaderRows(headerRowsToRecord(rows))).toEqual(rows)
  })
})

describe('响应美化与截断提示', () => {
  it('JSON Content-Type 自动 pretty-print 且忠实展示原文结构', () => {
    const v = renderBodyPreview('application/json;charset=utf-8', '{"ok":true}')
    expect(v.pretty).toBe(true)
    expect(v.truncated).toBe(false)
    expect(v.text).toBe('{\n  "ok": true\n}')
  })

  it('非 JSON 或损坏 JSON 保持原样不做伪装', () => {
    const raw = '{"broken:'
    const notJson = renderBodyPreview('application/json', raw)
    expect(notJson.pretty).toBe(false)
    expect(notJson.text).toBe(raw)

    const plain = renderBodyPreview('text/plain', 'just text {"nope"}')
    expect(plain.pretty).toBe(false)
    expect(plain.text).toBe('just text {"nope"}')
  })

  it(`超过 ${MAX_RESPONSE_PREVIEW_CHARS} 字符截断,指示器数值真实`, () => {
    const long = 'x'.repeat(MAX_RESPONSE_PREVIEW_CHARS + 7)
    const v = renderBodyPreview('application/json', JSON.stringify(long))
    // pretty 后字符串长度远超阈值才触发
    expect(v.totalChars).toBeGreaterThan(MAX_RESPONSE_PREVIEW_CHARS)
    expect(v.truncated).toBe(true)
    expect(v.previewChars).toBe(MAX_RESPONSE_PREVIEW_CHARS)
    expect(v.text.length).toBe(MAX_RESPONSE_PREVIEW_CHARS)
  })

  it('阈值边界:恰好等于 MAX 不截断', () => {
    const exact = 'y'.repeat(MAX_RESPONSE_PREVIEW_CHARS)
    const v = renderBodyPreview(undefined, exact)
    expect(v.truncated).toBe(false)
    expect(v.text.length).toBe(MAX_RESPONSE_PREVIEW_CHARS)
  })
})

describe('请求历史(localStorage,20 条上限)', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('存储键沿用 geekwaves-tools: 命名空间', () => {
    expect(httpHistoryStorageKey()).toMatch(/^geekwaves-tools:/)
  })

  it('新条目置顶、超限淘汰最旧', () => {
    let list: HttpHistoryEntry[] = []
    for (let i = 0; i < HISTORY_LIMIT + 5; i++) {
      list = appendHistoryEntry(list, {
        method: 'GET',
        url: `https://a.example.com/${i}`,
        headers: {},
        body: '',
      })
    }
    expect(list.length).toBe(HISTORY_LIMIT)
    expect(list[0]!.url).toBe('https://a.example.com/24')
    expect(list.at(-1)!.url).toBe('https://a.example.com/5')
  })

  it('完全相同的请求合并为一条并前置(摘要去重)', () => {
    const base = { method: 'POST', url: 'https://a.example.com/x', body: 'a=b' } as const
    let list: HttpHistoryEntry[] = appendHistoryEntry([], { ...base, headers: {} })
    list = appendHistoryEntry(list, {
      method: 'GET',
      url: 'https://a.example.com/y',
      headers: {},
      body: '',
    })
    list = appendHistoryEntry(list, { ...base, headers: {} })
    expect(list.length).toBe(2)
    expect(list[0]).toMatchObject(base)
  })

  it('历史条目 body 按 HISTORY_BODY_MAX_CHARS 封顶(存储体积上界)', () => {
    const entry: HttpHistoryEntry = {
      method: 'POST',
      url: 'https://a.example.com/big',
      headers: {},
      body: 'z'.repeat(HISTORY_BODY_MAX_CHARS * 3),
    }
    let list = appendHistoryEntry([], entry)
    expect(list[0]!.body.length).toBe(HISTORY_BODY_MAX_CHARS)
  })

  it('历史条目过长的头值同样封顶(单键 Authorization 场景)', () => {
    const list = appendHistoryEntry([], {
      method: 'GET',
      url: 'https://a.example.com/',
      headers: { Authorization: 'B'.repeat(HISTORY_BODY_MAX_CHARS * 2) },
      body: '',
    })
    expect(list[0]!.headers.Authorization!.length).toBe(HISTORY_BODY_MAX_CHARS)
  })

  it('save/load 往返一致;脏数据降级为空历史且不抛错', () => {
    const list: HttpHistoryEntry[] = [
      { method: 'GET', url: 'https://a.example.com/a', headers: { A: '1' }, body: '' },
      { method: 'DELETE', url: 'https://a.example.com/b', headers: {}, body: 'x' },
    ]
    saveHttpHistory(list)
    expect(loadHttpHistory()).toEqual(list)

    localStorage.setItem(httpHistoryStorageKey(), '{not-json')
    expect(loadHttpHistory()).toEqual([])
    localStorage.setItem(httpHistoryStorageKey(), '"i am string"')
    expect(loadHttpHistory()).toEqual([])
  })
})
