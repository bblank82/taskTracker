import { apiDelete, apiGet, apiPatch, apiPost } from './client'
import type { Comment } from '../types'

export const getComments = (taskId: number) =>
  apiGet<Comment[]>(`/api/tasks/${taskId}/comments`)

export const createComment = (taskId: number, content: string) =>
  apiPost<Comment>(`/api/tasks/${taskId}/comments`, { content })

export const updateComment = (taskId: number, commentId: number, content: string) =>
  apiPatch<Comment>(`/api/tasks/${taskId}/comments/${commentId}`, { content })

export const deleteComment = (taskId: number, commentId: number) =>
  apiDelete<{ ok: boolean }>(`/api/tasks/${taskId}/comments/${commentId}`)
