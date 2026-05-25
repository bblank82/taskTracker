import { apiDelete, apiGet, apiPatch, apiPost } from './client'
import type { Project } from '../types'

export const getProjects = (status?: string) =>
  apiGet<Project[]>('/api/projects', status ? { status } : undefined)
export const getProject = (id: number) => apiGet<Project>(`/api/projects/${id}`)
export const createProject = (data: { name: string; description?: string }) =>
  apiPost<Project>('/api/projects', data)
export const updateProject = (id: number, data: Partial<{ name: string; description: string; status: string }>) =>
  apiPatch<Project>(`/api/projects/${id}`, data)
export const deleteProject = (id: number) => apiDelete<{ ok: boolean }>(`/api/projects/${id}`)
