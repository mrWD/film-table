import SwiftUI
import WidgetKit

/// The two widgets, deliberately kept separate rather than one with a toggle: on the
/// home screen a widget is chosen once and then just sits there, so "what do I watch
/// next" and "what airs soon" are two different things a person puts on the screen,
/// not two modes of one thing.

private struct SnapshotEntry: TimelineEntry {
    let date: Date
    let snapshot: WidgetSnapshot
}

private struct Provider: TimelineProvider {
    func placeholder(in context: Context) -> SnapshotEntry {
        SnapshotEntry(date: Date(), snapshot: .empty)
    }

    func getSnapshot(in context: Context, completion: @escaping (SnapshotEntry) -> Void) {
        completion(SnapshotEntry(date: Date(), snapshot: SharedStore.read()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<SnapshotEntry>) -> Void) {
        // One entry, refreshed in an hour. The app also reloads timelines the moment
        // the library changes, so this is only the floor for a phone that has not been
        // opened — not the mechanism people actually see.
        let entry = SnapshotEntry(date: Date(), snapshot: SharedStore.read())
        let next = Calendar.current.date(byAdding: .hour, value: 1, to: Date()) ?? Date()
        completion(Timeline(entries: [entry], policy: .after(next)))
    }
}

private struct Poster: View {
    let name: String?

    var body: some View {
        Group {
            if let name, let url = SharedStore.posterURL(name),
               let data = try? Data(contentsOf: url), let image = UIImage(data: data) {
                Image(uiImage: image).resizable().aspectRatio(contentMode: .fill)
            } else {
                // A grey block rather than an icon: at this size an icon reads as noise,
                // and the row still lines up while the app fills the cache in.
                Color.secondary.opacity(0.18)
            }
        }
        .frame(width: 38, height: 54)
        .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
    }
}

private struct Row: View {
    let entry: WidgetSnapshot.Entry
    let showsDate: Bool

    private var when: String? {
        guard let airsAt = entry.airsAt else { return nil }
        // An episode that is already out is described by what you can do with it, not by
        // the day it arrived: "Out now" beats "12 Aug" when the point is that it is
        // waiting for you.
        if entry.aired == true {
            return Calendar.current.isDateInToday(airsAt) ? "Out today" : "Out now"
        }
        let formatter = DateFormatter()
        formatter.dateFormat = Calendar.current.isDateInToday(airsAt) ? "HH:mm" : "d MMM"
        return formatter.string(from: airsAt)
    }

    var body: some View {
        HStack(spacing: 9) {
            Poster(name: entry.poster)
            VStack(alignment: .leading, spacing: 2) {
                Text(entry.show).font(.system(size: 13, weight: .semibold)).lineLimit(1)
                HStack(spacing: 5) {
                    Text(entry.episode).font(.system(size: 12, weight: .bold))
                    Text(entry.title).font(.system(size: 12)).foregroundStyle(.secondary).lineLimit(1)
                }
                if showsDate, let when {
                    Text([when, entry.network].compactMap { $0 }.joined(separator: " · "))
                        .font(.system(size: 11)).foregroundStyle(.secondary).lineLimit(1)
                }
            }
            Spacer(minLength: 0)
            if !showsDate, let remaining = entry.remaining, remaining > 0 {
                Text("+\(remaining)").font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(.secondary)
            }
        }
    }
}

private struct ListView: View {
    let title: String
    let entries: [WidgetSnapshot.Entry]
    let emptyText: String
    let showsDate: Bool
    @Environment(\.widgetFamily) private var family

    private var limit: Int { family == .systemLarge ? 5 : 2 }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title.uppercased())
                .font(.system(size: 11, weight: .bold)).kerning(0.6)
                .foregroundStyle(.secondary)
            if entries.isEmpty {
                Text(emptyText).font(.system(size: 12)).foregroundStyle(.secondary)
                Spacer(minLength: 0)
            } else {
                ForEach(entries.prefix(limit)) { entry in
                    // Each row opens its own show rather than just the app: tapping a
                    // specific episode and landing on a generic screen is a small
                    // betrayal of the tap.
                    Link(destination: URL(string: "filmtable://show/\(entry.id)")!) {
                        Row(entry: entry, showsDate: showsDate)
                    }
                }
                Spacer(minLength: 0)
            }
        }
        .padding(14)
    }
}

struct UpNextWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "FilmTableUpNext", provider: Provider()) { entry in
            ListView(
                title: "Up next",
                entries: entry.snapshot.upNext,
                emptyText: "Nothing waiting. Follow a show to see it here.",
                showsDate: false
            )
            .containerBackground(.fill.tertiary, for: .widget)
        }
        .configurationDisplayName("Up next")
        .description("The next episode of each show you follow.")
        .supportedFamilies([.systemMedium, .systemLarge])
    }
}

struct UpcomingWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "FilmTableUpcoming", provider: Provider()) { entry in
            ListView(
                title: "Upcoming",
                entries: entry.snapshot.upcoming,
                emptyText: "Nothing out or scheduled right now.",
                showsDate: true
            )
            .containerBackground(.fill.tertiary, for: .widget)
        }
        .configurationDisplayName("Upcoming")
        .description("Episodes already out and still waiting, then what airs next.")
        .supportedFamilies([.systemMedium, .systemLarge])
    }
}

@main
struct FilmTableWidgets: WidgetBundle {
    var body: some Widget {
        UpNextWidget()
        UpcomingWidget()
    }
}
