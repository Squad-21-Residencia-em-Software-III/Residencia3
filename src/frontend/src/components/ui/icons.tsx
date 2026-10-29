type IconProps = { size?: number }

const base = (size: number) => ({ width: size, height: size, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': true })

export const CloseIcon = ({ size = 16 }: IconProps) => (
  <svg {...base(size)}>
    <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
)

export const MenuIcon = ({ size = 18 }: IconProps) => (
  <svg {...base(size)}>
    <path d="M2.5 4h11M2.5 8h11M2.5 12h11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
)

export const PlusIcon = ({ size = 14 }: IconProps) => (
  <svg {...base(size)}>
    <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
)

export const FilterIcon = ({ size = 14 }: IconProps) => (
  <svg {...base(size)}>
    <path d="M2 4h12M4.5 8h7M7 12h2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
)

export const SearchIcon = ({ size = 16 }: IconProps) => (
  <svg {...base(size)}>
    <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.6" />
    <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
)

export const BellIcon = ({ size = 16 }: IconProps) => (
  <svg {...base(size)}>
    <path
      d="M8 2a4 4 0 00-4 4v2.5L2.8 11h10.4L12 8.5V6a4 4 0 00-4-4zM6.5 13a1.5 1.5 0 003 0"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)

export const GridIcon = ({ size = 16 }: IconProps) => (
  <svg {...base(size)}>
    <rect x="2" y="2" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.5" />
    <rect x="9" y="2" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.5" />
    <rect x="2" y="9" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.5" />
    <rect x="9" y="9" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.5" />
  </svg>
)

export const TruckIcon = ({ size = 16 }: IconProps) => (
  <svg {...base(size)}>
    <path d="M1.5 4h8v7h-8zM9.5 6.5h3l2 2.5v2h-5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    <circle cx="4.5" cy="12" r="1.3" fill="currentColor" />
    <circle cx="11.5" cy="12" r="1.3" fill="currentColor" />
  </svg>
)

export const UsersIcon = ({ size = 16 }: IconProps) => (
  <svg {...base(size)}>
    <circle cx="6" cy="5.5" r="2.5" stroke="currentColor" strokeWidth="1.5" />
    <path d="M1.5 13c0-2.5 2-4 4.5-4s4.5 1.5 4.5 4M11 3.2a2.5 2.5 0 010 4.6M14.5 13c0-1.8-1-3-2.5-3.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
)

export const RouteIcon = ({ size = 16 }: IconProps) => (
  <svg {...base(size)}>
    <circle cx="4" cy="12" r="1.8" stroke="currentColor" strokeWidth="1.5" />
    <circle cx="12" cy="4" r="1.8" stroke="currentColor" strokeWidth="1.5" />
    <path d="M5.8 12H10a2 2 0 000-4H6a2 2 0 010-4h4.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
)

export const CalendarIcon = ({ size = 16 }: IconProps) => (
  <svg {...base(size)}>
    <rect x="2" y="3" width="12" height="11" rx="2" stroke="currentColor" strokeWidth="1.5" />
    <path d="M2 7h12M5 1.5v3M11 1.5v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
)

export const ChevronDownIcon = ({ size = 16 }: IconProps) => (
  <svg {...base(size)}>
    <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

export const DotsIcon = ({ size = 14 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 14 14" fill="none" aria-hidden="true">
    <circle cx="7" cy="2.5" r="1.2" fill="currentColor" />
    <circle cx="7" cy="7" r="1.2" fill="currentColor" />
    <circle cx="7" cy="11.5" r="1.2" fill="currentColor" />
  </svg>
)

export const ChevronLeftIcon = ({ size = 16 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 10 10" fill="none" aria-hidden="true">
    <path d="M6.5 2L3.5 5L6.5 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

export const LogoutIcon = ({ size = 18 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 18 18" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
    <path d="M7 3H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M12 12l3-3-3-3M15 9H7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

export const FuelIcon = ({ size = 16 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden="true">
    <rect x="2.5" y="2" width="10" height="16" rx="2" stroke="currentColor" strokeWidth="1.5" />
    <rect x="4.5" y="4" width="6" height="4.5" rx="1" stroke="currentColor" strokeWidth="1.3" />
    <path d="M12.5 6h1.7l2.3 2.5v5.8a1.7 1.7 0 0 0 3.4 0V8.6l-2.2-2.3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M4.5 15h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
)


export const AlertIcon = ({ size = 16 }: IconProps) => (
  <svg {...base(size)}>
    <path d="M8 2.2l6 10.6H2L8 2.2z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    <path d="M8 6.5v3M8 11.3v.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
)
