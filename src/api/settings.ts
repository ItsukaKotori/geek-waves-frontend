import type {
  AiProvider,
  FrameworkPayload,
  FrameworkWatch,
  InfoSource,
  PageResult,
  ProviderPayload,
  SourcePayload,
} from '../types'
import { del, get, post, put } from './http'

/** 信息源管理(全量:GET /api/admin/sources 为分页结构) */
export function fetchSources(
  page = 1,
  size = 50,
): Promise<PageResult<InfoSource>> {
  return get<PageResult<InfoSource>>('/admin/sources', { current: page, size })
}

export function createSource(data: SourcePayload): Promise<InfoSource> {
  return post<InfoSource>('/admin/sources', data)
}

export function updateSource(
  id: string | number,
  data: SourcePayload,
): Promise<InfoSource> {
  return put<InfoSource>(`/admin/sources/${id}`, data)
}

export function deleteSource(id: string | number): Promise<void> {
  return del<void>(`/admin/sources/${id}`)
}

export function triggerFetch(id: string | number): Promise<boolean> {
  return post<boolean>(`/admin/sources/${id}/trigger-fetch`)
}

/** AI Provider 管理(写入体字段与后端 ProviderUpsertRequest 对齐) */
export function fetchProviders(): Promise<AiProvider[]> {
  return get<AiProvider[]>('/admin/providers')
}

export function createProvider(data: ProviderPayload): Promise<AiProvider> {
  return post<AiProvider>('/admin/providers', data)
}

export function updateProvider(
  id: string | number,
  data: ProviderPayload,
): Promise<AiProvider> {
  return put<AiProvider>(`/admin/providers/${id}`, data)
}

export function deleteProvider(id: string | number): Promise<void> {
  return del<void>(`/admin/providers/${id}`)
}

export function setDefaultProvider(id: string | number): Promise<void> {
  return post<void>(`/admin/providers/${id}/set-default`)
}

/** 框架关注管理 */
export function fetchFrameworks(
  page = 1,
  size = 50,
): Promise<PageResult<FrameworkWatch>> {
  return get<PageResult<FrameworkWatch>>('/admin/frameworks', {
    current: page,
    size,
  })
}

export function createFramework(data: FrameworkPayload): Promise<FrameworkWatch> {
  return post<FrameworkWatch>('/admin/frameworks', data)
}

export function updateFramework(
  id: string | number,
  data: FrameworkPayload,
): Promise<FrameworkWatch> {
  return put<FrameworkWatch>(`/admin/frameworks/${id}`, data)
}

export function deleteFramework(id: string | number): Promise<void> {
  return del<void>(`/admin/frameworks/${id}`)
}

export function refreshFramework(id: string | number): Promise<FrameworkWatch> {
  return post<FrameworkWatch>(`/admin/frameworks/${id}/refresh`, '')
}
