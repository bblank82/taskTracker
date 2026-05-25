import { useRef } from 'react'
import { useFilterStore } from '../store/filterStore'
import type { Project, User } from '../types'

interface FilterBarProps {
  projects: Project[]
  users: User[]
  overdueCount: number
  upcomingCount: number
  searchRef?: React.RefObject<HTMLInputElement>
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function addWeekdays(dateStr: string, dir: 1 | -1): string {
  const d = new Date(dateStr + 'T12:00:00')
  do { d.setDate(d.getDate() + dir) } while (d.getDay() === 0 || d.getDay() === 6)
  return d.toISOString().slice(0, 10)
}

function fmtDate(dateStr: string, todayStr: string): string {
  if (dateStr === todayStr) return 'Today'
  const [, m, day] = dateStr.split('-')
  return `${MONTHS[+m - 1]} ${+day}`
}

export function FilterBar({ projects, users, overdueCount, upcomingCount, searchRef }: FilterBarProps) {
  const datePickerRef = useRef<HTMLInputElement>(null)
  const {
    view, due, projectId, searchQuery, showDeferred, showCompleted, delegateId, asOfDate,
    setView, setDue, setProjectId, setSearchQuery, setShowDeferred, setShowCompleted, setDelegateId, setAsOfDate,
  } = useFilterStore()

  const todayStr = new Date().toISOString().slice(0, 10)
  const displayDate = asOfDate ?? todayStr
  const isToday = displayDate === todayStr

  return (
    <div className="sticky top-14 z-20 bg-base border-b border-border px-4 py-2 flex items-center gap-2 flex-wrap">
      {/* View toggle */}
      <div className="flex rounded-md overflow-hidden border border-border text-sm">
        {(['all', 'mine', 'delegated'] as const).map((v) => (
          <button
            key={v}
            onClick={() => { setView(v); if (v !== 'delegated') setDelegateId(null) }}
            className={`px-3 py-1.5 transition-colors ${view === v ? 'bg-accent text-white' : 'bg-elevated text-text-secondary hover:text-text-primary'}`}
          >
            {v === 'all' ? 'All' : v === 'mine' ? 'My Tasks' : 'Delegated'}
          </button>
        ))}
      </div>

      {/* Delegate person picker — only when Delegated view is active */}
      {view === 'delegated' && (
        <select
          value={delegateId ?? ''}
          onChange={(e) => setDelegateId(e.target.value ? Number(e.target.value) : null)}
          className="text-sm py-1 pl-2 pr-6 bg-elevated border-border rounded"
        >
          <option value="">All people</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>{u.name}</option>
          ))}
        </select>
      )}

      {/* Due date filter */}
      <select
        value={due}
        onChange={(e) => setDue(e.target.value as typeof due)}
        className="text-sm py-1 pl-2 pr-6 bg-elevated border-border rounded"
      >
        <option value="all">All Dates</option>
        <option value="overdue">Overdue</option>
        <option value="upcoming">Due Soon</option>
      </select>

      {/* Project filter */}
      <select
        value={projectId ?? ''}
        onChange={(e) => setProjectId(e.target.value ? Number(e.target.value) : null)}
        className="text-sm py-1 pl-2 pr-6 bg-elevated border-border rounded"
      >
        <option value="">All Projects</option>
        {projects.map((p) => (
          <option key={p.id} value={p.id}>{p.name}</option>
        ))}
      </select>

      {/* Search */}
      <input
        ref={searchRef}
        type="text"
        placeholder="Search tasks..."
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Escape') { setSearchQuery(''); e.currentTarget.blur() } }}
        className="text-sm py-1 px-3 flex-1 min-w-32 max-w-48"
      />

      {/* Show deferred toggle */}
      <label className="flex items-center gap-1.5 text-xs text-text-muted cursor-pointer hover:text-text-secondary select-none">
        <input
          type="checkbox"
          checked={showDeferred}
          onChange={(e) => setShowDeferred(e.target.checked)}
          className="accent-indigo-500 w-3.5 h-3.5"
        />
        Show deferred
      </label>

      {/* Show completed toggle */}
      <label className="flex items-center gap-1.5 text-xs text-text-muted cursor-pointer hover:text-text-secondary select-none">
        <input
          type="checkbox"
          checked={showCompleted}
          onChange={(e) => setShowCompleted(e.target.checked)}
          className="accent-indigo-500 w-3.5 h-3.5"
        />
        Show completed
      </label>

      {/* As-of date navigator */}
      <div className="flex items-center gap-0.5 flex-shrink-0">
        <button
          onClick={() => setAsOfDate(addWeekdays(displayDate, -1))}
          className="text-xs text-text-muted hover:text-text-primary w-5 h-5 flex items-center justify-center rounded hover:bg-elevated"
          title="Previous weekday"
        >◀</button>
        <span className={`text-xs font-mono px-1 min-w-[4rem] text-center select-none ${!isToday ? 'text-yellow-300' : 'text-text-muted'}`}>
          {fmtDate(displayDate, todayStr)}
        </span>
        <button
          onClick={() => { const n = addWeekdays(displayDate, 1); setAsOfDate(n >= todayStr ? null : n) }}
          disabled={isToday}
          className="text-xs text-text-muted hover:text-text-primary w-5 h-5 flex items-center justify-center rounded hover:bg-elevated disabled:opacity-25 disabled:cursor-default"
          title="Next weekday"
        >▶</button>
        <div className="relative ml-0.5">
          <button
            onClick={() => datePickerRef.current?.showPicker?.()}
            className="text-xs text-text-muted hover:text-text-primary w-5 h-5 flex items-center justify-center rounded hover:bg-elevated"
            title="Pick date"
          >🗓</button>
          <input
            ref={datePickerRef}
            type="date"
            value={displayDate}
            max={todayStr}
            onChange={(e) => {
              setAsOfDate(!e.target.value || e.target.value >= todayStr ? null : e.target.value)
              e.target.blur()
            }}
            className="absolute opacity-0 w-0 h-0 pointer-events-none"
            tabIndex={-1}
          />
        </div>
        {!isToday && (
          <button
            onClick={() => setAsOfDate(null)}
            className="text-xs text-text-muted hover:text-text-secondary w-4 h-4 flex items-center justify-center"
            title="Return to today"
          >✕</button>
        )}
      </div>

      {/* Counts */}
      <div className="ml-auto flex gap-3 text-xs flex-shrink-0">
        {overdueCount > 0 && (
          <span className="text-overdue-text font-medium">{overdueCount} overdue</span>
        )}
        {upcomingCount > 0 && (
          <span className="text-upcoming-text">{upcomingCount} due soon</span>
        )}
      </div>
    </div>
  )
}
