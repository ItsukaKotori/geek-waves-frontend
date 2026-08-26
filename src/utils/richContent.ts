/**
 * 富文本渲染纯函数:HTML 探测、markdown 渲染、净化。
 * RichContent.vue 消费;所有 v-html 内容必须先过 sanitizeHtml(XSS 唯一放行口)。
 */
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { emojify } from 'node-emoji'

// GitHub/gemoji 短码与 node-emoji(CLDR 名)不一致的别名,渲染前统一归一化。
const EMOJI_ALIASES: Record<string, string> = {
  ':lady_beetle:': ':beetle:',
}

/** 归一化别名后转 markdown 前,用 emojify 把短码替换成 emoji;未识别的保持原样 */
function emojifyMarkdown(src: string): string {
  const aliased = src.replace(/:[\w+-]+:/g, (m) => EMOJI_ALIASES[m] ?? m)
  return emojify(aliased)
}

const BLOCK_TAG_RE = /<\/?(p|div|h[1-6]|ul|ol|pre|table|blockquote|figure|section)\b/i

/** 粗粒度探测输入是 HTML 还是 markdown/纯文本(trim 后以 < 开头,或含块级标签) */
export function looksLikeHtml(s?: string | null): boolean {
  const t = (s ?? '').trim()
  return t.startsWith('<') || BLOCK_TAG_RE.test(t)
}

/** markdown → HTML(GFM 表格 + 单换行断行)。
 * 先做 GitHub 表情短码转换(marked 不识别 :warning: 等),再交给 marked;
 * emojify 对未识别的短码原样保留,不破坏其余文本。 */
export function renderMarkdown(src: string): string {
  return String(marked.parse(emojifyMarkdown(src), { gfm: true, breaks: true, async: false }))
}

// 模块只被求值一次,hook 全局注册一次:外链统一新窗口打开并隔离 opener
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A' && node.getAttribute('href')) {
    node.setAttribute('target', '_blank')
    node.setAttribute('rel', 'noopener noreferrer')
  }
})

/** v-html 前的唯一净化口:剥脚本/事件属性,并给 a[href] 补外链安全属性 */
export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html)
}
