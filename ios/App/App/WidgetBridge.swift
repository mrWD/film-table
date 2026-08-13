import Capacitor
import Foundation
import WidgetKit

/**
 * The one thing the web layer cannot do for itself: hand data to a process it does not
 * control.
 *
 * The widgets live outside the app's container, so the snapshot goes into the shared
 * App Group — as a string in `UserDefaults`, which is the right size of tool for a few
 * kilobytes of JSON, and as poster files beside it because a widget cannot fetch images
 * itself.
 *
 * Everything here is a write. The plugin exposes no way to read the group back into the
 * web view, so a bug on this side cannot turn into a way out for the library.
 */
@objc(WidgetBridgePlugin)
public class WidgetBridgePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "WidgetBridgePlugin"
    public let jsName = "WidgetBridge"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "write", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "cachePoster", returnType: CAPPluginReturnPromise),
    ]

    private let suite = "group.com.mrwd.filmtable"
    private let key = "widget-snapshot-v1"

    @objc func write(_ call: CAPPluginCall) {
        guard let json = call.getString("json") else {
            call.reject("json is required")
            return
        }
        guard let defaults = UserDefaults(suiteName: suite) else {
            // The App Group is missing from the entitlements — a build problem, not a
            // runtime one, and worth saying plainly rather than failing quietly.
            call.reject("app group \(suite) unavailable")
            return
        }
        defaults.set(json, forKey: key)
        WidgetCenter.shared.reloadAllTimelines()
        call.resolve()
    }

    /**
     * Posters are copied into the group as files. The widget reads them straight off
     * disk: WidgetKit renders on a tight budget and cannot wait for a download.
     */
    @objc func cachePoster(_ call: CAPPluginCall) {
        guard let name = call.getString("name"), let source = call.getString("url"),
              let url = URL(string: source) else {
            call.reject("name and url are required")
            return
        }
        guard let dir = FileManager.default
            .containerURL(forSecurityApplicationGroupIdentifier: suite)?
            .appendingPathComponent("posters") else {
            call.reject("app group \(suite) unavailable")
            return
        }
        let destination = dir.appendingPathComponent(name)
        if FileManager.default.fileExists(atPath: destination.path) {
            call.resolve()
            return
        }
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        URLSession.shared.dataTask(with: url) { data, _, _ in
            guard let data, !data.isEmpty else {
                // A missing poster is not worth failing a check-in over; the widget
                // draws its placeholder and the next write tries again.
                call.resolve()
                return
            }
            try? data.write(to: destination)
            WidgetCenter.shared.reloadAllTimelines()
            call.resolve()
        }.resume()
    }
}
