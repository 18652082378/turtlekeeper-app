import Capacitor
import StoreKit
import UIKit

@objc(TurtleAppReviewPlugin)
public class TurtleAppReviewPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "TurtleAppReviewPlugin"
    public let jsName = "TurtleAppReview"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "requestReview", returnType: CAPPluginReturnPromise)
    ]

    @objc func requestReview(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            if #available(iOS 14.0, *) {
                guard let scene = UIApplication.shared.connectedScenes
                    .compactMap({ $0 as? UIWindowScene })
                    .first(where: { $0.activationState == .foregroundActive }) else {
                    call.resolve(["requested": false])
                    return
                }
                SKStoreReviewController.requestReview(in: scene)
            } else {
                SKStoreReviewController.requestReview()
            }
            call.resolve(["requested": true])
        }
    }
}
