import Capacitor
import UIKit
import WebKit

// UIKit owns touch arbitration. A DOM pointer listener alone cannot preempt
// WKWebView's decelerating UIScrollView, which used to consume the first swipe.
@objc(TurtleEdgeBackPlugin)
public class TurtleEdgeBackPlugin: CAPPlugin, CAPBridgedPlugin, UIGestureRecognizerDelegate {
    public let identifier = "TurtleEdgeBackPlugin"
    public let jsName = "TurtleEdgeBack"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "configure", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "cancel", returnType: CAPPluginReturnPromise)
    ]

    private var edgePan: UIScreenEdgePanGestureRecognizer?
    private var enabled = false
    private var generation = 0
    private var excludedRegions: [CGRect] = []
    private var sequence = 0
    private var active = false
    private var origin = CGPoint.zero
    private var priorScrollEnabled: Bool?

    override public func load() {
        DispatchQueue.main.async { [weak self] in self?.installRecognizer() }
        NotificationCenter.default.addObserver(self, selector: #selector(interrupt), name: UIApplication.willResignActiveNotification, object: nil)
    }

    private func installRecognizer() {
        guard edgePan == nil, let webView = bridge?.webView else { return }
        let recognizer = UIScreenEdgePanGestureRecognizer(target: self, action: #selector(handlePan(_:)))
        recognizer.edges = .left
        recognizer.maximumNumberOfTouches = 1
        recognizer.delegate = self
        recognizer.cancelsTouchesInView = true
        recognizer.isEnabled = false
        webView.addGestureRecognizer(recognizer)
        // Outside the edge UIKit fails this recognizer immediately; ordinary
        // vertical scrolling remains native. Inside it, back gets first refusal.
        webView.scrollView.panGestureRecognizer.require(toFail: recognizer)
        edgePan = recognizer
    }

    @objc func configure(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { call.reject("Edge back unavailable"); return }
            self.installRecognizer()
            guard let recognizer = self.edgePan else { call.reject("WebView unavailable"); return }
            let nextGeneration = call.getInt("generation") ?? 0
            // Reject an obsolete bridge call after a newer route configuration.
            if nextGeneration < self.generation { call.resolve(["enabled": self.enabled]); return }
            let nextEnabled = call.getBool("enabled") ?? false
            if self.active && (!nextEnabled || nextGeneration != self.generation) { self.interrupt() }
            self.generation = nextGeneration
            self.enabled = nextEnabled
            self.excludedRegions = (call.getArray("excludedRegions", JSObject.self) ?? []).compactMap { item in
                guard let x = item["x"] as? Double, let y = item["y"] as? Double,
                      let width = item["width"] as? Double, let height = item["height"] as? Double,
                      [x, y, width, height].allSatisfy({ $0.isFinite }), width > 0, height > 0 else { return nil }
                return CGRect(x: x, y: y, width: width, height: height)
            }
            recognizer.isEnabled = nextEnabled
            call.resolve(["enabled": nextEnabled, "generation": self.generation])
        }
    }

    @objc func cancel(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { call.resolve(); return }
            if call.getInt("generation") == self.generation && call.getInt("sequence") == self.sequence { self.interrupt() }
            call.resolve()
        }
    }

    @objc private func interrupt() {
        if active, let recognizer = edgePan { emit("cancel", recognizer); active = false }
        restoreScrolling()
        edgePan?.isEnabled = false
        edgePan?.isEnabled = enabled
    }

    private func restoreScrolling() {
        if let prior = priorScrollEnabled { bridge?.webView?.scrollView.isScrollEnabled = prior }
        priorScrollEnabled = nil
    }

    public func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer, shouldReceive touch: UITouch) -> Bool {
        guard enabled, let webView = bridge?.webView, webView.bounds.width > 0, webView.bounds.height > 0,
              bridge?.viewController?.presentedViewController == nil,
              abs(webView.scrollView.zoomScale - 1) < 0.05 else { return false }
        let point = touch.location(in: webView)
        guard point.x >= 0, point.x <= 24 else { return false }
        let normalized = CGPoint(x: point.x / webView.bounds.width, y: point.y / webView.bounds.height)
        guard !excludedRegions.contains(where: { $0.contains(normalized) }) else { return false }
        // Freeze momentum on this touch, before waiting for pan recognition.
        // No additional stop tap is required, even while content is decelerating.
        let scrollView = webView.scrollView
        scrollView.setContentOffset(scrollView.contentOffset, animated: false)
        return true
    }

    public func gestureRecognizerShouldBegin(_ gestureRecognizer: UIGestureRecognizer) -> Bool {
        guard enabled, let pan = gestureRecognizer as? UIScreenEdgePanGestureRecognizer,
              let webView = bridge?.webView else { return false }
        let translation = pan.translation(in: webView)
        let velocity = pan.velocity(in: webView)
        let direction = abs(translation.x) + abs(translation.y) > 0 ? translation : velocity
        return direction.x > 0 && abs(direction.x) > abs(direction.y)
    }

    public func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer, shouldBeRequiredToFailBy otherGestureRecognizer: UIGestureRecognizer) -> Bool {
        guard gestureRecognizer === edgePan, let webView = bridge?.webView,
              let otherView = otherGestureRecognizer.view else { return false }
        return otherGestureRecognizer is UIPanGestureRecognizer && otherView.isDescendant(of: webView)
    }

    @objc private func handlePan(_ recognizer: UIScreenEdgePanGestureRecognizer) {
        guard let webView = bridge?.webView else { restoreScrolling(); return }
        switch recognizer.state {
        case .began:
            let point = recognizer.location(in: webView), translation = recognizer.translation(in: webView)
            origin = CGPoint(x: point.x - translation.x, y: point.y - translation.y)
            sequence += 1
            active = true
            let scrollView = webView.scrollView
            scrollView.setContentOffset(scrollView.contentOffset, animated: false)
            priorScrollEnabled = scrollView.isScrollEnabled
            scrollView.isScrollEnabled = false
            emit("begin", recognizer)
        case .changed:
            if active { emit("move", recognizer) }
        case .ended:
            if active { emit("end", recognizer); active = false }
            restoreScrolling()
        case .cancelled, .failed:
            if active { emit("cancel", recognizer); active = false }
            restoreScrolling()
        default: break
        }
    }

    private func emit(_ phase: String, _ recognizer: UIScreenEdgePanGestureRecognizer) {
        guard let webView = bridge?.webView else { return }
        let translation = recognizer.translation(in: webView), velocity = recognizer.velocity(in: webView)
        let detail: [String: Any] = ["phase": phase, "generation": generation, "sequence": sequence,
            "startX": origin.x, "startY": origin.y, "x": origin.x + translation.x, "y": origin.y + translation.y,
            "velocityX": velocity.x, "width": webView.bounds.width, "height": webView.bounds.height]
        guard let bytes = try? JSONSerialization.data(withJSONObject: detail), let json = String(data: bytes, encoding: .utf8) else { return }
        webView.evaluateJavaScript("window.dispatchEvent(new CustomEvent('turtle-native-edge-back', {detail: \(json)}));", completionHandler: nil)
    }

    deinit { NotificationCenter.default.removeObserver(self) }
}
