import dayjs from 'dayjs'
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEventHandler,
} from 'react'
import { Archive, X } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useTodoStore, type TodoItem } from './todoStore'
import { useAuthStore } from '../authetication/authStore'
// 경로와 파일명은 실제 저장하신 것에 맞게 수정해주세요!
import done0 from '../assets/done0.png' 
import done1 from '../assets/done1.png'
import done2 from '../assets/done2.png' 
import done3 from '../assets/done3.png'
import done4 from '../assets/done4.png' 
import done5 from '../assets/done5.png'

type DayRecord = {
  id: string
  title: string
  createdAt: string
  status: 'active' | 'done' | 'archived' | 'deleted'
}

const CALENDAR_SWIPE_THRESHOLD = 74
const CALENDAR_SWIPE_MAX = 132

function SwipeablePastActiveRow({
  item,
  onView,
  onArchive,
  onDelete,
  onComplete,
  isCompleteFlash,
}: {
  item: DayRecord
  onView: (id: string) => void
  onArchive: (id: string) => void
  onDelete: (id: string) => void
  onComplete: (id: string) => void
  isCompleteFlash: boolean
}) {
  const [dragX, setDragX] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const [commitAction, setCommitAction] = useState<'delete' | 'archive' | null>(null)
  const startXRef = useRef(0)
  const startYRef = useRef(0)
  const pointerIdRef = useRef<number | null>(null)
  const axisLockRef = useRef<'none' | 'x' | 'y'>('none')

  const onPointerDown: PointerEventHandler<HTMLElement> = (event) => {
    if (commitAction) return
    if (!(event.target instanceof Element)) return
    if (event.target.closest('input')) return
    pointerIdRef.current = event.pointerId
    axisLockRef.current = 'none'
    startXRef.current = event.clientX
    startYRef.current = event.clientY
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const onPointerMove: PointerEventHandler<HTMLElement> = (event) => {
    if (pointerIdRef.current !== event.pointerId) return
    const dx = event.clientX - startXRef.current
    const dy = event.clientY - startYRef.current
    if (axisLockRef.current === 'none') {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return
      axisLockRef.current = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y'
    }
    if (axisLockRef.current === 'y') return

    event.preventDefault()
    setIsDragging(true)
    setDragX(Math.max(-CALENDAR_SWIPE_MAX, Math.min(CALENDAR_SWIPE_MAX, dx)))
  }

  const runCommit = (action: 'delete' | 'archive') => {
    setCommitAction(action)
    setIsDragging(false)
    setDragX(action === 'delete' ? CALENDAR_SWIPE_MAX : -CALENDAR_SWIPE_MAX)
    window.setTimeout(() => {
      if (action === 'delete') onDelete(item.id)
      else onArchive(item.id)
      setCommitAction(null)
      setDragX(0)
    }, 140)
  }

  const onPointerEnd: PointerEventHandler<HTMLElement> = (event) => {
    if (pointerIdRef.current !== event.pointerId) return
    try {
      event.currentTarget.releasePointerCapture(event.pointerId)
    } catch {
      // ignore release failures
    }

    if (axisLockRef.current === 'x') {
      if (dragX >= CALENDAR_SWIPE_THRESHOLD) runCommit('delete')
      else if (dragX <= -CALENDAR_SWIPE_THRESHOLD) runCommit('archive')
      else {
        setIsDragging(false)
        setDragX(0)
      }
    } else {
      setIsDragging(false)
      setDragX(0)
    }

    pointerIdRef.current = null
    axisLockRef.current = 'none'
  }

  const swipeStyle = {
    '--swipe-x': `${dragX}px`,
    '--delete-progress': `${dragX > 0 ? Math.min(1, dragX / CALENDAR_SWIPE_THRESHOLD) : 0}`,
    '--archive-progress': `${dragX < 0 ? Math.min(1, Math.abs(dragX) / CALENDAR_SWIPE_THRESHOLD) : 0}`,
  } as CSSProperties

  return (
    <div className="calendar-row-swipe-shell" style={swipeStyle}>
      <div className="calendar-row-reveal calendar-row-reveal-delete" aria-hidden="true">
        <X size={18} />
        <span>삭제</span>
      </div>
      <div className="calendar-row-reveal calendar-row-reveal-archive" aria-hidden="true">
        <Archive size={18} />
        <span>보관함</span>
      </div>
      <button
        type="button"
        className={`calendar-selected-item calendar-selected-item-swipe${isDragging ? ' is-dragging' : ''}${isCompleteFlash ? ' is-complete-flash' : ''
          }`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onClick={() => onView(item.id)}
      >
        <span className="calendar-item-check">
          <input
            type="checkbox"
            onClick={(event) => event.stopPropagation()}
            onChange={() => onComplete(item.id)}
            aria-label={`${item.title} 완료 처리`}
          />
        </span>
        <span>{item.title}</span>
        <em>확인 중</em>
      </button>
    </div>
  )
}

export function SchedulePage() {
  const navigate = useNavigate()
  const location = useLocation()
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  const todos = useTodoStore((state) => state.todos)
  const deletedTodos = useTodoStore((state) => state.deletedTodos)
  const toggleDone = useTodoStore((state) => state.toggleDone)
  const archiveTodo = useTodoStore((state) => state.archiveTodo)
  const removeTodo = useTodoStore((state) => state.removeTodo)
  const activeTodos = useMemo(() => todos.filter((todo) => !todo.archived), [todos])
  const today = useMemo(() => dayjs().startOf('day'), [])
  const timeZone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, [])
  const [visibleMonth, setVisibleMonth] = useState(today.startOf('month'))
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null)
  const [completeFlashIds, setCompleteFlashIds] = useState<string[]>([])

  useEffect(() => {
    const state = location.state as { selectedDateKey?: string; visibleMonthKey?: string } | null
    if (!state) return

    if (state.visibleMonthKey) {
      const parsedMonth = dayjs(`${state.visibleMonthKey}-01`)
      if (parsedMonth.isValid()) setVisibleMonth(parsedMonth.startOf('month'))
    }
    if (state.selectedDateKey) {
      setSelectedDateKey(state.selectedDateKey)
    }
  }, [location.state])

  const activeTodoDateMap = useMemo(() => {
    return activeTodos.reduce<Record<string, number>>((acc, todo) => {
      const key = dayjs(todo.createdAt).format('YYYY-MM-DD')
      acc[key] = (acc[key] ?? 0) + 1
      return acc
    }, {})
  }, [activeTodos])
  
  const doneTodoDateMap = useMemo(() => {
    return todos.reduce<Record<string, number>>((acc, todo) => {
      if (todo.isDone) {
        const key = dayjs(todo.createdAt).format('YYYY-MM-DD')
        acc[key] = (acc[key] ?? 0) + 1
      }
      return acc
    }, {})
  }, [todos])

  const calendarDays = useMemo(() => {
    const monthStart = visibleMonth.startOf('month')
    const monthEnd = visibleMonth.endOf('month')
    const gridStart = monthStart.startOf('week')
    const gridEnd = monthEnd.endOf('week')
    const days: dayjs.Dayjs[] = []

    let cursor = gridStart
    while (cursor.isBefore(gridEnd) || cursor.isSame(gridEnd, 'day')) {
      days.push(cursor)
      cursor = cursor.add(1, 'day')
    }

    return days
  }, [visibleMonth])

  const weekLabels = ['일', '월', '화', '수', '목', '금', '토']
  const selectedRecords = useMemo(() => {
    if (!selectedDateKey) return []

    const fromTodos: DayRecord[] = todos
      .filter((todo) => dayjs(todo.createdAt).format('YYYY-MM-DD') === selectedDateKey)
      .map((todo: TodoItem) => ({
        id: todo.id,
        title: todo.title,
        createdAt: todo.createdAt,
        status: todo.archived ? 'archived' : todo.isDone ? 'done' : 'active',
      }))

    const fromDeleted: DayRecord[] = deletedTodos
      .filter((todo) => dayjs(todo.createdAt).format('YYYY-MM-DD') === selectedDateKey)
      .map((todo) => ({
        id: todo.id,
        title: todo.title,
        createdAt: todo.createdAt,
        status: 'deleted' as const,
      }))

    return [...fromTodos, ...fromDeleted].sort(
      (a, b) => dayjs(b.createdAt).valueOf() - dayjs(a.createdAt).valueOf(),
    )
  }, [todos, deletedTodos, selectedDateKey])
  const isPastSelectedDate = selectedDateKey
    ? dayjs(selectedDateKey).isBefore(today, 'day')
    : false

  const isCurrentMonth = visibleMonth.isSame(today, 'month')

  const statusLabel: Record<DayRecord['status'], string> = {
    active: '진행 중',
    done: '완료',
    archived: '보관',
    deleted: '삭제됨',
  }

  const handleCompleteWithFlash = (id: string) => {
    setCompleteFlashIds((prev) => (prev.includes(id) ? prev : [...prev, id]))
    toggleDone(id)
    window.setTimeout(() => {
      setCompleteFlashIds((prev) => prev.filter((itemId) => itemId !== id))
    }, 500)
  }

  return (
    <section className="screen">
      <header className="screen-header home-header">
        <h1>캘린더</h1>
        <p>{dayjs().format('YYYY.MM.DD')}</p>
      </header>

      <section className="schedule-calendar" aria-label="월간 일정 캘린더">
        <header className="calendar-header">
          <button
            type="button"
            className="calendar-month-nav"
            onClick={() => {
              setVisibleMonth((prev) => prev.subtract(1, 'month'))
              setSelectedDateKey(null)
            }}
            aria-label="이전 달 보기"
          >
            ‹
          </button>
          <strong>{visibleMonth.format('YYYY년 M월')}</strong>
          <button
            type="button"
            className="calendar-month-nav"
            onClick={() => {
              if (!isCurrentMonth) {
                setVisibleMonth((prev) => prev.add(1, 'month'))
                setSelectedDateKey(null)
              }
            }}
            aria-label="다음 달 보기"
            disabled={isCurrentMonth}
          >
            ›
          </button>
        </header>
        <p className="calendar-timezone-note">{timeZone} 기준 자정으로 계산해요.</p>
        <p className="calendar-lock-note">미래 날짜는 미리 볼 수 없어요.</p>

        <div className="calendar-weekdays" aria-hidden="true">
          {weekLabels.map((label) => (
            <span key={label}>{label}</span>
          ))}
        </div>

        <div className="calendar-grid">
          {calendarDays.map((day) => {
            const key = day.format('YYYY-MM-DD')
            const isToday = day.isSame(today, 'day')
            const isFuture = day.isAfter(today, 'day')
            const isCurrentMonthCell = day.month() === visibleMonth.month()
            const isSelected = key === selectedDateKey
            const totalActive = activeTodoDateMap[key] || 0
            const doneCount = doneTodoDateMap[key] || 0
            const hasTodo = !isFuture && totalActive > 0
            const stickerSrc = doneCount === 0 ? done0 : [done1, done2, done3, done4, done5][Math.min(doneCount - 1, 4)]

            return (
              <button
                type="button"
                key={key}
                className={`calendar-day${isCurrentMonthCell ? '' : ' is-out-month'}${isToday ? ' is-today' : ''}${isFuture ? ' is-future' : ''}${isSelected ? ' is-selected' : ''}`}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'flex-start',
                  padding: '8px 4px',
                  minHeight: '80px',     // 칸 높이 고정
                  background: '#fff',
                  border: '1px solid #f0f0f0',
                  borderRadius: '12px',
                  cursor: isFuture ? 'default' : 'pointer',
                  position: 'relative',
                  overflow: 'hidden'     // 스티커가 삐져나오지 못하게 차단
                }}
                onClick={() => {
                  if (isFuture) return
                  setSelectedDateKey(hasTodo ? key : null)
                }}
                disabled={isFuture}
              >
                <div className="calendar-day-content">
                  <span className="calendar-day-number">{day.format('D')}</span>
                  {hasTodo && (
                    <span className="calendar-sticker-area" aria-hidden="true">
                     
                    </span>
                  )}
                </div>
                <div className="calendar-sticker-area" style={{ 
                  width: '100%', 
                  height: '45px',       /* 칸 안에서 스티커가 차지할 높이 */
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center',
                  marginTop: '2px'      /* 숫자와의 간격 */
                }}>
                  {hasTodo && (
                    <img 
                      src={stickerSrc} 
                      alt="sticker" 
                      style={{ 
                        width: '38px',   /* ✅ 32px ~ 38px 사이가 가장 적당해요! */
                        height: '38px', 
                        objectFit: 'contain', /* ✅ 이미지가 잘리지 않고 비율에 맞춰 쏙 들어오게 함 */
                        display: 'block'
                      }} 
                    />
                  )}
                </div>
              </button>
            )
          })}
        </div>

        {selectedDateKey ? (
          <section className="calendar-selected-block" aria-live="polite">
            <h2 className="calendar-selected-title">{dayjs(selectedDateKey).format('YYYY.MM.DD')} 할 일</h2>
            {isPastSelectedDate && !isAuthenticated ? (
              <div className="calendar-login-prompt">
                <p>과거 기록은 로그인 후 확인할 수 있어요.</p>
                <button type="button" className="primary-button" onClick={() => navigate('/login')}>
                  로그인하기
                </button>
              </div>
            ) : (
            <ul className="calendar-selected-list">
              {selectedRecords.map((item) => (
                <li key={item.id} className="calendar-selected-row">
                  {item.status === 'deleted' ? (
                    <article className="calendar-selected-item is-deleted">
                      <span>{item.title}</span>
                      <em>{statusLabel[item.status]}</em>
                    </article>
                  ) : isPastSelectedDate && item.status === 'active' ? (
                    <SwipeablePastActiveRow
                      item={item}
                      onView={(id) =>
                        navigate(`/todo/${id}`, {
                          state: {
                            from: 'schedule',
                            selectedDateKey,
                            visibleMonthKey: visibleMonth.format('YYYY-MM'),
                          },
                        })
                      }
                      onArchive={archiveTodo}
                      onDelete={removeTodo}
                      onComplete={handleCompleteWithFlash}
                      isCompleteFlash={completeFlashIds.includes(item.id)}
                    />
                  ) : (
                    <button
                      type="button"
                      className={`calendar-selected-item${item.status === 'archived' ? ' is-archived' : ''}`}
                      onClick={() =>
                        navigate(`/todo/${item.id}`, {
                          state: {
                            from: 'schedule',
                            selectedDateKey,
                            visibleMonthKey: visibleMonth.format('YYYY-MM'),
                          },
                        })
                      }
                    >
                      <span>{item.title}</span>
                      <em>{statusLabel[item.status]}</em>
                    </button>
                  )}
                </li>
              ))}
            </ul>
            )}
          </section>
        ) : null}
      </section>
    </section>
  )
}
