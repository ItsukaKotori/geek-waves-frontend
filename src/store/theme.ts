import { defineStore } from 'pinia'

export const LIGHT_THEME = 'gw-light'
export const DARK_THEME = 'gw-dark'

const STORAGE_KEY = 'geekwaves-theme'
const DEFAULT_THEME = LIGHT_THEME

/** 白名单校验:存储值非法(旧主题名/脏数据)时回退亮色 */
export function resolveTheme(raw: string | null | undefined): string {
  return raw === DARK_THEME ? DARK_THEME : LIGHT_THEME
}

function readStoredTheme(): string {
  try {
    return resolveTheme(localStorage.getItem(STORAGE_KEY))
  } catch {
    return DEFAULT_THEME
  }
}

function persistTheme(theme: string) {
  try {
    localStorage.setItem(STORAGE_KEY, theme)
  } catch {
    // 隐私模式等场景写入失败,静默忽略
  }
}

export const useThemeStore = defineStore('theme', {
  state: () => ({
    theme: readStoredTheme(),
  }),
  actions: {
    apply() {
      document.documentElement.dataset.theme = this.theme
    },
    toggle() {
      this.theme = this.theme === LIGHT_THEME ? DARK_THEME : LIGHT_THEME
      persistTheme(this.theme)
      this.apply()
    },
  },
})
