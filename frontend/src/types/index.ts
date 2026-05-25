export interface User {
  id: number
  name: string
  email: string
  role: 'lead' | 'member'
  created_at?: string
  is_active?: boolean
}

export interface Project {
  id: number
  name: string
  description?: string
  status: 'open' | 'closed'
  created_at: string
  created_by: User
  open_task_count: number
}

export interface Task {
  id: number
  title: string
  description?: string
  project: { id: number; name: string }
  follow_up_date?: string
  completed: boolean
  date_entered: string
  status: 'open' | 'closed'
  owner: User
  delegated_to?: User
  predecessor_task_id?: number
  successor_task_id?: number
  deferred_until?: string
}

export interface Comment {
  id: number
  task_id: number
  user: User
  content: string
  created_at: string
}

export interface ChainItem {
  id: number
  title: string
  status: string
  completed: boolean
  follow_up_date?: string
  position: number
}

export interface DashboardSummary {
  user: User
  overdue_count: number
  upcoming_count: number
  open_task_count: number
  my_delegated_out_count: number
  my_delegated_in_count: number
}

export interface ProjectWithTasks {
  project: Project
  tasks: Task[]
  overdue_count: number
}

export interface DelegateGroup {
  user: User
  task_count: number
  overdue_count: number
  tasks: Task[]
}
