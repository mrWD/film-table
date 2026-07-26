import { useEffect } from 'react'
import { HashRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import ShowsPage from './pages/ShowsPage'
import MoviesPage from './pages/MoviesPage'
import ExplorePage from './pages/ExplorePage'
import ShowDetailPage from './pages/ShowDetailPage'
import MovieDetailPage from './pages/MovieDetailPage'
import ProfilePage from './pages/ProfilePage'
import InsightsPage from './pages/InsightsPage'
import { BottomNav, ConfirmHost, ScrollToTop, ToastHost } from './components/ui'
import { SupportFab } from './components/Support'
import { MigrationBanner } from './components/MigrationBanner'
import { InstallHint } from './components/InstallHint'
import { Analytics } from './components/Analytics'
import { useLibrary } from './store/library'
import { refreshShows } from './store/cache'
import { watchSystemTheme } from './store/theme'
import { beginSessionOnce, useStats } from './store/stats'

function Shell() {
  const location = useLocation()
  const isDetail = location.pathname.startsWith('/show/') || location.pathname.startsWith('/movie/')

  useEffect(() => {
    const { shows } = useLibrary.getState()
    void refreshShows(Object.values(shows).map((t) => t.id))
    beginSessionOnce()
    return watchSystemTheme()
  }, [])

  useEffect(() => {
    // Group detail routes so the counter stays a handful of screens, not per-title.
    const path = location.pathname
    const key = path.startsWith('/show/') ? '/show' : path.startsWith('/movie/') ? '/movie' : path
    useStats.getState().recordRoute(key)
  }, [location.pathname])

  return (
    <div className={`app${isDetail ? ' on-detail' : ''}`}>
      <ScrollToTop />
      <MigrationBanner />
      <InstallHint />
      <Routes>
        <Route path="/" element={<Navigate to="/shows" replace />} />
        <Route path="/shows" element={<ShowsPage />} />
        <Route path="/movies" element={<MoviesPage />} />
        <Route path="/explore" element={<ExplorePage />} />
        <Route path="/show/:id" element={<ShowDetailPage />} />
        <Route path="/movie/:id" element={<MovieDetailPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/insights" element={<InsightsPage />} />
        <Route path="*" element={<Navigate to="/shows" replace />} />
      </Routes>
      <BottomNav />
      <SupportFab />
      <ToastHost />
      <ConfirmHost />
      <Analytics />
    </div>
  )
}

export default function App() {
  return (
    <HashRouter>
      <Shell />
    </HashRouter>
  )
}
