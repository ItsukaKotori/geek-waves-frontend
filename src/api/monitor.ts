import { del, get, post, put } from './http'
import type { NumLike } from '../types'
import type {
  Overview,
  ProcessSnapshot,
  ProbeTarget,
  ProbeTargetPayload,
  TaskStatus,
} from '../types/monitor'

export function fetchOverview(): Promise<Overview> {
  return get<Overview>('/monitor/overview')
}

export function fetchProcesses(): Promise<ProcessSnapshot> {
  return get<ProcessSnapshot>('/monitor/processes')
}

export function fetchTaskStatus(): Promise<TaskStatus> {
  return get<TaskStatus>('/monitor/tasks')
}

export function fetchProbeTargets(): Promise<ProbeTarget[]> {
  return get<ProbeTarget[]>('/monitor/probe-targets')
}

export function createProbeTarget(payload: ProbeTargetPayload): Promise<ProbeTarget> {
  return post<ProbeTarget>('/monitor/probe-targets', payload)
}

export function updateProbeTarget(
  id: NumLike,
  payload: ProbeTargetPayload,
): Promise<ProbeTarget> {
  return put<ProbeTarget>(`/monitor/probe-targets/${id}`, payload)
}

export function deleteProbeTarget(id: NumLike): Promise<void> {
  return del<void>(`/monitor/probe-targets/${id}`)
}

export function probeNow(id: NumLike): Promise<ProbeTarget> {
  return post<ProbeTarget>(`/monitor/probe-targets/${id}/probe`)
}
