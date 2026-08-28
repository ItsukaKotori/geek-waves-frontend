import { defineAsyncComponent, type Component } from 'vue'

/**
 * 工具中心注册表 —— 单一事实源。
 * 消费方:ToolsView 侧栏/面板渲染、?tool= 校验、MainLayout 命令面板数据源。
 * component 为惰性工厂(defineAsyncComponent),本模块静态零依赖各工具 chunk。
 */
export interface ToolItem {
  key: string
  label: string
  component: Component
}

export interface ToolGroup {
  group: string
  items: ToolItem[]
}

export const toolRegistry: ToolGroup[] = [
  {
    group: '编解码',
    items: [
      {
        key: 'json',
        label: 'JSON 转换',
        component: defineAsyncComponent(() => import('../components/tools/JsonFormatter.vue')),
      },
      {
        key: 'ts',
        label: '时间戳',
        component: defineAsyncComponent(() => import('../components/tools/Timestamp.vue')),
      },
      {
        key: 'b64',
        label: 'Base64/URL',
        component: defineAsyncComponent(() => import('../components/tools/EncoderDecoder.vue')),
      },
    ],
  },
  {
    group: '哈希/ID',
    items: [
      {
        key: 'hash',
        label: '哈希计算',
        component: defineAsyncComponent(() => import('../components/tools/HashUuid.vue')),
      },
      {
        key: 'radix',
        label: '进制转换',
        component: defineAsyncComponent(() => import('../components/tools/Radix.vue')),
      },
    ],
  },
  {
    group: '文本',
    items: [
      {
        key: 'regex',
        label: '正则视觉匹配',
        component: defineAsyncComponent(() => import('../components/tools/RegexMatch.vue')),
      },
      {
        key: 'jwt',
        label: 'JWT 解析',
        component: defineAsyncComponent(() => import('../components/tools/JwtParser.vue')),
      },
      {
        key: 'markdown',
        label: 'Markdown 预览',
        component: defineAsyncComponent(() => import('../components/tools/MarkdownPreview.vue')),
      },
    ],
  },
  {
    group: '接口',
    items: [
      {
        key: 'http',
        label: 'HTTP 接口测试',
        component: defineAsyncComponent(() => import('../components/tools/HttpTester.vue')),
      },
    ],
  },
]

/** 展平后的全量工具条目(按注册表顺序) */
export const allToolItems: ToolItem[] = toolRegistry.flatMap((g) => g.items)
