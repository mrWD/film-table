import { useEffect, useState } from 'react'
import { useLibrary } from '../store/library'
import { useShowCache, refreshShows } from '../store/cache'
import {
  buildUpcoming,
  buildWatchItems,
  groupByDay,
} from '../store/selectors'
import { ShowGridCard, ShowNextCard, UpcomingRow } from '../components/cards'
import { EmptyState, SectionPill, SkeletonRows, TopTabs, useNow } from '../components/ui'
import { IconGrid, IconList, IconTv } from '../components/Icons'

const SECTION_LABEL: Record<string, string> = {
  watchNext: 'WATCH NEXT',
  notStarted: "HAVEN'T STARTED YET",
  stale: "HAVEN'T WATCHED FOR A WHILE",
}

export default function ShowsPage() {
  const [tab, setTab] = useState('WATCH LIST')
  const shows = useLibrary((s) => s.shows)
  const entries = useShowCache((s) => s.entries)
  const watchGrid = useLibrary((s) => s.watchGrid)
  const setWatchGrid = useLibrary((s) => s.setWatchGrid)
  const now = useNow()

  const followedIds = Object.values(shows)
    .filter((t) => t.status === 'following')
    .map((t) => t.id)

  useEffect(() => {
    void refreshShows(followedIds)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [followedIds.join(',')])

  if (followedIds.length === 0) {
    return (
      <div className="page">
        <TopTabs tabs={['WATCH LIST', 'UPCOMING']} active={tab} onChange={setTab} />
        <EmptyState
          icon={<IconTv size={44} strokeWidth={1.4} />}
          title="No shows yet"
          text="Find a show you're watching and start tracking episodes."
          actionLabel="Explore shows"
          actionTo="/explore"
        />
      </div>
    )
  }

  const items = buildWatchItems(shows, entries, now)
  const loading = items.filter((i) => i.bucket === 'loading')

  return (
    <div className="page">
      <TopTabs tabs={['WATCH LIST', 'UPCOMING']} active={tab} onChange={setTab} />
      {tab === 'WATCH LIST' ? (
        <>
          <div className="listtools">
            <span />
            <button
              className="iconbtn"
              aria-label="Toggle layout"
              onClick={() => setWatchGrid(!watchGrid)}
            >
              {watchGrid ? <IconList size={22} /> : <IconGrid size={22} />}
            </button>
          </div>
          {(['watchNext', 'notStarted', 'stale'] as const).map((bucket) => {
            const list = items.filter((i) => i.bucket === bucket)
            if (list.length === 0) return null
            return (
              <section key={bucket}>
                <SectionPill>{SECTION_LABEL[bucket]}</SectionPill>
                {watchGrid ? (
                  <div className="grid3">
                    {list.map((i) => (
                      <ShowGridCard key={i.show.id} item={i} />
                    ))}
                  </div>
                ) : (
                  list.map((i) => <ShowNextCard key={i.show.id} item={i} now={now} />)
                )}
              </section>
            )
          })}
          {loading.length > 0 && <SkeletonRows count={Math.min(loading.length, 3)} />}
          {items.every((i) => i.bucket === 'upToDate') && loading.length === 0 && (
            <EmptyState
              icon={<IconTv size={44} strokeWidth={1.4} />}
              title="You're all caught up"
              text="New episodes will appear here as soon as they air."
              actionLabel="Find more shows"
              actionTo="/explore"
            />
          )}
        </>
      ) : (
        <UpcomingTab />
      )}
    </div>
  )
}

function UpcomingTab() {
  const shows = useLibrary((s) => s.shows)
  const entries = useShowCache((s) => s.entries)
  const now = useNow()
  const upcoming = buildUpcoming(shows, entries, now)
  const groups = groupByDay(upcoming, now)

  if (upcoming.length === 0) {
    return (
      <EmptyState
        icon={<IconTv size={44} strokeWidth={1.4} />}
        title="Nothing scheduled"
        text="When your shows announce new episodes, they'll show up here."
      />
    )
  }
  return (
    <>
      {groups.map((g) => (
        <section key={g.label}>
          <SectionPill>{g.label}</SectionPill>
          {g.entries.map((e) => (
            <UpcomingRow key={`${e.show.id}-${e.ep.id}`} entry={e} now={now} />
          ))}
        </section>
      ))}
    </>
  )
}
