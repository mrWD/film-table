import Foundation

/// What the app hands the widgets.
///
/// The widget runs in its own process and cannot read the app's container, so the two
/// meet in an App Group. The app writes this structure as JSON whenever the library
/// changes; the widgets only ever read it. Nothing here is fetched from the network —
/// the app has already done that, and a widget that phoned home would break the promise
/// that the library never leaves the device.
struct WidgetSnapshot: Codable {
    var upNext: [Entry]
    var upcoming: [Entry]
    /// When the app last wrote this, so a stale widget can say so rather than lie.
    var updatedAt: Date

    struct Entry: Codable, Identifiable {
        var id: String
        var show: String
        /// Already formatted as the app formats it — `3×01`, not `S03E01`.
        var episode: String
        var title: String
        /// Absent for anything without a known air date.
        var airsAt: Date?
        /// Already out and still unwatched — worth saying so, because the date alone
        /// reads as a schedule and hides that the episode is watchable right now.
        var aired: Bool?
        var network: String?
        /// How many more episodes are waiting after this one.
        var remaining: Int?
        /// File name inside the App Group's caches, written by the app.
        var poster: String?
    }

    static let empty = WidgetSnapshot(upNext: [], upcoming: [], updatedAt: .distantPast)
}

enum SharedStore {
    /// Must match the App Group on both targets and `lib/widget.ts` in the web app.
    static let suite = "group.com.mrwd.filmtable"
    static let key = "widget-snapshot-v1"

    static func read() -> WidgetSnapshot {
        guard let defaults = UserDefaults(suiteName: suite),
              let raw = defaults.string(forKey: key),
              let data = raw.data(using: .utf8) else { return .empty }
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .millisecondsSince1970
        return (try? decoder.decode(WidgetSnapshot.self, from: data)) ?? .empty
    }

    /// Posters are files the app dropped in the group container; the widget only reads.
    static func posterURL(_ name: String) -> URL? {
        guard let dir = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: suite)
        else { return nil }
        return dir.appendingPathComponent("posters").appendingPathComponent(name)
    }
}
