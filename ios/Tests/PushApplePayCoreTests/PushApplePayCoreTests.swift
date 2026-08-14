import XCTest

@testable import PushApplePayCore

final class PushApplePayCoreTests: XCTestCase {
    func testCanMakePaymentsDoesNotCrash() {
        // Simulators and CI runners report either value; the assertion is that
        // the PassKit call is wired and returns.
        _ = PushApplePayCore.canMakePayments()
    }
}
