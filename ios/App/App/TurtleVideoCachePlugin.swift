import Foundation
import Capacitor
import CryptoKit

@objc(TurtleVideoCachePlugin)
public class TurtleVideoCachePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "TurtleVideoCachePlugin"
    public let jsName = "TurtleVideoCache"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "resolve", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "prefetch", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stats", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clear", returnType: CAPPluginReturnPromise)
    ]

    private let byteLimit: Int64 = 500 * 1024 * 1024
    private let queue = DispatchQueue(label: "cn.turtleworld.video-cache")


    private var folder: URL {
        let base = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
        let result = base.appendingPathComponent("TurtleVideoCache", isDirectory: true)
        try? FileManager.default.createDirectory(at: result, withIntermediateDirectories: true)
        return result
    }

    private func key(_ source: String) -> String {
        SHA256.hash(data: Data(source.utf8)).map { String(format: "%02x", $0) }.joined()
    }

    private func fileURL(_ source: String) -> URL {
        let ext = URL(string: source)?.pathExtension.lowercased()
        return folder.appendingPathComponent(key(source)).appendingPathExtension(ext?.isEmpty == false ? ext! : "mp4")
    }

    @objc public func resolve(_ call: CAPPluginCall) {
        guard let source = call.getString("url"), let remote = URL(string: source), ["http", "https"].contains(remote.scheme?.lowercased() ?? "") else {
            call.resolve(["url": call.getString("url") ?? "", "cached": false]); return
        }
        let local = fileURL(source)
        if FileManager.default.fileExists(atPath: local.path) {
            try? FileManager.default.setAttributes([.modificationDate: Date()], ofItemAtPath: local.path)
            call.resolve(["url": local.absoluteString, "cached": true]); return
        }
        // A cache miss returns the remote URL only. Do not download a second
        // complete copy while WKWebView is already streaming this video.
        call.resolve(["url": source, "cached": false])
    }

    @objc public func prefetch(_ call: CAPPluginCall) {
        // No speculative full-file downloads, including on Wi-Fi.
        call.resolve()
    }

    @objc public func stats(_ call: CAPPluginCall) {
        queue.async {
            call.resolve(["bytes": self.cacheBytes(), "limitBytes": self.byteLimit])
        }
    }

    @objc public func clear(_ call: CAPPluginCall) {
        queue.async {
            try? FileManager.default.removeItem(at: self.folder)
            URLCache.shared.removeAllCachedResponses()
            call.resolve(["bytes": 0, "limitBytes": self.byteLimit])
        }
    }

    private func cachedFiles() -> [(URL, Int64, Date)] {
        let keys: Set<URLResourceKey> = [.fileSizeKey, .contentModificationDateKey, .isRegularFileKey]
        return (try? FileManager.default.contentsOfDirectory(at: folder, includingPropertiesForKeys: Array(keys)))?.compactMap { url in
            guard let values = try? url.resourceValues(forKeys: keys), values.isRegularFile == true else { return nil }
            return (url, Int64(values.fileSize ?? 0), values.contentModificationDate ?? .distantPast)
        } ?? []
    }

    private func cacheBytes() -> Int64 { cachedFiles().reduce(0) { $0 + $1.1 } }
    private func trim() {
        var files = cachedFiles().sorted { $0.2 < $1.2 }
        var total = files.reduce(0) { $0 + $1.1 }
        while total > byteLimit, let oldest = files.first {
            try? FileManager.default.removeItem(at: oldest.0)
            total -= oldest.1
            files.removeFirst()
        }
    }
}
