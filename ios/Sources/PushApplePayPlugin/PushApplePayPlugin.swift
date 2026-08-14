import Capacitor
import Foundation
import PushApplePayCore

/// The Capacitor bridge over PushApplePayCore. Marshaling only: every method
/// converts between the JS call and the core's types; all flow logic lives in
/// the TypeScript layer.
@objc(PushApplePayPlugin)
public class PushApplePayPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "PushApplePayPlugin"
    public let jsName = "PushApplePay"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "canMakePayments", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "presentSheet", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "completeSheet", returnType: CAPPluginReturnPromise),
    ]

    @MainActor private lazy var core = PaymentSheetController()

    @objc func canMakePayments(_ call: CAPPluginCall) {
        call.resolve(["available": PushApplePayCore.canMakePayments()])
    }

    @objc func presentSheet(_ call: CAPPluginCall) {
        guard let merchantIdentifier = call.getString("merchantIdentifier"),
            let amount = call.getInt("amount"),
            let currency = call.getString("currency"),
            let countryCode = call.getString("countryCode"),
            let totalLabel = call.getString("totalLabel"),
            let supportedNetworks = call.getArray("supportedNetworks", String.self),
            let merchantCapabilities = call.getArray("merchantCapabilities", String.self)
        else {
            call.reject("presentSheet requires merchantIdentifier, amount, currency, countryCode, totalLabel, "
                + "supportedNetworks, and merchantCapabilities", "INVALID_OPTIONS")
            return
        }

        let request = SheetRequest(
            merchantIdentifier: merchantIdentifier,
            amount: amount,
            currency: currency,
            countryCode: countryCode,
            totalLabel: totalLabel,
            supportedNetworks: supportedNetworks,
            merchantCapabilities: merchantCapabilities)

        Task { @MainActor in
            do {
                let payment = try await core.presentSheet(request)
                var result: PluginCallResultData = [
                    "paymentData": payment.paymentData,
                    "type": payment.type,
                    "transactionIdentifier": payment.transactionIdentifier,
                ]
                if let displayName = payment.displayName {
                    result["displayName"] = displayName
                }
                if let network = payment.network {
                    result["network"] = network
                }
                call.resolve(result)
            } catch let error as PushApplePayError {
                call.reject(error.message, error.code)
            } catch {
                call.reject(error.localizedDescription)
            }
        }
    }

    @objc func completeSheet(_ call: CAPPluginCall) {
        guard let status = call.getString("status").flatMap(SheetStatus.init(rawValue:)) else {
            call.reject("completeSheet requires status: \"approved\" or \"declined\"", "INVALID_OPTIONS")
            return
        }

        Task { @MainActor in
            do {
                try core.completeSheet(status)
                call.resolve()
            } catch let error as PushApplePayError {
                call.reject(error.message, error.code)
            } catch {
                call.reject(error.localizedDescription)
            }
        }
    }
}
