import Foundation
import PassKit

/// PushApplePayCore presents the Apple Pay sheet and serializes its result.
/// It is framework-free: PassKit only, no networking, no Capacitor. All flow
/// logic (config fetch, tokenization, token mint) lives in the TypeScript
/// layer of the wrapping plugin.
public enum PushApplePayCore {
    /// Reports whether the device supports Apple Pay payments.
    public static func canMakePayments() -> Bool {
        PKPaymentAuthorizationController.canMakePayments()
    }
}
