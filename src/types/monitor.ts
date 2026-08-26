import type { NumLike } from '../types'

/**
 * 后端 monitor DTO 的 TS 镜像。
 * Java long 字段经 Jackson 序列化为字符串(防精度丢失)→ NumLike;
 * double/int/boolean 保持 number/boolean。
 */

export interface CpuMetrics {
  logicalCores: number
  physicalCores: number
  usagePercent: number
  perCoreUsage: number[]
  load1: number
  load5: number
  load15: number
}

export interface MemoryMetrics {
  totalBytes: NumLike
  usedBytes: NumLike
  availableBytes: NumLike
  usagePercent: number
  swapTotalBytes: NumLike
  swapUsedBytes: NumLike
}

export interface DiskMetrics {
  name: string
  mount: string
  fsType?: string
  totalBytes: NumLike
  availableBytes: NumLike
  usagePercent: number
}

export interface NetMetrics {
  name: string
  displayName?: string
  rxBytesPerSec: NumLike
  txBytesPerSec: NumLike
}

export interface SystemMetrics {
  osName?: string
  osVersion?: string
  arch?: string
  hostName?: string
  bootEpochMs: NumLike
  uptimeSeconds: NumLike
  cpu?: CpuMetrics
  memory?: MemoryMetrics
  disks: DiskMetrics[]
  networks: NetMetrics[]
  sampledAt: NumLike
  error?: string
}

export interface JvmMetrics {
  javaVersion?: string
  jvmName?: string
  uptimeMs: NumLike
  heap: {
    initBytes: NumLike
    maxBytes: NumLike
    usedBytes: NumLike
    committedBytes: NumLike
    usagePercent: number
  }
  pools: Array<{
    name: string
    type: string
    usedBytes: NumLike
    maxBytes: NumLike
    usagePercent: number
  }>
  nonHeapUsedBytes: NumLike
  nonHeapCommittedBytes: NumLike
  threads: {
    live: number
    peak: number
    daemon: number
    started: NumLike
  }
  gcs: Array<{ collector: string; count: NumLike; totalTimeMs: NumLike }>
}

export interface Overview {
  system: SystemMetrics
  jvm: JvmMetrics
}

export interface ProcessSnapshot {
  sampledAt: NumLike
  total: number
  processes: Array<{
    pid: NumLike
    name: string
    user?: string
    state?: string
    cpuPercent: number
    rssBytes: NumLike
  }>
  error?: string
}

export interface TaskStatus {
  schedulers: Array<{
    name: string
    lastStartAt?: string
    lastDurationMs?: NumLike | null
    itemCount?: number | null
    lastError?: string | null
  }>
  fetchPool: { active: number; poolSize: number; queueSize: number }
  sources: Array<{
    id: NumLike
    name: string
    code: string
    enabled: boolean
    lastFetchStatus?: string
    lastFetchAt?: string
    lastError?: string
    failCount?: number
    dueNow: boolean
  }>
  providers: Array<{
    id: NumLike
    name: string
    vendor: string
    model?: string
    enabled: boolean
    isDefault: boolean
    keySet: boolean
  }>
  newsTotal: NumLike
  generatedAt: NumLike
}

export interface ProbeTarget {
  id: NumLike
  name: string
  host: string
  port: number
  protocol: string
  enabled: boolean
  timeoutMs?: NumLike
  intervalSeconds?: NumLike
  sortOrder?: NumLike
  lastProbeAt?: string | null
  lastStatus?: string | null
  lastLatencyMs?: NumLike | null
  lastError?: string | null
  failCount?: NumLike
}

export interface ProbeTargetPayload {
  name: string
  host: string
  port: number
  enabled?: boolean
  timeoutMs?: number
  intervalSeconds?: number
  sortOrder?: number
}
