import AVFoundation
import Capacitor
import Photos
import UIKit
import UniformTypeIdentifiers

@objc(TurtleMediaPickerPlugin)
public class TurtleMediaPickerPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "TurtleMediaPickerPlugin"
    public let jsName = "TurtleMediaPicker"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "pick", returnType: CAPPluginReturnPromise)
    ]

    @objc func pick(_ call: CAPPluginCall) {
        let allowImages = call.getBool("allowImages", true)
        let allowVideos = call.getBool("allowVideos", false)
        let selectionLimit = max(1, min(9, call.getInt("selectionLimit", 1)))
        let maximumVideoDuration = max(0, call.getDouble("maximumVideoDuration", 30))

        guard allowImages || allowVideos else {
            call.reject("没有可选择的媒体类型")
            return
        }

        requestPhotoAuthorization { [weak self] granted in
            guard let self else { return }
            guard granted else {
                call.reject("需要允许访问照片，才能选择图片或视频")
                return
            }
            DispatchQueue.main.async {
                guard let host = self.bridge?.viewController else {
                    call.reject("媒体选择器暂时不可用")
                    return
                }
                let picker = TurtleMediaGridPickerViewController(
                    allowImages: allowImages,
                    allowVideos: allowVideos,
                    selectionLimit: selectionLimit,
                    maximumVideoDuration: maximumVideoDuration
                )
                picker.onCancel = {
                    call.resolve(["files": []])
                }
                picker.onFinish = { [weak self] assets in
                    self?.export(assets: assets, call: call)
                }
                host.present(picker, animated: true)
            }
        }
    }

    private func requestPhotoAuthorization(_ completion: @escaping (Bool) -> Void) {
        let finish: (PHAuthorizationStatus) -> Void = { status in
            completion(status == .authorized || status == .limited)
        }
        if #available(iOS 14, *) {
            PHPhotoLibrary.requestAuthorization(for: .readWrite, handler: finish)
        } else {
            PHPhotoLibrary.requestAuthorization(finish)
        }
    }

    private func export(assets: [PHAsset], call: CAPPluginCall) {
        guard !assets.isEmpty else {
            call.resolve(["files": []])
            return
        }

        let group = DispatchGroup()
        let lock = NSLock()
        var outputs = Array<[String: Any]?>(repeating: nil, count: assets.count)
        var exportError: Error?

        for (index, asset) in assets.enumerated() {
            group.enter()
            export(asset: asset) { result in
                lock.lock()
                switch result {
                case .success(let file):
                    outputs[index] = file
                case .failure(let error):
                    if exportError == nil { exportError = error }
                }
                lock.unlock()
                group.leave()
            }
        }

        group.notify(queue: .main) {
            if let exportError {
                call.reject("读取媒体失败：\(exportError.localizedDescription)")
                return
            }
            call.resolve(["files": outputs.compactMap { $0 }])
        }
    }

    private func export(asset: PHAsset, completion: @escaping (Result<[String: Any], Error>) -> Void) {
        if asset.mediaType == .video {
            exportVideo(asset: asset, completion: completion)
        } else {
            exportImage(asset: asset, completion: completion)
        }
    }

    private func exportImage(asset: PHAsset, completion: @escaping (Result<[String: Any], Error>) -> Void) {
        let options = PHImageRequestOptions()
        options.isNetworkAccessAllowed = true
        options.deliveryMode = .highQualityFormat
        options.version = .current
        PHImageManager.default().requestImageDataAndOrientation(for: asset, options: options) { data, dataUTI, _, info in
            if let error = info?[PHImageErrorKey] as? Error {
                completion(.failure(error))
                return
            }
            guard let data else {
                completion(.failure(TurtleMediaPickerError.unavailableMedia))
                return
            }
            let contentType = dataUTI.flatMap { UTType($0) } ?? .jpeg
            let extensionName = contentType.preferredFilenameExtension ?? "jpg"
            let mimeType = contentType.preferredMIMEType ?? "image/jpeg"
            let fileURL = self.temporaryURL(extensionName: extensionName)
            do {
                try data.write(to: fileURL, options: .atomic)
                completion(.success([
                    "path": fileURL.absoluteString,
                    "name": "photo-\(UUID().uuidString).\(extensionName)",
                    "mimeType": mimeType,
                    "mediaType": "image"
                ]))
            } catch {
                completion(.failure(error))
            }
        }
    }

    private func exportVideo(asset: PHAsset, completion: @escaping (Result<[String: Any], Error>) -> Void) {
        let options = PHVideoRequestOptions()
        options.isNetworkAccessAllowed = true
        options.deliveryMode = .highQualityFormat
        options.version = .current
        PHImageManager.default().requestAVAsset(forVideo: asset, options: options) { avAsset, _, info in
            if let error = info?[PHImageErrorKey] as? Error {
                completion(.failure(error))
                return
            }
            guard let avAsset else {
                completion(.failure(TurtleMediaPickerError.unavailableMedia))
                return
            }
            self.exportVideoAsset(avAsset, duration: asset.duration, completion: completion)
        }
    }

    private func exportVideoAsset(_ asset: AVAsset, duration: TimeInterval, completion: @escaping (Result<[String: Any], Error>) -> Void) {
        // Do not create the old medium-quality rendition here.  It was useful
        // for small uploads, but made a video visibly blurry when played full
        // screen. Prefer a byte-for-byte stream copy whenever Photos exposes a
        // compatible container; only re-encode as a high-quality fallback.
        let compatiblePresets = AVAssetExportSession.exportPresets(compatibleWith: asset)
        let preset = compatiblePresets.contains(AVAssetExportPresetPassthrough)
            ? AVAssetExportPresetPassthrough
            : AVAssetExportPresetHighestQuality
        guard let session = AVAssetExportSession(asset: asset, presetName: preset) else {
            completion(.failure(TurtleMediaPickerError.unavailableMedia))
            return
        }
        let outputType: AVFileType
        if session.supportedFileTypes.contains(.mp4) {
            outputType = .mp4
        } else if session.supportedFileTypes.contains(.mov) {
            outputType = .mov
        } else if let first = session.supportedFileTypes.first {
            outputType = first
        } else {
            completion(.failure(TurtleMediaPickerError.unavailableMedia))
            return
        }
        let extensionName = outputType == .mov ? "mov" : "mp4"
        let outputURL = self.temporaryURL(extensionName: extensionName)
        session.outputURL = outputURL
        session.outputFileType = outputType
        session.shouldOptimizeForNetworkUse = true
        session.exportAsynchronously {
            if session.status == .completed {
                completion(.success(self.videoResult(url: outputURL, duration: duration, outputType: outputType)))
            } else {
                completion(.failure(session.error ?? TurtleMediaPickerError.unavailableMedia))
            }
        }
    }

    private func videoResult(url: URL, duration: TimeInterval, outputType: AVFileType) -> [String: Any] {
        let isMov = outputType == .mov
        [
            "path": url.absoluteString,
            "name": "video-\(UUID().uuidString).\(isMov ? "mov" : "mp4")",
            "mimeType": isMov ? "video/quicktime" : "video/mp4",
            "mediaType": "video",
            "duration": duration
        ]
    }

    private func temporaryURL(extensionName: String) -> URL {
        FileManager.default.temporaryDirectory
            .appendingPathComponent("turtlekeeper-media-\(UUID().uuidString)")
            .appendingPathExtension(extensionName)
    }
}

private enum TurtleMediaPickerError: LocalizedError {
    case unavailableMedia

    var errorDescription: String? {
        "无法读取这项媒体，请重新选择"
    }
}

private final class TurtleMediaGridPickerViewController: UIViewController, UICollectionViewDataSource, UICollectionViewDelegateFlowLayout {
    private let allowImages: Bool
    private let allowVideos: Bool
    private let selectionLimit: Int
    private let maximumVideoDuration: TimeInterval
    private let imageManager = PHCachingImageManager()
    private var assets: [PHAsset] = []
    private var selectedIdentifiers: [String] = []

    var onCancel: (() -> Void)?
    var onFinish: (([PHAsset]) -> Void)?

    private let collectionView: UICollectionView
    private let doneButton = UIButton(type: .system)
    private let counterLabel = UILabel()
    private let emptyLabel = UILabel()

    init(allowImages: Bool, allowVideos: Bool, selectionLimit: Int, maximumVideoDuration: TimeInterval) {
        self.allowImages = allowImages
        self.allowVideos = allowVideos
        self.selectionLimit = selectionLimit
        self.maximumVideoDuration = maximumVideoDuration
        let layout = UICollectionViewFlowLayout()
        layout.minimumInteritemSpacing = 1
        layout.minimumLineSpacing = 1
        self.collectionView = UICollectionView(frame: .zero, collectionViewLayout: layout)
        super.init(nibName: nil, bundle: nil)
        modalPresentationStyle = .fullScreen
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black
        configureHeader()
        configureCollection()
        configureFooter()
        loadAssets()
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        let width = max(1, collectionView.bounds.width)
        let itemWidth = floor((width - 3) / 4)
        if let layout = collectionView.collectionViewLayout as? UICollectionViewFlowLayout,
           layout.itemSize.width != itemWidth {
            layout.itemSize = CGSize(width: itemWidth, height: itemWidth)
            layout.invalidateLayout()
        }
    }

    private func configureHeader() {
        let header = UIView()
        header.translatesAutoresizingMaskIntoConstraints = false
        header.backgroundColor = UIColor(white: 0.11, alpha: 1)
        view.addSubview(header)

        let cancel = UIButton(type: .system)
        cancel.translatesAutoresizingMaskIntoConstraints = false
        cancel.setTitle("×", for: .normal)
        cancel.setTitleColor(.white, for: .normal)
        cancel.titleLabel?.font = .systemFont(ofSize: 46, weight: .light)
        cancel.addTarget(self, action: #selector(cancelSelection), for: .touchUpInside)

        let title = UILabel()
        title.translatesAutoresizingMaskIntoConstraints = false
        title.text = "最近项目⌄"
        title.textColor = .white
        title.font = .systemFont(ofSize: 18, weight: .semibold)
        title.backgroundColor = UIColor(white: 0.26, alpha: 1)
        title.layer.cornerRadius = 21
        title.clipsToBounds = true
        title.textAlignment = .center

        header.addSubview(cancel)
        header.addSubview(title)
        NSLayoutConstraint.activate([
            header.topAnchor.constraint(equalTo: view.topAnchor),
            header.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            header.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            header.heightAnchor.constraint(equalToConstant: 108),
            cancel.leadingAnchor.constraint(equalTo: header.leadingAnchor, constant: 24),
            cancel.bottomAnchor.constraint(equalTo: header.bottomAnchor, constant: -10),
            cancel.widthAnchor.constraint(equalToConstant: 48),
            cancel.heightAnchor.constraint(equalToConstant: 48),
            title.centerXAnchor.constraint(equalTo: header.centerXAnchor),
            title.centerYAnchor.constraint(equalTo: cancel.centerYAnchor),
            title.widthAnchor.constraint(greaterThanOrEqualToConstant: 142),
            title.heightAnchor.constraint(equalToConstant: 42)
        ])
    }

    private func configureCollection() {
        collectionView.translatesAutoresizingMaskIntoConstraints = false
        collectionView.backgroundColor = .black
        collectionView.alwaysBounceVertical = true
        collectionView.dataSource = self
        collectionView.delegate = self
        collectionView.register(TurtleMediaGridCell.self, forCellWithReuseIdentifier: TurtleMediaGridCell.reuseIdentifier)
        view.addSubview(collectionView)
        NSLayoutConstraint.activate([
            collectionView.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 60),
            collectionView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            collectionView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            collectionView.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -76)
        ])

        emptyLabel.translatesAutoresizingMaskIntoConstraints = false
        emptyLabel.text = "没有可选择的图片或视频"
        emptyLabel.textColor = UIColor(white: 0.7, alpha: 1)
        emptyLabel.font = .systemFont(ofSize: 16)
        emptyLabel.isHidden = true
        view.addSubview(emptyLabel)
        NSLayoutConstraint.activate([
            emptyLabel.centerXAnchor.constraint(equalTo: collectionView.centerXAnchor),
            emptyLabel.centerYAnchor.constraint(equalTo: collectionView.centerYAnchor)
        ])
    }

    private func configureFooter() {
        let footer = UIView()
        footer.translatesAutoresizingMaskIntoConstraints = false
        footer.backgroundColor = UIColor(white: 0.11, alpha: 1)
        view.addSubview(footer)

        let preview = UILabel()
        preview.translatesAutoresizingMaskIntoConstraints = false
        preview.text = "预览"
        preview.textColor = UIColor(white: 0.48, alpha: 1)
        preview.font = .systemFont(ofSize: 17)

        counterLabel.translatesAutoresizingMaskIntoConstraints = false
        counterLabel.textColor = .white
        counterLabel.font = .systemFont(ofSize: 16, weight: .medium)
        counterLabel.textAlignment = .center

        doneButton.translatesAutoresizingMaskIntoConstraints = false
        doneButton.layer.cornerRadius = 8
        doneButton.titleLabel?.font = .systemFont(ofSize: 17, weight: .semibold)
        doneButton.addTarget(self, action: #selector(finishSelection), for: .touchUpInside)

        footer.addSubview(preview)
        footer.addSubview(counterLabel)
        footer.addSubview(doneButton)
        NSLayoutConstraint.activate([
            footer.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            footer.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            footer.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            footer.heightAnchor.constraint(equalToConstant: 90),
            preview.leadingAnchor.constraint(equalTo: footer.leadingAnchor, constant: 28),
            preview.centerYAnchor.constraint(equalTo: footer.centerYAnchor, constant: -8),
            counterLabel.centerXAnchor.constraint(equalTo: footer.centerXAnchor),
            counterLabel.centerYAnchor.constraint(equalTo: footer.centerYAnchor, constant: -8),
            doneButton.trailingAnchor.constraint(equalTo: footer.trailingAnchor, constant: -22),
            doneButton.centerYAnchor.constraint(equalTo: footer.centerYAnchor, constant: -8),
            doneButton.widthAnchor.constraint(equalToConstant: 84),
            doneButton.heightAnchor.constraint(equalToConstant: 42)
        ])
        updateFooter()
    }

    private func loadAssets() {
        let options = PHFetchOptions()
        options.sortDescriptors = [NSSortDescriptor(key: "creationDate", ascending: false)]
        let fetched = PHAsset.fetchAssets(with: options)
        var nextAssets: [PHAsset] = []
        fetched.enumerateObjects { asset, _, _ in
            if asset.mediaType == .image && self.allowImages {
                nextAssets.append(asset)
            } else if asset.mediaType == .video && self.allowVideos {
                nextAssets.append(asset)
            }
        }
        assets = nextAssets
        emptyLabel.isHidden = !assets.isEmpty
        collectionView.reloadData()
    }

    @objc private func cancelSelection() {
        dismiss(animated: true) { [onCancel] in onCancel?() }
    }

    @objc private func finishSelection() {
        let selected = selectedIdentifiers.compactMap { identifier in
            assets.first(where: { $0.localIdentifier == identifier })
        }
        dismiss(animated: true) { [onFinish] in onFinish?(selected) }
    }

    private func isSelectable(_ asset: PHAsset) -> Bool {
        asset.mediaType != .video || maximumVideoDuration <= 0 || asset.duration <= maximumVideoDuration
    }

    private func updateFooter() {
        let count = selectedIdentifiers.count
        counterLabel.text = selectionLimit > 1 ? "已选 \(count)/\(selectionLimit)" : (count == 0 ? "选择项目" : "已选择 1 项")
        doneButton.setTitle(count > 0 ? "完成" : "取消", for: .normal)
        doneButton.backgroundColor = count > 0 ? UIColor(red: 0.16, green: 0.68, blue: 0.45, alpha: 1) : UIColor(white: 0.25, alpha: 1)
        doneButton.setTitleColor(count > 0 ? .white : UIColor(white: 0.55, alpha: 1), for: .normal)
    }

    func collectionView(_ collectionView: UICollectionView, numberOfItemsInSection section: Int) -> Int {
        assets.count
    }

    func collectionView(_ collectionView: UICollectionView, cellForItemAt indexPath: IndexPath) -> UICollectionViewCell {
        guard let cell = collectionView.dequeueReusableCell(withReuseIdentifier: TurtleMediaGridCell.reuseIdentifier, for: indexPath) as? TurtleMediaGridCell else {
            return UICollectionViewCell()
        }
        let asset = assets[indexPath.item]
        let selectedIndex = selectedIdentifiers.firstIndex(of: asset.localIdentifier)
        cell.configure(asset: asset, selectedIndex: selectedIndex.map { $0 + 1 }, selectable: isSelectable(asset), imageManager: imageManager)
        return cell
    }

    func collectionView(_ collectionView: UICollectionView, didSelectItemAt indexPath: IndexPath) {
        let asset = assets[indexPath.item]
        guard isSelectable(asset) else {
            let alert = UIAlertController(title: "视频时长超过限制", message: "视频最长只能选择 \(Int(maximumVideoDuration)) 秒。", preferredStyle: .alert)
            alert.addAction(UIAlertAction(title: "知道了", style: .default))
            present(alert, animated: true)
            return
        }
        if let index = selectedIdentifiers.firstIndex(of: asset.localIdentifier) {
            selectedIdentifiers.remove(at: index)
        } else {
            if selectedIdentifiers.count >= selectionLimit {
                let alert = UIAlertController(title: "最多选择 \(selectionLimit) 项", message: nil, preferredStyle: .alert)
                alert.addAction(UIAlertAction(title: "知道了", style: .default))
                present(alert, animated: true)
                return
            }
            selectedIdentifiers.append(asset.localIdentifier)
        }
        collectionView.reloadItems(at: [indexPath])
        collectionView.visibleCells.forEach { cell in
            guard let index = collectionView.indexPath(for: cell), index != indexPath else { return }
            let currentAsset = assets[index.item]
            (cell as? TurtleMediaGridCell)?.setSelectedIndex(selectedIdentifiers.firstIndex(of: currentAsset.localIdentifier).map { $0 + 1 })
        }
        updateFooter()
    }
}

private final class TurtleMediaGridCell: UICollectionViewCell {
    static let reuseIdentifier = "TurtleMediaGridCell"

    private let imageView = UIImageView()
    private let selectionBadge = UILabel()
    private let durationLabel = UILabel()
    private let dimView = UIView()
    private var representedIdentifier = ""

    override init(frame: CGRect) {
        super.init(frame: frame)
        imageView.translatesAutoresizingMaskIntoConstraints = false
        imageView.contentMode = .scaleAspectFill
        imageView.clipsToBounds = true
        contentView.addSubview(imageView)
        NSLayoutConstraint.activate([
            imageView.leadingAnchor.constraint(equalTo: contentView.leadingAnchor),
            imageView.trailingAnchor.constraint(equalTo: contentView.trailingAnchor),
            imageView.topAnchor.constraint(equalTo: contentView.topAnchor),
            imageView.bottomAnchor.constraint(equalTo: contentView.bottomAnchor)
        ])

        dimView.translatesAutoresizingMaskIntoConstraints = false
        dimView.backgroundColor = UIColor.black.withAlphaComponent(0.42)
        dimView.isHidden = true
        contentView.addSubview(dimView)
        NSLayoutConstraint.activate([
            dimView.leadingAnchor.constraint(equalTo: contentView.leadingAnchor),
            dimView.trailingAnchor.constraint(equalTo: contentView.trailingAnchor),
            dimView.topAnchor.constraint(equalTo: contentView.topAnchor),
            dimView.bottomAnchor.constraint(equalTo: contentView.bottomAnchor)
        ])

        selectionBadge.translatesAutoresizingMaskIntoConstraints = false
        selectionBadge.textAlignment = .center
        selectionBadge.textColor = .white
        selectionBadge.font = .systemFont(ofSize: 13, weight: .bold)
        selectionBadge.layer.borderWidth = 2
        selectionBadge.layer.borderColor = UIColor.white.cgColor
        selectionBadge.layer.cornerRadius = 16
        selectionBadge.clipsToBounds = true
        contentView.addSubview(selectionBadge)
        NSLayoutConstraint.activate([
            selectionBadge.topAnchor.constraint(equalTo: contentView.topAnchor, constant: 9),
            selectionBadge.trailingAnchor.constraint(equalTo: contentView.trailingAnchor, constant: -9),
            selectionBadge.widthAnchor.constraint(equalToConstant: 32),
            selectionBadge.heightAnchor.constraint(equalToConstant: 32)
        ])

        durationLabel.translatesAutoresizingMaskIntoConstraints = false
        durationLabel.textColor = .white
        durationLabel.font = .monospacedDigitSystemFont(ofSize: 14, weight: .semibold)
        durationLabel.layer.shadowColor = UIColor.black.cgColor
        durationLabel.layer.shadowOpacity = 0.8
        durationLabel.layer.shadowRadius = 2
        durationLabel.layer.shadowOffset = .zero
        contentView.addSubview(durationLabel)
        NSLayoutConstraint.activate([
            durationLabel.leadingAnchor.constraint(equalTo: contentView.leadingAnchor, constant: 8),
            durationLabel.bottomAnchor.constraint(equalTo: contentView.bottomAnchor, constant: -7)
        ])
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    override func prepareForReuse() {
        super.prepareForReuse()
        representedIdentifier = ""
        imageView.image = nil
    }

    func configure(asset: PHAsset, selectedIndex: Int?, selectable: Bool, imageManager: PHCachingImageManager) {
        representedIdentifier = asset.localIdentifier
        let target = CGSize(width: max(bounds.width, 180) * UIScreen.main.scale, height: max(bounds.height, 180) * UIScreen.main.scale)
        let options = PHImageRequestOptions()
        options.deliveryMode = .opportunistic
        options.resizeMode = .fast
        options.isNetworkAccessAllowed = true
        imageManager.requestImage(for: asset, targetSize: target, contentMode: .aspectFill, options: options) { [weak self] image, _ in
            guard self?.representedIdentifier == asset.localIdentifier else { return }
            self?.imageView.image = image
        }
        durationLabel.text = asset.mediaType == .video ? Self.durationText(asset.duration) : ""
        dimView.isHidden = selectable
        setSelectedIndex(selectedIndex)
    }

    func setSelectedIndex(_ selectedIndex: Int?) {
        if let selectedIndex {
            selectionBadge.text = "\(selectedIndex)"
            selectionBadge.backgroundColor = UIColor(red: 0.16, green: 0.68, blue: 0.45, alpha: 1)
            selectionBadge.layer.borderColor = UIColor(red: 0.16, green: 0.68, blue: 0.45, alpha: 1).cgColor
        } else {
            selectionBadge.text = ""
            selectionBadge.backgroundColor = UIColor.black.withAlphaComponent(0.16)
            selectionBadge.layer.borderColor = UIColor.white.cgColor
        }
    }

    private static func durationText(_ duration: TimeInterval) -> String {
        let total = max(0, Int(duration.rounded()))
        return String(format: "%d:%02d", total / 60, total % 60)
    }
}
