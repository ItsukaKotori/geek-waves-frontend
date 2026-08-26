import axios from 'axios'

/**
 * 统一 axios 实例:后端包裹 Response{success, message, data},
 * 拦截器解包:成功返回 data,success:false 或 HTTP 错误 reject Error(message)。
 * SSE 流式接口(ai.ts)不走 axios,直接 fetch + ReadableStream。
 */
export const http = axios.create({
  baseURL: '/api',
  timeout: 30_000,
})

http.interceptors.response.use(
  (res) => {
    const j = res.data
    if (j && typeof j === 'object' && j.success === false) {
      return Promise.reject(new Error(j.message || '请求失败'))
    }
    return j.data
  },
  (err) => {
    const msg = err.response?.data?.message || err.message || '网络错误'
    return Promise.reject(new Error(msg))
  },
)

export async function get<T>(
  url: string,
  params?: Record<string, unknown>,
): Promise<T> {
  return (await http.get(url, { params })) as unknown as T
}

export async function post<T>(url: string, data?: unknown): Promise<T> {
  return (await http.post(url, data)) as unknown as T
}

export async function put<T>(url: string, data?: unknown): Promise<T> {
  return (await http.put(url, data)) as unknown as T
}

export async function del<T>(url: string): Promise<T> {
  return (await http.delete(url)) as unknown as T
}
