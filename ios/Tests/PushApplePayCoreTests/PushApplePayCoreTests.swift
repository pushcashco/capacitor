import PassKit
import XCTest

@testable import PushApplePayCore

final class PushApplePayCoreTests: XCTestCase {
    private func request(
        amount: Int = 1000,
        networks: [String] = ["visa", "masterCard"],
        capabilities: [String] = ["supports3DS"]
    ) -> SheetRequest {
        SheetRequest(
            merchantIdentifier: "merchant.com.example.app",
            amount: amount,
            currency: "USD",
            countryCode: "US",
            totalLabel: "Example Operator",
            supportedNetworks: networks,
            merchantCapabilities: capabilities)
    }

    func testCanMakePaymentsDoesNotCrash() {
        // Simulators and CI runners report either value; the assertion is that
        // the PassKit call is wired and returns.
        _ = PushApplePayCore.canMakePayments()
    }

    func testMakePKPaymentRequestMapsFields() throws {
        let pk = try request().makePKPaymentRequest()

        XCTAssertEqual(pk.merchantIdentifier, "merchant.com.example.app")
        XCTAssertEqual(pk.currencyCode, "USD")
        XCTAssertEqual(pk.countryCode, "US")
        XCTAssertEqual(pk.supportedNetworks, [.visa, .masterCard])
        XCTAssertEqual(pk.merchantCapabilities, [.capability3DS])
        XCTAssertEqual(pk.paymentSummaryItems.count, 1)
        XCTAssertEqual(pk.paymentSummaryItems[0].label, "Example Operator")
        XCTAssertEqual(pk.paymentSummaryItems[0].amount, NSDecimalNumber(string: "10"))
    }

    func testMakePKPaymentRequestConvertsCentsToDecimal() throws {
        let pk = try request(amount: 2251).makePKPaymentRequest()
        XCTAssertEqual(pk.paymentSummaryItems[0].amount, NSDecimalNumber(string: "22.51"))
    }

    func testMakePKPaymentRequestRejectsNonPositiveAmount() {
        XCTAssertThrowsError(try request(amount: 0).makePKPaymentRequest()) { error in
            XCTAssertEqual(error as? PushApplePayError, .invalidAmount(0))
        }
    }

    func testNetworkMappingIsCaseInsensitive() throws {
        XCTAssertEqual(try SheetRequest.network(from: "masterCard"), .masterCard)
        XCTAssertEqual(try SheetRequest.network(from: "VISA"), .visa)
        XCTAssertEqual(try SheetRequest.network(from: "amex"), .amex)
        XCTAssertEqual(try SheetRequest.network(from: "discover"), .discover)
    }

    func testUnknownNetworkThrows() {
        XCTAssertThrowsError(try SheetRequest.network(from: "jcb")) { error in
            XCTAssertEqual(error as? PushApplePayError, .unsupportedNetwork("jcb"))
        }
    }

    func testCapabilityMapping() throws {
        let capabilities = try SheetRequest.capabilities(from: ["supports3DS", "supportsDebit"])
        XCTAssertEqual(capabilities, [.capability3DS, .capabilityDebit])
    }

    func testUnknownCapabilityThrows() {
        XCTAssertThrowsError(try SheetRequest.capabilities(from: ["supportsMagStripe"])) { error in
            XCTAssertEqual(error as? PushApplePayError, .unsupportedCapability("supportsMagStripe"))
        }
    }

    func testCardTypeMapping() {
        XCTAssertEqual(SerializedPayment.cardType(.debit), "debit")
        XCTAssertEqual(SerializedPayment.cardType(.credit), "credit")
        XCTAssertEqual(SerializedPayment.cardType(.prepaid), "prepaid")
        XCTAssertEqual(SerializedPayment.cardType(.store), "store")
        XCTAssertEqual(SerializedPayment.cardType(.unknown), "unknown")
    }

    @MainActor
    func testCompleteSheetWithoutPaymentThrows() {
        let controller = PaymentSheetController()
        XCTAssertThrowsError(try controller.completeSheet(.approved)) { error in
            XCTAssertEqual(error as? PushApplePayError, .noPaymentInFlight)
        }
    }
}
