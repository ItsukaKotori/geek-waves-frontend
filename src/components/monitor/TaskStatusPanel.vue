<script setup lang="ts">
import type { TaskStatus } from '../../types/monitor'
import { fmtTime } from '../../utils/news'
import { fmtDuration } from '../../utils/format'

defineProps<{ status?: TaskStatus | null }>()

const FETCH_BADGE: Record<string, string> = {
  SUCCESS: 'badge-success',
  FAILED: 'badge-error',
  SKIPPED: 'badge-warning',
}
</script>

<template>
  <div class="flex flex-col gap-6">
    <!-- 调度器 + 线程池 + 概览 -->
    <div class="grid gap-6 lg:grid-cols-2">
      <div class="rounded-box border border-base-300 bg-base-100 p-5">
        <h3 class="text-base font-semibold tracking-tight">后台调度器</h3>
        <div v-if="status?.schedulers.length" class="mt-3 overflow-x-auto">
          <table class="table table-sm">
            <thead class="text-xs font-medium uppercase tracking-wider text-base-content/50">
              <tr>
                <th>任务</th>
                <th>上次开始</th>
                <th>耗时</th>
                <th>处理条数</th>
                <th>状态</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="s in status.schedulers" :key="s.name">
                <td class="font-medium">{{ s.name }}</td>
                <td class="whitespace-nowrap">{{ fmtTime(s.lastStartAt) || '—' }}</td>
                <td class="tabular-nums">
                  {{ s.lastDurationMs == null ? '运行中' : fmtDuration(Number(s.lastDurationMs)) }}
                </td>
                <td class="tabular-nums">{{ s.itemCount ?? '—' }}</td>
                <td>
                  <span
                    v-if="s.lastError"
                    class="badge badge-error badge-sm"
                    :title="s.lastError"
                    >异常</span
                  >
                  <span v-else class="badge badge-success badge-sm">正常</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-else class="mt-3 text-sm text-base-content/50">暂无调度记录。</p>
      </div>

      <div class="rounded-box border border-base-300 bg-base-100 p-5">
        <h3 class="text-base font-semibold tracking-tight">运行时状态</h3>
        <div v-if="status" class="mt-3 grid grid-cols-2 gap-x-6 gap-y-3 text-sm md:grid-cols-3">
          <div>
            <div class="text-xs text-base-content/50">资讯总量</div>
            <div class="text-xl font-semibold tabular-nums">{{ Number(status.newsTotal) }}</div>
          </div>
          <div>
            <div class="text-xs text-base-content/50">抓取线程池</div>
            <div class="tabular-nums">
              {{ status.fetchPool.active }} 活跃 / {{ status.fetchPool.poolSize }} 核心
            </div>
          </div>
          <div>
            <div class="text-xs text-base-content/50">队列积压</div>
            <div class="tabular-nums">{{ status.fetchPool.queueSize }}</div>
          </div>
        </div>
        <p v-else class="mt-3 text-sm text-base-content/50">加载中…</p>
      </div>
    </div>

    <!-- 数据源健康 -->
    <div class="rounded-box border border-base-300 bg-base-100 p-5">
      <h3 class="text-base font-semibold tracking-tight">数据源抓取健康</h3>
      <div v-if="status?.sources.length" class="mt-3 overflow-x-auto">
        <table class="table table-sm">
          <thead class="text-xs font-medium uppercase tracking-wider text-base-content/50">
            <tr>
              <th>名称</th>
              <th>启用</th>
              <th>最近状态</th>
              <th>最近采集</th>
              <th>连续失败</th>
              <th>到期</th>
              <th>错误</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="s in status.sources" :key="s.id">
              <td>
                <span class="font-medium">{{ s.name }}</span>
                <span class="ml-1 font-mono text-xs opacity-60">{{ s.code }}</span>
              </td>
              <td>
                <span v-if="s.enabled" class="badge badge-ghost badge-sm">启用</span>
                <span v-else class="badge badge-ghost badge-sm opacity-50">停用</span>
              </td>
              <td>
                <span
                  v-if="s.lastFetchStatus"
                  class="badge badge-sm"
                  :class="FETCH_BADGE[s.lastFetchStatus] ?? 'badge-ghost'"
                >
                  {{ s.lastFetchStatus }}
                </span>
                <span v-else class="text-base-content/40">—</span>
              </td>
              <td class="whitespace-nowrap">{{ fmtTime(s.lastFetchAt) || '—' }}</td>
              <td class="tabular-nums">{{ s.failCount ?? 0 }}</td>
              <td>
                <span v-if="s.dueNow" class="badge badge-info badge-sm">待采集</span>
                <span v-else class="text-base-content/40">—</span>
              </td>
              <td>
                <p v-if="s.lastError" class="max-w-[14rem] truncate text-error" :title="s.lastError">
                  {{ s.lastError }}
                </p>
                <span v-else class="text-base-content/40">—</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-else class="mt-3 text-sm text-base-content/50">暂无数据源。</p>
    </div>

    <!-- AI Provider -->
    <div class="rounded-box border border-base-300 bg-base-100 p-5">
      <h3 class="text-base font-semibold tracking-tight">AI Provider</h3>
      <div v-if="status?.providers.length" class="mt-3 overflow-x-auto">
        <table class="table table-sm">
          <thead class="text-xs font-medium uppercase tracking-wider text-base-content/50">
            <tr>
              <th>名称</th>
              <th>厂商</th>
              <th>模型</th>
              <th>密钥</th>
              <th>默认</th>
              <th>启用</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="p in status.providers" :key="p.id">
              <td class="font-medium">{{ p.name }}</td>
              <td>
                <span class="badge badge-ghost badge-sm">{{ p.vendor }}</span>
              </td>
              <td class="font-mono text-xs">{{ p.model || '—' }}</td>
              <td>
                <span v-if="p.keySet" class="badge badge-success badge-sm">已配置</span>
                <span v-else class="badge badge-warning badge-sm">未配置</span>
              </td>
              <td>{{ p.isDefault ? '✓' : '—' }}</td>
              <td>
                <span v-if="p.enabled" class="badge badge-ghost badge-sm">启用</span>
                <span v-else class="badge badge-ghost badge-sm opacity-50">停用</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-else class="mt-3 text-sm text-base-content/50">暂无 AI Provider。</p>
    </div>
  </div>
</template>
