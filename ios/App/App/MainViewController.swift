import Capacitor
import UIKit

/**
 * Exists for one line: registering the app's own plugin with the bridge.
 *
 * Plugins that ship as packages are discovered automatically; one that lives inside the
 * app is not, and the only sign is a rejected call at runtime saying the plugin "is not
 * implemented on ios" — the Swift compiles, the app builds, and nothing works.
 *
 * Registration happens in `viewDidLoad`, after `super`, because that is when the bridge
 * exists. An earlier attempt used `capacitorDidLoad()`, which reads like the obvious
 * hook and does not exist in this version of Capacitor — the override simply never ran,
 * and the failure looked identical to not having written the plugin at all. Checking the
 * shipped header for the symbol is what settled it.
 */
class MainViewController: CAPBridgeViewController {
    override func viewDidLoad() {
        super.viewDidLoad()
        bridge?.registerPluginInstance(WidgetBridgePlugin())
        bridge?.registerPluginInstance(AIBridgePlugin())
    }
}
