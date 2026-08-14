import Foundation
import PassKit

/// The authorization outcome the operator's backend reached, driving the
/// sheet's final animation.
public enum SheetStatus: String, Sendable {
    case approved
    case declined
}

/// Errors surfaced by the core. `presentationFailed` is the one operators hit
/// during setup: iOS refuses to present when the merchant identifier is not in
/// the app's Apple Pay entitlement.
public enum PushApplePayError: Error, Equatable {
    case cannotMakePayments
    case unsupportedNetwork(String)
    case unsupportedCapability(String)
    case invalidAmount(Int)
    case presentationFailed
    case sheetAlreadyPresented
    case sheetDismissed
    case noPaymentInFlight

    public var code: String {
        switch self {
        case .cannotMakePayments: return "CANNOT_MAKE_PAYMENTS"
        case .unsupportedNetwork: return "UNSUPPORTED_NETWORK"
        case .unsupportedCapability: return "UNSUPPORTED_CAPABILITY"
        case .invalidAmount: return "INVALID_AMOUNT"
        case .presentationFailed: return "PRESENTATION_FAILED"
        case .sheetAlreadyPresented: return "SHEET_ALREADY_PRESENTED"
        case .sheetDismissed: return "SHEET_DISMISSED"
        case .noPaymentInFlight: return "NO_PAYMENT_IN_FLIGHT"
        }
    }

    public var message: String {
        switch self {
        case .cannotMakePayments:
            return "This device cannot make Apple Pay payments."
        case .unsupportedNetwork(let network):
            return "Unsupported payment network: \(network)."
        case .unsupportedCapability(let capability):
            return "Unsupported merchant capability: \(capability)."
        case .invalidAmount(let amount):
            return "Amount must be a positive number of cents, got \(amount)."
        case .presentationFailed:
            return "Could not present the Apple Pay sheet. The most common cause is a merchant identifier "
                + "that is not in the app's Apple Pay entitlement."
        case .sheetAlreadyPresented:
            return "An Apple Pay sheet is already presented."
        case .sheetDismissed:
            return "The user dismissed the Apple Pay sheet without authorizing."
        case .noPaymentInFlight:
            return "completeSheet was called without an authorized payment in flight."
        }
    }
}

/// Everything needed to present the sheet: operator-passed fields
/// (merchantIdentifier, amount, currency) merged with the config-served sheet
/// fields.
public struct SheetRequest: Sendable {
    public let merchantIdentifier: String
    /// Amount in cents.
    public let amount: Int
    public let currency: String
    public let countryCode: String
    public let totalLabel: String
    public let supportedNetworks: [String]
    public let merchantCapabilities: [String]

    public init(
        merchantIdentifier: String,
        amount: Int,
        currency: String,
        countryCode: String,
        totalLabel: String,
        supportedNetworks: [String],
        merchantCapabilities: [String]
    ) {
        self.merchantIdentifier = merchantIdentifier
        self.amount = amount
        self.currency = currency
        self.countryCode = countryCode
        self.totalLabel = totalLabel
        self.supportedNetworks = supportedNetworks
        self.merchantCapabilities = merchantCapabilities
    }

    /// Maps the request onto PassKit's payment request.
    func makePKPaymentRequest() throws -> PKPaymentRequest {
        guard amount > 0 else {
            throw PushApplePayError.invalidAmount(amount)
        }

        let request = PKPaymentRequest()
        request.merchantIdentifier = merchantIdentifier
        request.countryCode = countryCode
        request.currencyCode = currency
        request.supportedNetworks = try supportedNetworks.map(Self.network(from:))
        request.merchantCapabilities = try Self.capabilities(from: merchantCapabilities)
        request.paymentSummaryItems = [
            PKPaymentSummaryItem(
                label: totalLabel,
                amount: NSDecimalNumber(mantissa: UInt64(amount), exponent: -2, isNegative: false))
        ]
        return request
    }

    static func network(from name: String) throws -> PKPaymentNetwork {
        switch name.lowercased() {
        case "visa": return .visa
        case "mastercard": return .masterCard
        case "amex": return .amex
        case "discover": return .discover
        default: throw PushApplePayError.unsupportedNetwork(name)
        }
    }

    static func capabilities(from names: [String]) throws -> PKMerchantCapability {
        var capabilities: PKMerchantCapability = []
        for name in names {
            switch name.lowercased() {
            case "supports3ds": capabilities.insert(.capability3DS)
            case "supportscredit": capabilities.insert(.capabilityCredit)
            case "supportsdebit": capabilities.insert(.capabilityDebit)
            case "supportsemv": capabilities.insert(.capabilityEMV)
            default: throw PushApplePayError.unsupportedCapability(name)
            }
        }
        return capabilities
    }
}

/// The authorized payment, serialized for the JavaScript layer. paymentData is
/// the PKPaymentToken's payment data — still encrypted to the merchant's
/// payment-processing certificate; the core never sees card data.
public struct SerializedPayment: Sendable {
    /// Base64 of PKPaymentToken.paymentData.
    public let paymentData: String
    /// e.g. "Visa 1234" — carries the physical card's last 4.
    public let displayName: String?
    public let network: String?
    /// debit | credit | prepaid | store | unknown
    public let type: String
    public let transactionIdentifier: String

    init(payment: PKPayment) {
        let token = payment.token
        self.paymentData = token.paymentData.base64EncodedString()
        self.displayName = token.paymentMethod.displayName
        self.network = token.paymentMethod.network?.rawValue
        self.type = Self.cardType(token.paymentMethod.type)
        self.transactionIdentifier = token.transactionIdentifier
    }

    static func cardType(_ type: PKPaymentMethodType) -> String {
        switch type {
        case .debit: return "debit"
        case .credit: return "credit"
        case .prepaid: return "prepaid"
        case .store: return "store"
        case .unknown: return "unknown"
        @unknown default: return "unknown"
        }
    }
}
