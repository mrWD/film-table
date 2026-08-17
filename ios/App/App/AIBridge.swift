import Capacitor
import Foundation
#if canImport(FoundationModels)
import FoundationModels
#endif

/**
 * Access to the on-device language model.
 *
 * The model lives behind a Swift framework the web view cannot reach, so this is the
 * same bridge shape as `WidgetBridge`: a thin plugin that the React side calls, with all
 * of the platform's vocabulary kept on this side of the wall.
 *
 * Three things this deliberately does not do:
 *
 * - **No network.** `FoundationModels` runs on the device. Nothing from the library is
 *   sent anywhere, which is the only reason a language model belongs in an app whose
 *   whole premise is that the library never leaves the phone.
 * - **No facts.** Callers pass the text to work on. The model is asked to classify,
 *   extract or rephrase what it was given — never to recall a plot, a date or an author,
 *   because a three-billion-parameter model will happily invent all three.
 * - **No silent degradation.** `availability` reports exactly why the model cannot be
 *   used, so the app can hide a feature rather than offer one that never answers.
 */
@objc(AIBridgePlugin)
public class AIBridgePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "AIBridgePlugin"
    public let jsName = "AIBridge"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "availability", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "generate", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "generateStructured", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "warmUp", returnType: CAPPluginReturnPromise),
    ]

    /// Kept alive between calls: the first request of a session pays for loading the
    /// model — measured at 6.8 s against 0.6–0.9 s once warm — so a session created per
    /// call would make every feature feel broken the first time it is used.
    private var session: Any?

    #if canImport(FoundationModels)
    @available(iOS 26.0, *)
    private func liveSession() -> LanguageModelSession {
        if let existing = session as? LanguageModelSession { return existing }
        let created = LanguageModelSession()
        session = created
        return created
    }
    #endif

    /// `iOS 26` is where `FoundationModels` starts; the apps still deploy to 15, so every
    /// entry point answers honestly on older systems instead of failing to link.
    @objc func availability(_ call: CAPPluginCall) {
        #if canImport(FoundationModels)
        if #available(iOS 26.0, *) {
            switch SystemLanguageModel.default.availability {
            case .available:
                call.resolve(["available": true])
            case .unavailable(let reason):
                call.resolve(["available": false, "reason": Self.describe(reason)])
            }
            return
        }
        #endif
        call.resolve(["available": false, "reason": "osTooOld"])
    }

    @objc func generate(_ call: CAPPluginCall) {
        guard let prompt = call.getString("prompt") else {
            call.reject("prompt is required")
            return
        }
        let instructions = call.getString("instructions")

        #if canImport(FoundationModels)
        if #available(iOS 26.0, *) {
            Task {
                let started = Date()
                do {
                    let session = LanguageModelSession(instructions: instructions)
                    let response = try await session.respond(to: prompt)
                    call.resolve([
                        "text": response.content,
                        // Reported so the caller can decide whether a feature is worth
                        // offering on this device rather than guessing at its speed.
                        "ms": Int(Date().timeIntervalSince(started) * 1000),
                    ])
                } catch {
                    call.reject("generation failed: \(error.localizedDescription)")
                }
            }
            return
        }
        #endif
        call.reject("on-device model unavailable on this system")
    }

    /// Loads the model without asking it anything, so the first real request is fast.
    @objc func warmUp(_ call: CAPPluginCall) {
        #if canImport(FoundationModels)
        if #available(iOS 26.0, *), SystemLanguageModel.default.isAvailable {
            Task {
                _ = try? await liveSession().respond(to: "ok")
                call.resolve()
            }
            return
        }
        #endif
        call.resolve()
    }

    /**
     * Generation constrained to a schema the caller describes.
     *
     * This exists because free-form prompting measurably invents values: asked for
     * "something short to watch tonight" the model answered `genre: "comedy"` — a genre
     * nobody mentioned — and a status that is not one of this app's four. A search built
     * on that would quietly filter by things the person never asked for.
     *
     * The schema is passed from JS as `{ name, properties: [{ name, optional, anyOf | type }] }`,
     * so the enums are the app's own vocabulary rather than whatever the model imagines.
     */
    @objc func generateStructured(_ call: CAPPluginCall) {
        guard let prompt = call.getString("prompt"),
              let schemaSpec = call.getObject("schema") else {
            call.reject("prompt and schema are required")
            return
        }
        let instructions = call.getString("instructions")

        #if canImport(FoundationModels)
        if #available(iOS 26.0, *) {
            Task {
                let started = Date()
                do {
                    let root = try Self.buildSchema(from: schemaSpec)
                    let schema = try GenerationSchema(root: root, dependencies: [])
                    let session = instructions == nil
                        ? liveSession()
                        : LanguageModelSession(instructions: instructions)
                    let response = try await session.respond(to: prompt, schema: schema)
                    call.resolve([
                        "json": response.content.jsonString,
                        "ms": Int(Date().timeIntervalSince(started) * 1000),
                    ])
                } catch {
                    call.reject("generation failed: \(error.localizedDescription)")
                }
            }
            return
        }
        #endif
        call.reject("on-device model unavailable on this system")
    }

    #if canImport(FoundationModels)
    @available(iOS 26.0, *)
    private static func buildSchema(from spec: JSObject) throws -> DynamicGenerationSchema {
        let name = spec["name"] as? String ?? "Result"
        let rawProperties = spec["properties"] as? [JSObject] ?? []
        let properties: [DynamicGenerationSchema.Property] = rawProperties.compactMap { item in
            guard let field = item["name"] as? String else { return nil }
            let optional = item["optional"] as? Bool ?? false
            let describe = item["description"] as? String
            var schema: DynamicGenerationSchema
            if let choices = item["anyOf"] as? [String], !choices.isEmpty {
                // The whole point: the model picks from the app's vocabulary or nothing.
                schema = DynamicGenerationSchema(name: "\(name).\(field)", anyOf: choices)
                // Several of them when the caller wants a short list. Kept small: asked
                // for more, the model fills the space with plausible padding.
                if item["array"] as? Bool == true {
                    schema = DynamicGenerationSchema(
                        arrayOf: schema,
                        minimumElements: 0,
                        maximumElements: item["max"] as? Int ?? 3
                    )
                }
            } else {
                switch item["type"] as? String {
                case "number": schema = DynamicGenerationSchema(type: Int.self)
                case "boolean": schema = DynamicGenerationSchema(type: Bool.self)
                default: schema = DynamicGenerationSchema(type: String.self)
                }
            }
            return DynamicGenerationSchema.Property(
                name: field, description: describe, schema: schema, isOptional: optional
            )
        }
        return DynamicGenerationSchema(name: name, properties: properties)
    }

    @available(iOS 26.0, *)
    private static func describe(
        _ reason: SystemLanguageModel.Availability.UnavailableReason
    ) -> String {
        switch reason {
        case .deviceNotEligible: return "deviceNotEligible"
        case .appleIntelligenceNotEnabled: return "appleIntelligenceNotEnabled"
        case .modelNotReady: return "modelNotReady"
        @unknown default: return "unknown"
        }
    }
    #endif
}
