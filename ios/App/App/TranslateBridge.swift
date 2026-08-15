import Capacitor
import Foundation
import SwiftUI
import Translation

/**
 On-device translation, for the descriptions the catalogues only publish in English.

 This is not the language model, and the difference is the point. Apple's Translation
 framework runs on any iPhone from iOS 17.4 rather than the few with Apple Intelligence,
 and it translates rather than paraphrases, so it cannot quietly invent a plot point the
 way a 3B model asked to "say this in Russian" eventually will.

 It is reached through a hidden SwiftUI view, which looks like a hack and is not one.
 `translationTask` is a view modifier, and it is the only way in on the versions this app
 supports: the headless `TranslationSession(installedSource:target:)` exists but is iOS 26
 and later, so building on it would mean the feature working on the newest phones only —
 which is the whole reason for preferring this framework over the model. So a zero-sized
 view is parked in the hierarchy, and every translation runs inside its task.

 The same route handles the language pack. Measured on a machine that had never
 translated, English to Russian reports `supported`, not `installed`; the first run puts
 up the system's own download prompt, and later ones do not.
 */
@objc(TranslateBridgePlugin)
public class TranslateBridgePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "TranslateBridgePlugin"
    public let jsName = "TranslateBridge"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "availability", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "translate", returnType: CAPPluginReturnPromise),
    ]

    @available(iOS 16.0, *)
    private static func language(_ tag: String) -> Locale.Language {
        Locale.Language(identifier: tag)
    }

    /**
     What the reader has their phone set to — which is not what `Locale.current` says.

     `Locale.current` is the best match between the user's preferences and the app's own
     localizations, and this app ships English only, so it answers "en" on a Russian
     phone. The same trap catches `navigator.language` in the web view, which is why the
     JavaScript side asks here instead of deciding for itself: with both of them agreeing
     on the wrong answer, the button simply never appeared.
     */
    private static func deviceLanguage() -> String {
        guard let preferred = Locale.preferredLanguages.first else { return "en" }
        if #available(iOS 16.0, *) {
            return Locale.Language(identifier: preferred).languageCode?.identifier ?? "en"
        }
        return String(preferred.prefix(2))
    }

    @objc func availability(_ call: CAPPluginCall) {
        let from = call.getString("from") ?? "en"
        let to = call.getString("to") ?? Self.deviceLanguage()

        // Nothing to do for a reader already in the source language, and asking the
        // framework about en-to-en invites an answer that is technically true and useless.
        guard #available(iOS 18.0, *), from != to else {
            call.resolve(["status": "unsupported", "from": from, "to": to])
            return
        }
        Task {
            let status = await LanguageAvailability().status(
                from: Self.language(from), to: Self.language(to)
            )
            let name: String
            switch status {
            case .installed: name = "installed"
            case .supported: name = "supported"     // real, but the pack downloads first
            case .unsupported: name = "unsupported"
            @unknown default: name = "unsupported"
            }
            call.resolve(["status": name, "from": from, "to": to])
        }
    }

    @objc func translate(_ call: CAPPluginCall) {
        guard #available(iOS 18.0, *) else {
            call.reject("translation needs iOS 18")
            return
        }
        guard let texts = call.getArray("texts", String.self), !texts.isEmpty else {
            call.reject("texts are required")
            return
        }
        let from = call.getString("from") ?? "en"
        let to = call.getString("to") ?? Self.deviceLanguage()

        DispatchQueue.main.async { [weak self] in
            guard let host = self?.bridge?.viewController else {
                call.reject("no view controller to host the session")
                return
            }
            let started = Date()
            TranslateHost.shared.attach(to: host)
            TranslateHost.shared.run(
                texts: texts, from: Self.language(from), to: Self.language(to)
            ) { result in
                switch result {
                case .success(let translated):
                    call.resolve([
                        "texts": translated,
                        "ms": Int(Date().timeIntervalSince(started) * 1000),
                    ])
                case .failure(let error):
                    call.reject("translation failed: \(error.localizedDescription)")
                }
            }
        }
    }
}

/**
 The parked view and the one job it is running.

 Jobs are serialised rather than queued: a second request while one is in flight replaces
 it, because the only caller is a screen asking for the descriptions it is showing, and
 the newest ask is the one worth answering.
 */
@available(iOS 18.0, *)
@MainActor
final class TranslateHost: ObservableObject {
    static let shared = TranslateHost()

    @Published fileprivate var configuration: TranslationSession.Configuration?
    private var controller: UIHostingController<TranslateSurface>?
    fileprivate var job: (texts: [String], done: (Result<[String], Error>) -> Void)?

    func attach(to parent: UIViewController) {
        guard controller == nil else { return }
        let host = UIHostingController(rootView: TranslateSurface(model: self))
        host.view.frame = .zero
        host.view.isUserInteractionEnabled = false
        host.view.isHidden = true
        parent.addChild(host)
        parent.view.addSubview(host.view)
        host.didMove(toParent: parent)
        controller = host
    }

    func run(
        texts: [String],
        from: Locale.Language,
        to: Locale.Language,
        done: @escaping (Result<[String], Error>) -> Void
    ) {
        job?.done(.failure(CancellationError()))
        job = (texts, done)
        // Re-running the task for the same pair needs the configuration to change, which
        // is what invalidate() is for; a fresh one would also drop the downloaded pack's
        // warm state.
        if var current = configuration, current.source == from, current.target == to {
            current.invalidate()
            configuration = current
        } else {
            configuration = TranslationSession.Configuration(source: from, target: to)
        }
    }

    fileprivate func perform(_ session: TranslationSession) async {
        guard let job else { return }
        self.job = nil
        do {
            // One request per string, answered together. Each carries its index home,
            // because the batch does not promise to come back in order.
            let requests = job.texts.enumerated().map {
                TranslationSession.Request(
                    sourceText: $0.element, clientIdentifier: String($0.offset)
                )
            }
            var byIndex = [String: String]()
            for try await response in session.translate(batch: requests) {
                byIndex[response.clientIdentifier ?? ""] = response.targetText
            }
            // Anything that did not come back stays as it was: an English description is
            // a worse answer than a Russian one, and a blank is worse than both.
            job.done(.success(job.texts.indices.map { byIndex[String($0)] ?? job.texts[$0] }))
        } catch {
            job.done(.failure(error))
        }
    }
}

@available(iOS 18.0, *)
private struct TranslateSurface: View {
    @ObservedObject var model: TranslateHost

    var body: some View {
        Color.clear
            .frame(width: 0, height: 0)
            .translationTask(model.configuration) { session in
                await model.perform(session)
            }
    }
}
