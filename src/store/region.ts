import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/**
 * Which country's streaming availability to show.
 *
 * Availability is licensed per country, so "where can I watch this" has no global
 * answer. The default is read from the browser's locale rather than from geolocation —
 * a locale is already in every request this app makes, while asking for a position
 * would be collecting something we have no business knowing.
 */

/** The markets JustWatch covers best, plus the ones a locale is likely to name. */
export const COUNTRIES: { code: string; name: string }[] = [
  { code: 'US', name: 'United States' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'DE', name: 'Germany' },
  { code: 'FR', name: 'France' },
  { code: 'ES', name: 'Spain' },
  { code: 'IT', name: 'Italy' },
  { code: 'NL', name: 'Netherlands' },
  { code: 'PL', name: 'Poland' },
  { code: 'SE', name: 'Sweden' },
  { code: 'CA', name: 'Canada' },
  { code: 'AU', name: 'Australia' },
  { code: 'BR', name: 'Brazil' },
  { code: 'IN', name: 'India' },
  { code: 'JP', name: 'Japan' },
]

function fromLocale(): string {
  const locales = navigator.languages?.length ? navigator.languages : [navigator.language]
  for (const tag of locales) {
    // 'de-DE' → 'DE'. A bare 'de' says nothing about country, so it is skipped.
    const region = tag?.split('-')[1]?.toUpperCase()
    if (region && COUNTRIES.some((c) => c.code === region)) return region
  }
  return 'US'
}

interface RegionState {
  country: string
  setCountry: (code: string) => void
}

export const useRegion = create<RegionState>()(
  persist(
    (set) => ({
      country: fromLocale(),
      setCountry: (country) => set({ country }),
    }),
    { name: 'filmtable-region-v1', version: 1 },
  ),
)
