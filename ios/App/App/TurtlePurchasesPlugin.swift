import Capacitor
import StoreKit
import UIKit

@objc(TurtlePurchasesPlugin)
public class TurtlePurchasesPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "TurtlePurchasesPlugin"
    public let jsName = "TurtlePurchases"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "products", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "purchase", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "restore", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "finish", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "manage", returnType: CAPPluginReturnPromise)
    ]
    private let identifiers: Set<String> = ["keyoushouzhang.team.monthly", "keyoushouzhang.team.yearly"]
    private var pending: [UInt64: StoreKit.Transaction] = [:]
    private var observer: Task<Void, Never>?

    public override func load() {
        observer = Task { @MainActor [weak self] in
            for await result in StoreKit.Transaction.updates {
                guard let self = self else { return }
                guard case .verified(let transaction) = result, self.identifiers.contains(transaction.productID) else { continue }
                self.pending[transaction.id] = transaction
                self.notifyListeners("transactionUpdated", data: ["transactionId": String(transaction.id)], retainUntilConsumed: true)
            }
        }
    }
    deinit { observer?.cancel() }

    private func payload(_ result: VerificationResult<StoreKit.Transaction>, _ transaction: StoreKit.Transaction) -> [String: Any] {
        // Environment is present in the Apple-verified JWS on all supported
        // OS versions, including iOS 15 where Transaction.environment is absent.
        var environment = "Production"
        let parts = result.jwsRepresentation.split(separator: ".")
        if parts.count == 3 {
            var encoded = String(parts[1]).replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
            encoded += String(repeating: "=", count: (4 - encoded.count % 4) % 4)
            if let data = Data(base64Encoded: encoded), let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
                environment = json["environment"] as? String ?? environment
            }
        }
        return ["transactionId": String(transaction.id), "productId": transaction.productID,
                "appAccountToken": transaction.appAccountToken?.uuidString.lowercased() ?? "", "environment": environment]
    }

    @objc func products(_ call: CAPPluginCall) {
        call.resolve(["products": []])
    }

    @objc func purchase(_ call: CAPPluginCall) {
        call.reject("团队空间已免费开放，会员购买已停止")
    }

    @objc func restore(_ call: CAPPluginCall) {
        Task { @MainActor in
            do {
                if call.getBool("sync") == true { try await AppStore.sync() }
                var results: [UInt64: [String: Any]] = [:]
                for await verification in StoreKit.Transaction.currentEntitlements {
                    if case .verified(let transaction) = verification, identifiers.contains(transaction.productID) {
                        pending[transaction.id] = transaction
                        results[transaction.id] = payload(verification, transaction)
                    }
                }
                for await verification in StoreKit.Transaction.unfinished {
                    if case .verified(let transaction) = verification, identifiers.contains(transaction.productID) {
                        pending[transaction.id] = transaction
                        results[transaction.id] = payload(verification, transaction)
                    }
                }
                call.resolve(["transactions": Array(results.values)])
            } catch { call.reject("恢复购买失败，请稍后重试", nil, error) }
        }
    }

    @objc func finish(_ call: CAPPluginCall) {
        Task { @MainActor in
            guard let value = call.getString("transactionId"), let id = UInt64(value), let transaction = pending[id] else {
                call.resolve(["finished": false]); return
            }
            await transaction.finish()
            pending.removeValue(forKey: id)
            call.resolve(["finished": true])
        }
    }

    @objc func manage(_ call: CAPPluginCall) {
        Task { @MainActor in
            guard let scene = UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene }).first(where: { $0.activationState == .foregroundActive }) else {
                call.reject("当前窗口不可用"); return
            }
            do { try await AppStore.showManageSubscriptions(in: scene); call.resolve(["opened": true]) }
            catch { call.reject("暂时无法打开订阅管理", nil, error) }
        }
    }
}
