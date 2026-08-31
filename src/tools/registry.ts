import { defineAsyncComponent, type Component } from 'vue'

/**
 * 工具中心注册表 —— 单一事实源。
 * 消费方:MainLayout 侧栏 ToolRail/命令面板、ToolsView 面板渲染、?tool= 校验。
 * 分组口径参考 oh-my-tools(格式化 / 编码解码 / 转换 / 网络 / 开发 / 生成),
 * 命名沿用本站侧栏简短惯例;component 为惰性工厂(defineAsyncComponent),
 * 本模块静态零依赖各工具 chunk。
 */
export interface ToolItem {
  key: string
  label: string
  /** 工作台头部的一句说明(ToolHead 消费,保持工具内不再重复标题) */
  description: string
  /** 24 viewBox 描边图标(路径 d 数组,与 MainLayout 侧栏同款内联惯例) */
  icon: string[]
  component: Component
}

export interface ToolGroup {
  group: string
  items: ToolItem[]
}

export const toolRegistry: ToolGroup[] = [
  {
    group: '格式化',
    items: [
      {
        key: 'json',
        label: 'JSON 工具',
        description: '格式化 / 压缩 / 树视图,与 YAML、TOML、XML 等互转,支持 JSONPath 查询',
        icon: [
          'M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5c0 1.1.9 2 2 2h1',
          'M16 21h1a2 2 0 0 0 2-2v-5c0-1.1.9-2 2-2a2 2 0 0 1-2-2V5a2 2 0 0 0-2-2h-1',
        ],
        component: defineAsyncComponent(() => import('../components/tools/JsonFormatter.vue')),
      },
      {
        key: 'diff',
        label: '文本 diff',
        description: '双栏行级文本对比,新增 / 删除 / 未变分色标注',
        icon: ['m16 3 4 4-4 4', 'M20 7H4', 'm8 21-4-4 4-4', 'M4 17h16'],
        component: defineAsyncComponent(() => import('../components/tools/TextDiff.vue')),
      },
    ],
  },
  {
    group: '编解码',
    items: [
      {
        key: 'b64',
        label: 'Base64/URL',
        description: 'Base64 / URL / Hex 编码解码,图片 dataURL 预览,解码乱码诊断',
        icon: ['m16 18 6-6-6-6', 'm8 6-6 6 6 6'],
        component: defineAsyncComponent(() => import('../components/tools/EncoderDecoder.vue')),
      },
      {
        key: 'hash',
        label: '哈希计算',
        description: '文本与文件哈希(MD5 / SHA 全系),UUID v4 / v7 批量生成',
        icon: ['M4 9h16', 'M4 15h16', 'M10 3 8 21', 'M16 3l-2 18'],
        component: defineAsyncComponent(() => import('../components/tools/HashUuid.vue')),
      },
      {
        key: 'jwt',
        label: 'JWT 解析',
        description: '解码 JWT 三段结构,alg 安全分级,iat / nbf / exp 人性化',
        icon: [
          'm21 2-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0 3 3L22 7l-3-3m-3.5 3.5L19 4',
        ],
        component: defineAsyncComponent(() => import('../components/tools/JwtParser.vue')),
      },
    ],
  },
  {
    group: '转换',
    items: [
      {
        key: 'ts',
        label: '时间戳',
        description: '时间戳与日期时间互转,多格式多时区同显,支持相对时间解析',
        icon: ['M12 2a10 10 0 1 0 0 20 10 10 0 1 0 0-20', 'M12 6v6l4 2'],
        component: defineAsyncComponent(() => import('../components/tools/Timestamp.vue')),
      },
      {
        key: 'radix',
        label: '进制转换',
        description: '一次输入,2 / 8 / 10 / 16 与自定义进制同时联动',
        icon: [
          'M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z',
        ],
        component: defineAsyncComponent(() => import('../components/tools/Radix.vue')),
      },
      {
        key: 'color',
        label: '颜色工具',
        description: 'HEX / RGB / HSL 互转,WCAG 对比度与 AA / AAA 判级',
        icon: [
          'M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z',
        ],
        component: defineAsyncComponent(() => import('../components/tools/ColorTool.vue')),
      },
    ],
  },
  {
    group: '网络',
    items: [
      {
        key: 'http',
        label: 'HTTP 接口测试',
        description: 'HTTP 请求测试:curl 导入、Headers 行编辑、请求历史',
        icon: [
          'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20',
          'M2 12h20',
          'M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z',
        ],
        component: defineAsyncComponent(() => import('../components/tools/HttpTester.vue')),
      },
      {
        key: 'cidr',
        label: 'CIDR/IP 子网计算',
        description: 'IPv4 / IPv6 CIDR 子网计算:掩码、范围、可用主机数',
        icon: [
          'M12 3a2 2 0 1 0 0 4 2 2 0 1 0 0-4',
          'M5 17a2 2 0 1 0 0 4 2 2 0 1 0 0-4',
          'M19 17a2 2 0 1 0 0 4 2 2 0 1 0 0-4',
          'M12 7v3',
          'm12 10-6 6',
          'm12 10 6 6',
        ],
        component: defineAsyncComponent(() => import('../components/tools/CidrCalc.vue')),
      },
    ],
  },
  {
    group: '开发',
    items: [
      {
        key: 'regex',
        label: '正则视觉匹配',
        description: '正则实时匹配与高亮,捕获组、替换预览、常用预设,内置回溯防护',
        icon: ['M12 6v12', 'M17.196 9 6.804 15', 'M6.804 9l10.392 6'],
        component: defineAsyncComponent(() => import('../components/tools/RegexMatch.vue')),
      },
      {
        key: 'cron',
        label: 'crontab 解析',
        description: 'crontab 表达式转中文描述,预测未来 5 次运行时间',
        icon: ['M10 2h4', 'M12 14l3-3', 'M4.953 4.5a10 10 0 1 0 14.094 0'],
        component: defineAsyncComponent(() => import('../components/tools/CronParser.vue')),
      },
      {
        key: 'chmod',
        label: 'Chmod 计算',
        description: '文件权限八进制、符号形式与勾选位三方互算,特殊位与常用预设,生成 chmod 命令',
        icon: ['M7 11V7a5 5 0 0 1 10 0v4', 'M5 11h14v10H5z'],
        component: defineAsyncComponent(() => import('../components/tools/ChmodCalc.vue')),
      },
    ],
  },
  {
    group: '生成',
    items: [
      {
        key: 'pwd',
        label: '密码/Token',
        description: 'Web Crypto 随机密码与 Token 生成,熵估算与强度分级',
        icon: [
          'M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z',
        ],
        component: defineAsyncComponent(() => import('../components/tools/PasswordGenerator.vue')),
      },
    ],
  },
]

/** 展平后的全量工具条目(按注册表顺序) */
export const allToolItems: ToolItem[] = toolRegistry.flatMap((g) => g.items)

/**
 * ?tool= 解析统一语义(ToolsView.activeItem 与 MainLayout 命令面板共用):
 * 合法字符串取对应 key;缺失/非法回落注册表首项;空注册表兜底空串。
 */
export function resolveToolKey(requested: unknown): string {
  const valid =
    typeof requested === 'string' ? allToolItems.find((i) => i.key === requested) : undefined
  return valid?.key ?? allToolItems[0]?.key ?? ''
}
