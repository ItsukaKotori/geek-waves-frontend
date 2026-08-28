/**
 * 命令面板条目类型:面板 UI 只认识这一种「可执行条目」,
 * 未来全站搜索等新数据源只需产出同型条目注入即可,组件不感知来源。
 */
export interface CommandItem {
  /** 全局唯一 id,同时用作 listbox option 的 DOM id 基底 */
  id: string
  /** 主显示文案(参与过滤匹配) */
  label: string
  /** 次要说明(如所属分组,展示在行尾,参与过滤匹配) */
  hint?: string
  /** 额外搜索关键词(空格分隔的别名串,参与过滤匹配,不展示) */
  keywords?: string
  /** 选中确认时执行的动作(选中后由面板统一关闭并归还焦点) */
  run: () => void
}
