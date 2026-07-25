import type { ReactNode } from 'react'

interface IconProps {
  size?: number
  strokeWidth?: number
  className?: string
}

function svg(path: ReactNode, { size = 24, strokeWidth = 1.8, className }: IconProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {path}
    </svg>
  )
}

export const IconTv = (p: IconProps) =>
  svg(
    <>
      <rect x="2.5" y="6.5" width="19" height="13" rx="2.5" />
      <path d="M8 2.5l4 4 4-4" />
    </>,
    p,
  )

export const IconClapper = (p: IconProps) =>
  svg(
    <>
      <rect x="3" y="8.5" width="18" height="12" rx="2" />
      <path d="M3.5 8.5l1.2-4.2 17.4 2.6-.6 1.9" />
      <path d="M8 5.2l2.2 3.3M13 6l2.2 3.3" />
    </>,
    p,
  )

export const IconSearch = (p: IconProps) =>
  svg(
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="M16.5 16.5L21 21" />
    </>,
    p,
  )

export const IconUser = (p: IconProps) =>
  svg(
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4.5 20.5c1.5-3.5 4.2-5 7.5-5s6 1.5 7.5 5" />
    </>,
    p,
  )

export const IconCheck = (p: IconProps) => svg(<path d="M5 12.5l4.5 4.5L19 7.5" />, p)

export const IconPlus = (p: IconProps) => svg(<path d="M12 5v14M5 12h14" />, p)

export const IconChevronRight = (p: IconProps) => svg(<path d="M9 5l7 7-7 7" />, p)

export const IconChevronDown = (p: IconProps) => svg(<path d="M5 9l7 7 7-7" />, p)

export const IconBack = (p: IconProps) => svg(<path d="M15 5l-7 7 7 7" />, p)

export const IconGrid = (p: IconProps) =>
  svg(
    <>
      <rect x="4" y="4" width="7" height="7" rx="1.5" />
      <rect x="13" y="4" width="7" height="7" rx="1.5" />
      <rect x="4" y="13" width="7" height="7" rx="1.5" />
      <rect x="13" y="13" width="7" height="7" rx="1.5" />
    </>,
    p,
  )

export const IconList = (p: IconProps) =>
  svg(
    <>
      <path d="M9 6h11M9 12h11M9 18h11" />
      <path d="M4 6h.01M4 12h.01M4 18h.01" strokeWidth={2.6} />
    </>,
    p,
  )

export const IconTrash = (p: IconProps) =>
  svg(
    <>
      <path d="M4 7h16M10 4h4M6.5 7l1 13h9l1-13" />
      <path d="M10 11v5M14 11v5" />
    </>,
    p,
  )

export const IconDownload = (p: IconProps) =>
  svg(
    <>
      <path d="M12 4v11M7 10.5l5 5 5-5" />
      <path d="M4.5 19.5h15" />
    </>,
    p,
  )

export const IconUpload = (p: IconProps) =>
  svg(
    <>
      <path d="M12 15V4M7 8.5l5-5 5 5" />
      <path d="M4.5 19.5h15" />
    </>,
    p,
  )

export const IconStop = (p: IconProps) => svg(<rect x="6" y="6" width="12" height="12" rx="2" />, p)

export const IconPlay = (p: IconProps) => svg(<path d="M8 5.5l11 6.5-11 6.5z" />, p)

export const IconStar = (p: IconProps) =>
  svg(<path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.8z" />, p)

export const IconCalendar = (p: IconProps) =>
  svg(
    <>
      <rect x="3.5" y="5.5" width="17" height="15" rx="2" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
    </>,
    p,
  )

export const IconX = (p: IconProps) => svg(<path d="M6 6l12 12M18 6L6 18" />, p)

export const IconHeart = (p: IconProps) =>
  svg(
    <path d="M12 20s-7-4.4-7-9.2A4 4 0 0 1 12 8a4 4 0 0 1 7 2.8C19 15.6 12 20 12 20z" />,
    p,
  )
