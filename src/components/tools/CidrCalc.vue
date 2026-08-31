<script setup lang="ts">
import { ref } from 'vue'
import { formatBigCount, parseCidr, type CidrInfo } from '../../tools/cidrCalc'
import { useToolState } from '../../composables/useToolState'
import { watchDebounced } from '../../composables/useDebounce'
import ErrorBanner from '../ui/ErrorBanner.vue'
import PaneShell from '../tools-ui/PaneShell.vue'
import PaneSeam from '../tools-ui/PaneSeam.vue'

/**
 * CIDR/IP 子网计算(FE11 T2 批次二):IPv4/IPv6 双栈,BigInt 全程位运算不丢精度。
 * 口径(与纯函数层声明一致):v4 /31 → 2、/32 → 1 可用(RFC 3021),其余总数 - 2;
 * v6 无保留地址概念,可用 = 总数;不输出广播/反掩码。主机数 ≥ 2^53 以科学计数展示
 * (8 位有效数字)并保留完整千位分段精确值。实时范式:150ms 防抖,无计算按钮。
 */

interface CidrState {
  input: string
}

/** 输入经 localStorage 持久化(key 与注册表一致),刷新后恢复 */
const { state } = useToolState<CidrState>('cidr', { input: '192.168.1.0/24' })

const result = ref<CidrInfo | null>(null)
const errorMessage = ref('')

function run(): void {
  const src = state.input.trim()
  if (src === '') {
    result.value = null
    errorMessage.value = ''
    return
  }
  try {
    result.value = parseCidr(src)
    errorMessage.value = ''
  } catch (e) {
    result.value = null
    errorMessage.value = (e as Error).message || 'CIDR 解析失败'
  }
}

const runner = watchDebounced(() => state.input, run)

function recomputeNow(): void {
  runner.flush()
}

const totalDisplay = () => (result.value ? formatBigCount(result.value.totalAddresses) : null)
const usableDisplay = () => (result.value ? formatBigCount(result.value.usableHosts) : null)
</script>

<template>
  <div class="flex flex-col gap-3" @keydown.ctrl.enter.prevent="recomputeNow" @keydown.meta.enter.prevent="recomputeNow">
    <ErrorBanner :message="errorMessage" />

    <div class="grid items-start gap-3 lg:grid-cols-[1fr_auto_1fr]">
      <PaneShell label="输入" badge="IPv4 / IPv6" class="lg:h-full">
        <div class="flex h-full flex-col gap-2 p-3">
          <input
            v-model="state.input"
            data-testid="cidr-input"
            placeholder="192.168.1.0/24"
            aria-label="CIDR 地址段"
            class="input input-sm font-mono"
            spellcheck="false"
          />
          <p class="text-xs text-base-content/50">
            如 192.168.1.0/24 或 2001:db8::/32;裸 IP 按全长前缀处理
          </p>
        </div>
      </PaneShell>

      <PaneSeam direction="lr" />

      <PaneShell label="计算结果" class="lg:h-full">
        <div class="h-full overflow-auto">
          <div v-if="result" class="p-3">
            <div class="flex items-center gap-2">
              <span data-testid="cidr-version" class="badge badge-primary badge-sm font-mono">
                IPv{{ result.version }}
              </span>
              <code class="font-mono text-sm font-medium">{{ result.cidr }}</code>
            </div>
            <dl class="mt-2 grid gap-x-4 gap-y-1.5 text-sm sm:grid-cols-2">
              <div class="flex min-w-0 items-baseline gap-2">
                <dt class="shrink-0 text-xs opacity-60">网络地址</dt>
                <dd data-testid="cidr-network" class="min-w-0 break-all font-mono">{{ result.network }}</dd>
              </div>
              <div v-if="result.broadcast !== ''" class="flex min-w-0 items-baseline gap-2">
                <dt class="shrink-0 text-xs opacity-60">广播地址</dt>
                <dd data-testid="cidr-broadcast" class="min-w-0 break-all font-mono">{{ result.broadcast }}</dd>
              </div>
              <div class="flex min-w-0 items-baseline gap-2">
                <dt class="shrink-0 text-xs opacity-60">掩码</dt>
                <dd data-testid="cidr-netmask" class="min-w-0 break-all font-mono">{{ result.netmask }}</dd>
              </div>
              <div v-if="result.wildcardMask !== ''" class="flex min-w-0 items-baseline gap-2">
                <dt class="shrink-0 text-xs opacity-60">反掩码</dt>
                <dd data-testid="cidr-wildcard" class="min-w-0 break-all font-mono">{{ result.wildcardMask }}</dd>
              </div>
              <div class="flex min-w-0 items-baseline gap-2">
                <dt class="shrink-0 text-xs opacity-60">掩码位</dt>
                <dd data-testid="cidr-prefix" class="font-mono">/{{ result.prefix }}(主机位 {{ result.hostBits }} 位)</dd>
              </div>
              <div class="flex min-w-0 items-baseline gap-2 sm:col-span-2">
                <dt class="shrink-0 text-xs opacity-60">可用范围</dt>
                <dd data-testid="cidr-range" class="min-w-0 break-all font-mono">
                  {{ result.rangeStart }} ~ {{ result.rangeEnd }}
                </dd>
              </div>
              <div class="flex min-w-0 items-baseline gap-2">
                <dt class="shrink-0 text-xs opacity-60">总地址数</dt>
                <dd data-testid="cidr-total" class="min-w-0 break-all font-mono" :title="totalDisplay()?.exact">
                  {{ totalDisplay()?.display }}
                </dd>
              </div>
              <div class="flex min-w-0 items-baseline gap-2">
                <dt class="shrink-0 text-xs opacity-60">可用主机数</dt>
                <dd data-testid="cidr-hosts" class="min-w-0 break-all font-mono" :title="usableDisplay()?.exact">
                  {{ usableDisplay()?.display }}
                </dd>
              </div>
            </dl>
          </div>
          <p v-else class="flex h-full min-h-20 items-center justify-center font-mono text-xs text-base-content/35">
            输入 CIDR 实时计算
          </p>
        </div>
      </PaneShell>
    </div>

    <p class="text-xs opacity-50">
      口径:IPv4 可用主机一般 = 总数 - 2(网络/广播保留),/31 = 2(RFC 3021 点对点)、/32 = 1;
      IPv6 无保留地址概念,可用 = 总数,范围即子网首末地址。主机数 ≥ 2^53 以科学计数显示
      (悬停可见完整千位分段精确值);地址全程 BigInt 位运算,不丢精度。支持 IPv4 点分十进制
      与 IPv6(RFC 5952 压缩),不支持 IPv4 映射形式(::ffff:a.b.c.d)
    </p>
  </div>
</template>
