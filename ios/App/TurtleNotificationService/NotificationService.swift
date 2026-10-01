import Foundation
import UserNotifications
import ImageIO
import UniformTypeIdentifiers

// This runs before iOS presents a remote alert, including when the app is closed.
// The original title/body always survive a missing image, timeout or bad response.
final class NotificationService: UNNotificationServiceExtension, URLSessionDownloadDelegate {
    private let maximumBytes: Int64 = 10 * 1024 * 1024
    private let completionLock = NSLock()
    private var contentHandler: ((UNNotificationContent) -> Void)?
    private var bestContent: UNMutableNotificationContent?
    private var session: URLSession?

    override func didReceive(_ request: UNNotificationRequest, withContentHandler contentHandler: @escaping (UNNotificationContent) -> Void) {
        guard let content = request.content.mutableCopy() as? UNMutableNotificationContent else {
            contentHandler(request.content)
            return
        }
        self.contentHandler = contentHandler
        bestContent = content
        guard content.userInfo["route"] as? String == "communityDaily",
              let address = content.userInfo["attachmentUrl"] as? String,
              let url = approvedURL(address) else {
            finish()
            return
        }
        let configuration = URLSessionConfiguration.ephemeral
        configuration.timeoutIntervalForRequest = 12
        configuration.timeoutIntervalForResource = 20
        configuration.waitsForConnectivity = false
        configuration.urlCache = nil
        configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
        let queue = OperationQueue()
        queue.maxConcurrentOperationCount = 1
        let session = URLSession(configuration: configuration, delegate: self, delegateQueue: queue)
        self.session = session
        session.downloadTask(with: url).resume()
    }

    private func approvedURL(_ address: String) -> URL? {
        guard address.utf8.count <= 800,
              !address.unicodeScalars.contains(where: { $0.value <= 32 || $0.value == 127 }),
              !address.contains("\\"),
              let components = URLComponents(string: address),
              components.scheme?.lowercased() == "https",
              components.user == nil, components.password == nil,
              components.port == nil || components.port == 443,
              let host = components.host?.lowercased(),
              let hosts = Bundle.main.object(forInfoDictionaryKey: "TurtleAttachmentHosts") as? [String],
              hosts.contains(host),
              let decodedPath = components.percentEncodedPath.removingPercentEncoding,
              !decodedPath.contains("\\"),
              !decodedPath.split(separator: "/").contains(where: { $0 == "." || $0 == ".." }) else { return nil }
        return components.url
    }

    func urlSession(_ session: URLSession, task: URLSessionTask,
                    willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest,
                    completionHandler: @escaping (URLRequest?) -> Void) {
        guard let address = request.url?.absoluteString, approvedURL(address) != nil else {
            completionHandler(nil)
            finish()
            return
        }
        completionHandler(request)
    }

    func urlSession(_ session: URLSession, downloadTask: URLSessionDownloadTask,
                    didWriteData bytesWritten: Int64, totalBytesWritten: Int64,
                    totalBytesExpectedToWrite: Int64) {
        if totalBytesWritten > maximumBytes || totalBytesExpectedToWrite > maximumBytes {
            downloadTask.cancel()
            finish()
        }
    }

    func urlSession(_ session: URLSession, downloadTask: URLSessionDownloadTask, didFinishDownloadingTo location: URL) {
        guard let response = downloadTask.response as? HTTPURLResponse, response.statusCode == 200,
              let address = response.url?.absoluteString, approvedURL(address) != nil,
              response.mimeType?.lowercased().hasPrefix("image/") == true,
              let values = try? location.resourceValues(forKeys: [.fileSizeKey]),
              let size = values.fileSize, size > 0, Int64(size) <= maximumBytes,
              let source = CGImageSourceCreateWithURL(location as CFURL, [kCGImageSourceShouldCache: false] as CFDictionary),
              let image = CGImageSourceCreateThumbnailAtIndex(source, 0, [
                kCGImageSourceCreateThumbnailFromImageAlways: true,
                kCGImageSourceCreateThumbnailWithTransform: true,
                kCGImageSourceThumbnailMaxPixelSize: 1280,
                kCGImageSourceShouldCacheImmediately: false
              ] as CFDictionary) else {
            finish()
            return
        }
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        let cover = directory.appendingPathComponent("recommendation.jpg")
        do {
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
            guard let destination = CGImageDestinationCreateWithURL(cover as CFURL, UTType.jpeg.identifier as CFString, 1, nil) else {
                try? FileManager.default.removeItem(at: directory)
                finish()
                return
            }
            CGImageDestinationAddImage(destination, image, [kCGImageDestinationLossyCompressionQuality: 0.82] as CFDictionary)
            guard CGImageDestinationFinalize(destination) else {
                try? FileManager.default.removeItem(at: directory)
                finish()
                return
            }
            let attachment = try UNNotificationAttachment(identifier: "recommended-post-image", url: cover, options: nil)
            // UNNotificationAttachment moves the source into its managed store.
            try? FileManager.default.removeItem(at: directory)
            finish(with: attachment)
        } catch {
            try? FileManager.default.removeItem(at: directory)
            finish()
        }
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        if error != nil { finish() }
    }

    private func finish(with attachment: UNNotificationAttachment? = nil) {
        // Expiry and URLSession callbacks may race. Deliver the notification once.
        completionLock.lock()
        guard let handler = contentHandler, let content = bestContent else {
            completionLock.unlock()
            return
        }
        if let attachment = attachment { content.attachments = [attachment] }
        contentHandler = nil
        let activeSession = session
        session = nil
        completionLock.unlock()
        activeSession?.invalidateAndCancel()
        handler(content)
    }

    override func serviceExtensionTimeWillExpire() {
        finish()
    }
}
