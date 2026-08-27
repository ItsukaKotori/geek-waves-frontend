// @vitest-environment jsdom
import { beforeEach, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import * as newsApi from '../../api/news'
import type { NewsItem, PageResult } from '../../types'
import NewsView from '../NewsView.vue'

/**
 * AiPanel 显式 :key(NewsView 弹窗内)。
 *
 * 问题形态:详情接口竞态时(弹窗未展示前快速点开两条资讯),
 * current 由 A 切到 B 而弹窗内容未卸载;AiPanel 本地 text 仅在
 * 创建时从 props.existing 快照一次,若无显式 key 复用旧实例会把
 * A 的解读文本串到 B 上。
 */

vi.mock('../../api/news', () => ({
  listNews: vi.fn(),
  fetchNewsDetail: vi.fn(),
  fetchSources: vi.fn(),
  fetchFrameworks: vi.fn(),
}))

const listNewsMock = vi.mocked(newsApi.listNews)
const fetchNewsDetailMock = vi.mocked(newsApi.fetchNewsDetail)
const fetchSourcesMock = vi.mocked(newsApi.fetchSources)
const fetchFrameworksMock = vi.mocked(newsApi.fetchFrameworks)

function newsItem(partial: Partial<NewsItem> & Pick<NewsItem, 'id'>): NewsItem {
  return {
    sourceId: 1,
    category: 'NEWS',
    title: `资讯 ${partial.id}`,
    aiStatus: 'NONE',
    ...partial,
  }
}

function pageOf(records: NewsItem[]): PageResult<NewsItem> {
  return { records, current: 1, size: 20, total: records.length, pages: 1 }
}

/** 详情请求手动放行,模拟竞态时序 */
let releaseDetail: Map<number, (item: NewsItem) => void>

function stubDetailFetch(): void {
  releaseDetail = new Map()
  fetchNewsDetailMock.mockImplementation(
    (id) =>
      new Promise<NewsItem>((resolve) => {
        releaseDetail.set(Number(id), resolve)
      }),
  )
}

async function settle(): Promise<void> {
  await flushPromises()
  await flushPromises()
  await nextTick()
}

let wrapper: VueWrapper | null = null

// jsdom 未实现 <dialog>,以最小行为桩替代(showModal 标记 open,close 触发 close 事件)
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.open = true
  }
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.open = false
    this.dispatchEvent(new Event('close'))
  }
})

beforeEach(() => {
  localStorage.clear()
  fetchSourcesMock.mockResolvedValue([])
  fetchFrameworksMock.mockResolvedValue([])
  listNewsMock.mockResolvedValue(
    pageOf([newsItem({ id: 1 }), newsItem({ id: 2 })]),
  )
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  vi.clearAllMocks()
})

async function openCard(index: number): Promise<void> {
  if (!wrapper) throw new Error('未挂载')
  const cards = wrapper.findAll('article[role="button"]')
  if (cards.length < 2) throw new Error(`卡片数量不足:${cards.length}`)
  await cards[index]!.trigger('click')
  // open() 悬挂在 fetchNewsDetail 的 await 上,后续由 release 放行
}

async function mountView(): Promise<void> {
  wrapper = mount(NewsView)
  await settle()
}

function findButton(wrapper: VueWrapper, label: string) {
  const btn = wrapper.findAll('button').find((b) => b.text().trim() === label)
  if (!btn) throw new Error(`按钮不存在:${label}`)
  return btn
}

describe('AiPanel 显式 :key', () => {
  it('详情竞态导致 current 在挂载中切换时,面板不复用旧实例的陈旧状态', async () => {
    stubDetailFetch()
    await mountView()

    // 快速连点两条资讯:两次详情请求同时在途
    await openCard(0)
    await openCard(1)

    // 条目甲先返回:弹窗挂载,AiPanel 以其已有解读初始化
    releaseDetail.get(1)!(
      newsItem({ id: 1, title: '条目甲', aiSummary: '这是条目甲的旧解读' }),
    )
    await settle()
    expect(wrapper!.text()).toContain('这是条目甲的旧解读')

    // 条目乙随后返回而弹窗仍开着:current 未经过 null 卸载直接切换
    releaseDetail.get(2)!(
      newsItem({ id: 2, title: '条目乙', aiSummary: undefined }),
    )
    await settle()

    const modalText = wrapper!.find('.modal-box').text()

    // 有显式 key:面板随新条目重建 → 展示空态占位,不再残留条目甲的文本
    expect(modalText).not.toContain('这是条目甲的旧解读')
    expect(modalText).toContain('点击「解读」')
  })

  it('正常关闭弹窗后再打开另一条资讯,面板按新条目初始化(既有行为保持)', async () => {
    stubDetailFetch()
    await mountView()

    await openCard(0)
    releaseDetail.get(1)!(
      newsItem({ id: 1, title: '条目甲', aiSummary: '甲的解读' }),
    )
    await settle()
    expect(wrapper!.find('.modal-box').text()).toContain('甲的解读')

    // 通过 modal-action「关闭」按钮走真实 closeModal → dialog.close 事件链路
    await findButton(wrapper!, '关闭').trigger('click')
    await settle()
    expect(wrapper!.find('.modal-box').exists()).toBe(false)
    expect(wrapper!.text()).not.toContain('甲的解读')

    await openCard(1)
    releaseDetail.get(2)!(newsItem({ id: 2, title: '条目乙', aiSummary: undefined }))
    await settle()

    const modalText = wrapper!.find('.modal-box').text()
    expect(modalText).toContain('点击「解读」')
    expect(modalText).not.toContain('甲的解读')
  })
})
