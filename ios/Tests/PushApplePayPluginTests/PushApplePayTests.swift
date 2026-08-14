import XCTest

@testable import PushApplePayPlugin

class PushApplePayTests: XCTestCase {
    func testPluginExposesTheCoreSurface() {
        let plugin = PushApplePayPlugin()

        XCTAssertEqual(plugin.jsName, "PushApplePay")
        XCTAssertEqual(
            plugin.pluginMethods.map(\.name),
            ["canMakePayments", "presentSheet", "completeSheet"])
    }
}
