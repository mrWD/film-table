import { useEffect, useState, type ReactNode } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { useUi, vibrate } from '../store/ui'
import {
  IconCheck,
  IconChevronRight,
  IconClapper,
  IconSearch,
  IconTv,
  IconUser,
} from './Icons'

// ---------- hooks ----------

export function useNow(intervalMs = 60000): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), intervalMs)
    return () => clearInterval(t)
  }, [intervalMs])
  return now
}

// ---------- navigation ----------

const NAV = [
  { to: '/shows', label: 'Shows', icon: IconTv },
  { to: '/movies', label: 'Movies', icon: IconClapper },
  { to: '/explore', label: 'Explore', icon: IconSearch },
  { to: '/profile', label: 'Profile', icon: IconUser },
]

export function BottomNav() {
  return (
    <nav className="bottomnav">
      <div className="bottomnav-inner">
        {NAV.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} className={({ isActive }) => `navitem${isActive ? ' active' : ''}`}>
            <Icon size={25} strokeWidth={1.7} />
            <span>{label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  )
}

export function TopTabs({
  tabs,
  active,
  onChange,
}: {
  tabs: string[]
  active: string
  onChange: (t: string) => void
}) {
  return (
    <div className="toptabs">
      {tabs.map((t) => (
        <button
          key={t}
          className={`toptab${t === active ? ' active' : ''}`}
          onClick={() => onChange(t)}
        >
          {t}
        </button>
      ))}
    </div>
  )
}

export function SectionPill({ children }: { children: ReactNode }) {
  return (
    <div className="sectionpill-wrap">
      <span className="sectionpill">{children}</span>
    </div>
  )
}

// ---------- badges & buttons ----------

export function Badge({
  variant,
  children,
}: {
  variant: 'black' | 'yellow' | 'green'
  children: ReactNode
}) {
  return <span className={`badge badge-${variant}`}>{children}</span>
}

export function CheckCircle({
  on,
  onClick,
  small,
  disabled,
  label,
}: {
  on: boolean
  onClick?: () => void
  small?: boolean
  disabled?: boolean
  label?: string
}) {
  return (
    <button
      className={`check${on ? ' on' : ''}${small ? ' small' : ''}`}
      disabled={disabled}
      aria-label={label ?? (on ? 'Mark unwatched' : 'Mark watched')}
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        if (!disabled && onClick) {
          vibrate()
          onClick()
        }
      }}
    >
      <IconCheck size={small ? 18 : 22} strokeWidth={2.4} />
    </button>
  )
}

export function ShowChip({ name, to }: { name: string; to?: string }) {
  const inner = (
    <>
      <span className="showchip-name">{name}</span>
      <IconChevronRight size={12} strokeWidth={3} />
    </>
  )
  if (to) {
    return (
      <Link className="showchip" to={to}>
        {inner}
      </Link>
    )
  }
  return <span className="showchip">{inner}</span>
}

// ---------- poster ----------

export function Poster({
  src,
  alt,
  className,
}: {
  src?: string | null
  alt: string
  className?: string
}) {
  const [failed, setFailed] = useState(false)
  if (!src || failed) {
    return (
      <div className={`poster poster-fallback ${className ?? ''}`}>
        <IconTv size={28} strokeWidth={1.5} />
      </div>
    )
  }
  return (
    <img
      className={`poster ${className ?? ''}`}
      src={src}
      alt={alt}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  )
}

// ---------- feedback ----------

export function ToastHost() {
  const toast = useUi((s) => s.toast)
  const dismiss = useUi((s) => s.dismissToast)
  if (!toast) return null
  return (
    <div className="toast" role="status">
      <span className="toast-msg">{toast.message}</span>
      {toast.undo && (
        <button
          className="toast-undo"
          onClick={() => {
            toast.undo?.()
            dismiss()
          }}
        >
          UNDO
        </button>
      )}
    </div>
  )
}

export function ConfirmHost() {
  const req = useUi((s) => s.confirmReq)
  const answer = useUi((s) => s.answerConfirm)
  if (!req) return null
  return (
    <div className="modal-backdrop" onClick={() => answer(false)}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{req.title}</h3>
        <p>{req.message}</p>
        <div className="modal-actions">
          <button className="btn ghost" onClick={() => answer(false)}>
            Cancel
          </button>
          <button className={`btn ${req.danger ? 'danger' : ''}`} onClick={() => answer(true)}>
            {req.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

export function EmptyState({
  icon,
  title,
  text,
  actionLabel,
  actionTo,
}: {
  icon: ReactNode
  title: string
  text: string
  actionLabel?: string
  actionTo?: string
}) {
  return (
    <div className="empty">
      <div className="empty-icon">{icon}</div>
      <h3>{title}</h3>
      <p>{text}</p>
      {actionLabel && actionTo && (
        <Link to={actionTo} className="btn">
          {actionLabel}
        </Link>
      )}
    </div>
  )
}

export function SkeletonRows({ count = 3 }: { count?: number }) {
  return (
    <div className="skel-list">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="card skel-card">
          <div className="skel skel-poster" />
          <div className="skel-lines">
            <div className="skel skel-line w40" />
            <div className="skel skel-line w70" />
            <div className="skel skel-line w55" />
          </div>
        </div>
      ))}
    </div>
  )
}

export function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])
  return null
}

export function ProgressBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0
  return (
    <div className="progress">
      <div className="progress-fill" style={{ width: `${pct}%` }} />
    </div>
  )
}
