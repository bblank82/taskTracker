import { apiGet } from './client'
import type { DashboardSummary, ProjectWithTasks, DelegateGroup } from '../types'

export const getDashboard = () => apiGet<DashboardSummary>('/api/dashboard')
export const getDashboardByProject = () => apiGet<ProjectWithTasks[]>('/api/dashboard/by-project')
export const getDashboardByDelegate = () => apiGet<DelegateGroup[]>('/api/dashboard/by-delegate')
