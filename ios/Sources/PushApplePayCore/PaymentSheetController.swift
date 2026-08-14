import Foundation
import PassKit

/// Presents the Apple Pay sheet and holds the PassKit authorization completion
/// open until the caller reports the real authorization outcome, so the
/// sheet's final animation tells the truth.
///
/// Lifecycle: `presentSheet` returns the serialized payment as soon as the
/// user authorizes; the sheet stays up. The caller runs its authorization and
/// then calls `completeSheet`, which resolves the held completion and lets the
/// sheet animate out.
@MainActor
public final class PaymentSheetController: NSObject {
    private var controller: PKPaymentAuthorizationController?
    private var authorizationContinuation: CheckedContinuation<SerializedPayment, Error>?
    private var authorizationHandler: ((PKPaymentAuthorizationResult) -> Void)?

    public override init() {
        super.init()
    }

    public func presentSheet(_ request: SheetRequest) async throws -> SerializedPayment {
        guard controller == nil else {
            throw PushApplePayError.sheetAlreadyPresented
        }
        guard PushApplePayCore.canMakePayments() else {
            throw PushApplePayError.cannotMakePayments
        }

        let paymentRequest = try request.makePKPaymentRequest()
        let controller = PKPaymentAuthorizationController(paymentRequest: paymentRequest)
        controller.delegate = self
        self.controller = controller

        guard await controller.present() else {
            self.controller = nil
            throw PushApplePayError.presentationFailed
        }

        return try await withCheckedThrowingContinuation { continuation in
            authorizationContinuation = continuation
        }
    }

    public func completeSheet(_ status: SheetStatus) throws {
        guard let handler = authorizationHandler else {
            throw PushApplePayError.noPaymentInFlight
        }
        authorizationHandler = nil
        handler(PKPaymentAuthorizationResult(status: status == .approved ? .success : .failure, errors: nil))
    }

    private func handleAuthorization(_ payment: PKPayment, handler: @escaping (PKPaymentAuthorizationResult) -> Void) {
        guard let continuation = authorizationContinuation else {
            // A second authorization for the same sheet (e.g. a retry after a
            // reported failure) has no caller waiting; fail it so the sheet
            // closes rather than hanging.
            handler(PKPaymentAuthorizationResult(status: .failure, errors: nil))
            return
        }
        authorizationContinuation = nil
        authorizationHandler = handler
        continuation.resume(returning: SerializedPayment(payment: payment))
    }

    private func handleFinish() async {
        let dismissed = controller
        controller = nil

        // Finishing without an authorization means the user dismissed the
        // sheet.
        if let continuation = authorizationContinuation {
            authorizationContinuation = nil
            continuation.resume(throwing: PushApplePayError.sheetDismissed)
        }
        // Finishing with a held handler means PassKit tore the sheet down
        // before completeSheet was called; release it.
        authorizationHandler = nil

        await dismissed?.dismiss()
    }
}

extension PaymentSheetController: PKPaymentAuthorizationControllerDelegate {
    public nonisolated func paymentAuthorizationController(
        _ controller: PKPaymentAuthorizationController,
        didAuthorizePayment payment: PKPayment,
        handler: @escaping (PKPaymentAuthorizationResult) -> Void
    ) {
        Task { @MainActor in
            self.handleAuthorization(payment, handler: handler)
        }
    }

    public nonisolated func paymentAuthorizationControllerDidFinish(_ controller: PKPaymentAuthorizationController) {
        Task { @MainActor in
            await self.handleFinish()
        }
    }
}
