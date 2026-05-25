import { format, isPast, isWithinInterval, addDays, parseISO } from 'date-fns'
import type { Task, User } from '../types'

interface TaskRowProps {
  task: Task
  currentUser: User
  isSelected: boolean
  showCheckbox: boolean
  onSelect: (id: number, checked: boolean) => void
  onView: (task: Task) => void
  onDefer?: (taskId: number) => void
}

export function getTaskStatus(task: Task): 'overdue' | 'upcoming' | 'normal' {
  if (!task.follow_up_date || task.completed) return 'normal'
  const date = parseISO(task.follow_up_date)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  if (isPast(date) && date < today) return 'overdue'
  if (isWithinInterval(date, { start: today, end: addDays(today, 5) })) return 'upcoming'
  return 'normal'
}

export function formatFollowUpDate(dateStr?: string): string {
  if (!dateStr) return '—'
  const date = parseISO(dateStr)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const diff = Math.ceil((date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
  if (diff < 0) return `${Math.abs(diff)}d ago`
  if (diff === 0) return 'today'
  if (diff <= 7) return `in ${diff}d`
  return format(date, date.getFullYear() === today.getFullYear() ? 'MMM d' : 'MMM d, yyyy')
}

export function TaskRow({ task, currentUser, isSelected, showCheckbox, onSelect, onView, onDefer }: TaskRowProps) {
  const status = getTaskStatus(task)
  const owner = task.delegated_to ?? task.owner
  const ownerLabel = owner.id === currentUser.id ? 'me' : owner.name

  const rowClass = status === 'overdue'
    ? 'task-row-overdue border-red-900/40'
    : status === 'upcoming'
    ? 'task-row-upcoming border-yellow-900/30'
    : 'hover:bg-elevated border-transparent'

  return (
    <div
      className={`flex items-center gap-3 px-3 py-2 border-b ${rowClass} group transition-colors`}
    >
      {showCheckbox && (
        <input
          type="checkbox"
          checked={isSelected}
          onChange={(e) => onSelect(task.id, e.target.checked)}
          className="flex-shrink-0 w-4 h-4 accent-indigo-500"
          onClick={(e) => e.stopPropagation()}
        />
      )}
      {!showCheckbox && (
        <div
          className="flex-shrink-0 w-4 h-4 rounded border border-border group-hover:border-accent cursor-pointer"
          onClick={(e) => { e.stopPropagation(); onSelect(task.id, true) }}
        />
      )}

      <span
        className={`text-xs font-mono w-5 flex-shrink-0 font-bold
          ${status === 'overdue' ? 'text-overdue-text' : status === 'upcoming' ? 'text-upcoming-text' : 'text-transparent'}`}
      >
        {status === 'overdue' ? '!!' : status === 'upcoming' ? '~' : '  '}
      </span>

      <button
        onClick={() => onView(task)}
        className={`flex-1 text-left text-sm truncate
          ${status === 'overdue' ? 'text-overdue-text' : status === 'upcoming' ? 'text-upcoming-text' : 'text-text-primary'}`}
      >
        {task.title}
      </button>

      <div className="flex gap-1 flex-shrink-0">
        {task.completed && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-900/40 text-green-400 font-medium leading-none">Done</span>
        )}
        {!task.completed && task.deferred_until && task.deferred_until > new Date().toISOString().slice(0, 10) && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-900/40 text-indigo-400 font-medium leading-none">
            ⏭ {formatFollowUpDate(task.deferred_until)}
          </span>
        )}
        {task.delegated_to && task.delegated_to.id !== task.owner.id && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-elevated border border-border text-text-muted font-medium leading-none">delegated</span>
        )}
      </div>

      <span className={`text-xs font-mono flex-shrink-0 w-20 text-right
        ${status === 'overdue' ? 'text-overdue-text' : status === 'upcoming' ? 'text-upcoming-text' : 'text-text-muted'}`}
      >
        {formatFollowUpDate(task.follow_up_date)}
      </span>

      <span className="text-xs text-text-secondary flex-shrink-0 w-28 text-right truncate">
        {task.delegated_to ? <span className="text-text-muted">→ </span> : null}
        {ownerLabel}
      </span>

      {onDefer && (
        <button
          onClick={(e) => { e.stopPropagation(); onDefer(task.id) }}
          className="text-xs text-text-muted hover:text-upcoming-text transition-colors flex-shrink-0 px-1 opacity-0 group-hover:opacity-100"
          title="Defer to tomorrow"
        >
          ⏭
        </button>
      )}
      <button
        onClick={() => onView(task)}
        className="text-xs text-text-muted hover:text-accent transition-colors flex-shrink-0 px-2"
      >
        View
      </button>
    </div>
  )
}
