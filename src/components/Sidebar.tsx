import { useEffect, useRef, useState } from 'react'
import { MoreHorizontal, Plus } from 'lucide-react'
import type { HistoryItem } from '../types'

interface SidebarProps {
  activeId: string
  history: HistoryItem[]
  onSelect: (item: HistoryItem) => void
  onNew: () => void
  onRename: (id: string, title: string) => void
}

interface HistoryGroup {
  label: string
  items: HistoryItem[]
}

function groupHistory(items: HistoryItem[]): HistoryGroup[] {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const weekAgo = today.getTime() - 6 * 24 * 60 * 60 * 1000
  const groups: HistoryGroup[] = [
    { label: '今天', items: [] },
    { label: '近 7 天', items: [] },
    { label: '更早', items: [] },
  ]

  for (const item of items) {
    if (item.updatedAt >= today.getTime()) groups[0].items.push(item)
    else if (item.updatedAt >= weekAgo) groups[1].items.push(item)
    else groups[2].items.push(item)
  }

  return groups.filter((group) => group.items.length)
}

function formatTime(timestamp: number) {
  const date = new Date(timestamp)
  const today = new Date()
  if (date.toDateString() === today.toDateString()) {
    return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })
  }
  return `${date.getMonth() + 1}月${date.getDate()}日`
}

export function Sidebar({ activeId, history, onSelect, onNew, onRename }: SidebarProps) {
  const historyGroups = groupHistory(history)
  const [menu, setMenu] = useState('')
  const [editing, setEditing] = useState('')
  const [title, setTitle] = useState('')
  const root = useRef<HTMLElement>(null)
  useEffect(() => {
    if (!menu) return
    const close = (event: PointerEvent) => { if (event.target instanceof Element && !event.target.closest('.history-item-menu')) setMenu('') }
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setMenu('') }
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', escape)
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', escape) }
  }, [menu])

  return (
    <aside className="history-sidebar" ref={root}>
      <button className="new-chat" onClick={onNew}>
        <Plus size={17} strokeWidth={1.6} />
        新建对话
      </button>

      <div className="history-scroll">
        {historyGroups.length ? historyGroups.map((group) => (
          <section className="history-group" key={group.label}>
            <h2>{group.label}</h2>
            <div className="history-list">
              {group.items.map((item) => (
                <div className={`history-row ${activeId === item.id ? 'active' : ''}`} key={item.id}>
                  {editing === item.id ? <form className="history-rename" onSubmit={event => { event.preventDefault(); if (title.trim()) { onRename(item.id, title); setEditing('') } }}>
                    <input autoFocus aria-label="对话标题" maxLength={80} value={title} onChange={event => setTitle(event.target.value)} onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); setEditing('') } }} />
                    <button type="submit" disabled={!title.trim()}>保存</button><button type="button" onClick={() => setEditing('')}>取消</button>
                  </form> : <>
                    <button className="history-item" onClick={() => { setMenu(''); onSelect(item) }}>
                      <span>{item.title}</span><time dateTime={new Date(item.updatedAt).toISOString()}>{formatTime(item.updatedAt)}</time>
                    </button>
                    <div className="history-item-menu">
                      <button type="button" className="history-more" aria-label={`更多操作：${item.title}`} aria-expanded={menu === item.id} onClick={() => setMenu(menu === item.id ? '' : item.id)}><MoreHorizontal size={17} /></button>
                      {menu === item.id ? <div className="history-menu"><button type="button" onClick={() => { setTitle(item.title); setEditing(item.id); setMenu('') }}>修改标题</button></div> : null}
                    </div>
                  </>}
                </div>
              ))}
            </div>
          </section>
        )) : (
          <div className="history-empty">
            <p>暂无历史对话</p>
            <span>发送第一条消息后会保存在这里</span>
          </div>
        )}
      </div>

    </aside>
  )
}
