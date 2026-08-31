<script setup lang="ts">
import { ref, watch } from 'vue'
import { bitsToOctal, chmodCommand, parseOctal, toSymbolic, CHMOD_PRESETS, type ChmodBits } from '../../tools/chmod'
import { useCopy } from '../../composables/useCopy'
import { useToolState } from '../../composables/useToolState'
import PaneShell from '../tools-ui/PaneShell.vue'
import PaneSeam from '../tools-ui/PaneSeam.vue'

interface ChmodState {
  /** 四位八进制字符串(单一事实源,勾选/输入双向都走它) */
  octal: string
  /** 命令目标路径(仅拼进生成的 chmod 命令) */
  path: string
}

const { state } = useToolState<ChmodState>('chmod', { octal: '0755', path: '' })

/** 最近一次成功解析的权限位:非法输入时保留旧结果,只报错不清屏 */
const bits = ref<ChmodBits>(parseOctal(state.octal).bits)
const octalErr = ref('')

watch(
  () => state.octal,
  (raw) => {
    try {
      bits.value = parseOctal(raw).bits
      octalErr.value = ''
    } catch (e) {
      octalErr.value = (e as Error).message
    }
  },
  { immediate: true },
)

const TRIPLETS: Array<{ key: 'owner' | 'group' | 'other'; label: string }> = [
  { key: 'owner', label: '所有者' },
  { key: 'group', label: '所属组' },
  { key: 'other', label: '其他' },
]
const PERMS: Array<{ key: 'read' | 'write' | 'exec'; label: string }> = [
  { key: 'read', label: '读 r' },
  { key: 'write', label: '写 w' },
  { key: 'exec', label: '执行 x' },
]
const SPECIALS: Array<{ key: 'setuid' | 'setgid' | 'sticky'; label: string; hint: string }> = [
  { key: 'setuid', label: 'setuid', hint: '以文件所有者身份执行(4)' },
  { key: 'setgid', label: 'setgid', hint: '以所属组身份执行(2)' },
  { key: 'sticky', label: 'sticky', hint: '仅所有者可删除(1)' },
]

/** 勾选联动:改一位后重算八进制,走统一解析回路刷新符号形式 */
function toggle(who: 'owner' | 'group' | 'other', perm: 'read' | 'write' | 'exec', v: boolean): void {
  const next: ChmodBits = JSON.parse(JSON.stringify(bits.value))
  next[who][perm] = v
  state.octal = bitsToOctal(next)
}

function toggleSpecial(key: 'setuid' | 'setgid' | 'sticky', v: boolean): void {
  const next: ChmodBits = JSON.parse(JSON.stringify(bits.value))
  next.special[key] = v
  state.octal = bitsToOctal(next)
}

function applyPreset(octal: string): void {
  state.octal = octal.padStart(4, '0')
}

const symbolic = ref('')
const octalText = ref('')
const command = ref('')
const { copied, copy } = useCopy()

watch(
  [bits, () => state.path],
  () => {
    symbolic.value = toSymbolic(bits.value)
    octalText.value = bitsToOctal(bits.value)
    command.value = chmodCommand(bits.value, state.path)
  },
  { immediate: true },
)
</script>

<template>
  <div class="grid items-start gap-3 lg:grid-cols-[1fr_auto_1fr]">
    <!-- 输入侧:八进制 + 权限勾选格 + 特殊位 + 预设 -->
    <PaneShell label="权限位" badge="双向联动" class="lg:h-full">
      <div class="flex flex-col gap-3 p-3">
        <div class="flex items-center gap-2">
          <input
            v-model="state.octal"
            aria-label="八进制"
            placeholder="如 755 / 4755"
            maxlength="4"
            class="input input-sm w-28 font-mono"
          />
          <span class="text-xs opacity-50">3~4 位八进制,勾选与数字双向同步</span>
        </div>
        <p v-if="octalErr" class="text-error text-sm">{{ octalErr }}</p>

        <div class="grid grid-cols-[4.5rem_repeat(3,4.5rem)] items-center gap-y-1.5">
          <span class="text-xs opacity-40"></span>
          <span v-for="p in PERMS" :key="p.key" class="text-center text-xs opacity-60">{{ p.label }}</span>
          <template v-for="t in TRIPLETS" :key="t.key">
            <span class="text-xs font-medium">{{ t.label }}</span>
            <div v-for="p in PERMS" :key="p.key" class="flex justify-center">
              <input
                type="checkbox"
                :aria-label="`${t.key}-${p.key}`"
                :checked="bits[t.key][p.key]"
                class="checkbox checkbox-xs"
                @change="toggle(t.key, p.key, ($event.target as HTMLInputElement).checked)"
              />
            </div>
          </template>
        </div>

        <div class="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-base-300 pt-2">
          <label
            v-for="s in SPECIALS"
            :key="s.key"
            class="flex cursor-pointer items-center gap-1.5 text-xs"
            :title="s.hint"
          >
            <input
              type="checkbox"
              :aria-label="s.key"
              :checked="bits.special[s.key]"
              class="checkbox checkbox-xs align-middle"
              @change="toggleSpecial(s.key, ($event.target as HTMLInputElement).checked)"
            />
            {{ s.label }}
          </label>
        </div>

        <div class="flex flex-wrap items-center gap-1.5 border-t border-base-300 pt-2">
          <span class="mr-1 text-xs opacity-50">预设</span>
          <button
            v-for="p in CHMOD_PRESETS"
            :key="p.octal"
            type="button"
            class="btn btn-xs btn-ghost"
            :title="`${p.octal} ${p.label}`"
            @click="applyPreset(p.octal)"
          >
            {{ p.octal }}·{{ p.label }}
          </button>
        </div>
      </div>
    </PaneShell>

    <PaneSeam direction="lr" />

    <!-- 输出侧:符号形式 / 八进制 / 命令 -->
    <PaneShell label="结果" class="lg:h-full">
      <template #actions>
        <button v-if="command" type="button" class="btn btn-ghost btn-xs" @click="copy(command)">
          {{ copied ? '已复制' : '复制命令' }}
        </button>
      </template>
      <div class="flex h-full flex-col gap-3 p-3">
        <div>
          <p class="pb-1 text-xs font-medium tracking-wider text-base-content/50">符号形式</p>
          <code class="rounded border border-base-300 bg-base-200/60 px-3 py-1.5 font-mono text-lg tracking-widest">{{ symbolic }}</code>
        </div>
        <div>
          <p class="pb-1 text-xs font-medium tracking-wider text-base-content/50">八进制</p>
          <code class="rounded border border-base-300 bg-base-200/60 px-3 py-1.5 font-mono text-lg">{{ octalText }}</code>
        </div>
        <div class="flex flex-col gap-1.5">
          <label for="chmod-path" class="text-xs font-medium tracking-wider text-base-content/50">文件路径(可选)</label>
          <input
            id="chmod-path"
            v-model="state.path"
            aria-label="文件路径"
            placeholder="如 ~/deploy/app.py"
            class="input input-sm font-mono"
          />
        </div>
        <div>
          <p class="pb-1 text-xs font-medium tracking-wider text-base-content/50">命令</p>
          <code class="block overflow-x-auto whitespace-nowrap rounded border border-base-300 bg-base-200/60 px-3 py-1.5 font-mono text-sm">{{ command }}</code>
        </div>
      </div>
      <template #footer>
        <span class="text-xs opacity-40">特殊位:无执行权限时符号显示大写 S/T</span>
      </template>
    </PaneShell>
  </div>
</template>
