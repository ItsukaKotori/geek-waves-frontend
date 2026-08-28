/**
 * Markdown 预览纯函数层(FE10 T2 批次一):
 * 管道复用 utils/richContent 的 renderMarkdown(marked,GFM 表格/任务列表/删除线)
 * 与 sanitizeHtml(DOMPurify)——站内 v-html 的唯一净化口,不重复实现解析逻辑。
 * 组件侧 v-html 只允许绑定本模块输出。
 */
import { renderMarkdown, sanitizeHtml } from '../utils/richContent'

/** markdown 源 → 净化后 HTML(空输入返回空串,保持预览区无残留) */
export function renderMarkdownPreview(source: string): string {
  if (source.trim() === '') return ''
  return sanitizeHtml(renderMarkdown(source))
}
