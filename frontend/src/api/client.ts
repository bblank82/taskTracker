const getUserId = (): string | null => {
  try {
    const stored = localStorage.getItem('taskflow_user')
    if (!stored) return null
    const user = JSON.parse(stored)
    return String(user.id)
  } catch {
    return null
  }
}

async function request<T>(method: string, path: string, body?: unknown, params?: Record<string, string | number | boolean | undefined>): Promise<T> {
  const url = new URL(path, window.location.origin)
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v))
    })
  }

  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const userId = getUserId()
  if (userId) headers['X-User-ID'] = userId

  const res = await fetch(url.toString(), {
    method,
    headers,
    credentials: 'include',
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

  if (!res.ok) {
    let detail = `HTTP ${res.status}`
    try {
      const err = await res.json()
      detail = err.detail || detail
    } catch { /* ignore */ }
    throw new Error(detail)
  }

  if (res.status === 204) return undefined as T
  return res.json()
}

export const apiGet = <T>(path: string, params?: Record<string, string | number | boolean | undefined>) =>
  request<T>('GET', path, undefined, params)

export const apiPost = <T>(path: string, body?: unknown) =>
  request<T>('POST', path, body)

export const apiPatch = <T>(path: string, body?: unknown) =>
  request<T>('PATCH', path, body)

export const apiDelete = <T>(path: string) =>
  request<T>('DELETE', path)
