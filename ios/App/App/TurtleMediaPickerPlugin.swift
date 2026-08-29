import AVFoundation
import AVKit
import Capacitor
import Photos
import UIKit
import UniformTypeIdentifiers

@objc(TurtleMediaPickerPlugin)
public class TurtleMediaPickerPlugin: CAPPlugin, CAPBridgedPlugin, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
    public let identifier = "TurtleMediaPickerPlugin"
    public let jsName = "TurtleMediaPicker"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "pick", returnType: CAPPluginReturnPromise)
    ]

    private var cameraCall: CAPPluginCall?

    @objc func pick(_ call: CAPPluginCall) {
        let allowImages = call.getBool("allowImages", true)
        let allowVideos = call.getBool("allowVideos", false)
        let selectionLimit = max(1, min(9, call.getInt("selectionLimit", 1)))
        let maximumVideoDuration = max(0, call.getDouble("maximumVideoDuration", 30))

        guard allowImages || allowVideos else {
            call.reject("没有可选择的媒体类型")
            return
        }

        DispatchQueue.main.async { [weak self] in
            guard let self, let host = self.bridge?.viewController else {
                call.reject("媒体选择器暂时不可用")
                return
            }
            let sheet = UIAlertController(title: "上传照片", message: nil, preferredStyle: .actionSheet)
            if allowImages && UIImagePickerController.isSourceTypeAvailable(.camera) {
                sheet.addAction(UIAlertAction(title: "拍照", style: .default) { [weak self] _ in
                    self?.openCamera(call: call)
                })
            }
            sheet.addAction(UIAlertAction(title: allowVideos ? "从相册选择图片或视频" : "从相册选择", style: .default) { [weak self] _ in
                self?.openPhotoLibrary(
                    call: call,
                    allowImages: allowImages,
                    allowVideos: allowVideos,
                    selectionLimit: selectionLimit,
                    maximumVideoDuration: maximumVideoDuration
                )
            })
            sheet.addAction(UIAlertAction(title: "取消", style: .cancel) { _ in
                call.resolve(["files": []])
            })
            if let popover = sheet.popoverPresentationController {
                popover.sourceView = host.view
                popover.sourceRect = CGRect(x: host.view.bounds.midX, y: host.view.bounds.maxY - 1, width: 1, height: 1)
            }
            host.present(sheet, animated: true)
        }
    }

    private func openPhotoLibrary(call: CAPPluginCall, allowImages: Bool, allowVideos: Bool, selectionLimit: Int, maximumVideoDuration: Double) {
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
                picker.onCancel = { call.resolve(["files": []]) }
                picker.onFinish = { [weak self] assets, editedImages in
                    self?.export(assets: assets, editedImages: editedImages, call: call)
                }
                host.present(picker, animated: true)
            }
        }
    }

    private func openCamera(call: CAPPluginCall) {
        let presentCamera = { [weak self] in
            guard let self else { return }
            DispatchQueue.main.async {
                guard let host = self.bridge?.viewController else {
                    call.reject("相机暂时不可用")
                    return
                }
                self.cameraCall = call
                let camera = UIImagePickerController()
                camera.sourceType = .camera
                camera.mediaTypes = [UTType.image.identifier]
                camera.cameraCaptureMode = .photo
                camera.delegate = self
                camera.modalPresentationStyle = .fullScreen
                host.present(camera, animated: true)
            }
        }
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized:
            presentCamera()
        case .notDetermined:
            AVCaptureDevice.requestAccess(for: .video) { granted in
                granted ? presentCamera() : call.reject("需要允许使用相机，才能拍摄照片")
            }
        default:
            call.reject("需要允许使用相机，才能拍摄照片")
        }
    }

    public func imagePickerControllerDidCancel(_ picker: UIImagePickerController) {
        let call = cameraCall
        cameraCall = nil
        picker.dismiss(animated: true) { call?.resolve(["files": []]) }
    }

    public func imagePickerController(_ picker: UIImagePickerController, didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) {
        let call = cameraCall
        cameraCall = nil
        guard let image = info[.originalImage] as? UIImage, let data = image.jpegData(compressionQuality: 0.92) else {
            picker.dismiss(animated: true) { call?.reject("拍摄的照片读取失败，请重试") }
            return
        }
        let fileURL = temporaryURL(extensionName: "jpg")
        do {
            try data.write(to: fileURL, options: .atomic)
            let result: [String: Any] = [
                "path": fileURL.absoluteString,
                "name": "camera-\(UUID().uuidString).jpg",
                "mimeType": "image/jpeg",
                "mediaType": "image"
            ]
            picker.dismiss(animated: true) { call?.resolve(["files": [result]]) }
        } catch {
            picker.dismiss(animated: true) { call?.reject("保存拍摄照片失败：\(error.localizedDescription)") }
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

    private func export(assets: [PHAsset], editedImages: [String: Data] = [:], call: CAPPluginCall) {
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
            export(asset: asset, editedImageData: editedImages[asset.localIdentifier]) { result in
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

    private func export(asset: PHAsset, editedImageData: Data?, completion: @escaping (Result<[String: Any], Error>) -> Void) {
        if asset.mediaType == .video {
            exportVideo(asset: asset, completion: completion)
        } else if let editedImageData {
            exportImageData(editedImageData, extensionName: "jpg", mimeType: "image/jpeg", completion: completion)
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
            self.exportImageData(data, extensionName: extensionName, mimeType: mimeType, completion: completion)
        }
    }

    private func exportImageData(_ data: Data, extensionName: String, mimeType: String, completion: @escaping (Result<[String: Any], Error>) -> Void) {
        let fileURL = temporaryURL(extensionName: extensionName)
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
        // Keep the highest available quality.  The previous medium-quality
        // preset made full-screen chat videos visibly blurry.  We deliberately
        // keep the known-compatible MP4 export path here: its API shape works
        // across all iOS/Xcode versions supported by this project.
        guard let session = AVAssetExportSession(asset: asset, presetName: AVAssetExportPresetHighestQuality) else {
            completion(.failure(TurtleMediaPickerError.unavailableMedia))
            return
        }
        let outputURL = self.temporaryURL(extensionName: "mp4")
        session.outputURL = outputURL
        session.outputFileType = .mp4
        session.shouldOptimizeForNetworkUse = true
        session.exportAsynchronously {
            if session.status == .completed {
                completion(.success(self.videoResult(url: outputURL, duration: duration)))
            } else {
                completion(.failure(session.error ?? TurtleMediaPickerError.unavailableMedia))
            }
        }
    }

    private func videoResult(url: URL, duration: TimeInterval) -> [String: Any] {
        [
            "path": url.absoluteString,
            "name": "video-\(UUID().uuidString).mp4",
            "mimeType": "video/mp4",
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
    private var selectedAssets: [String: PHAsset] = [:]
    private var editedImages: [String: Data] = [:]
    private var currentCollection: PHAssetCollection?

    var onCancel: (() -> Void)?
    var onFinish: (([PHAsset], [String: Data]) -> Void)?

    private let collectionView: UICollectionView
    private let doneButton = UIButton(type: .system)
    private let previewButton = UIButton(type: .system)
    private let counterLabel = UILabel()
    private let emptyLabel = UILabel()
    private let albumButton = UIButton(type: .system)

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

        albumButton.translatesAutoresizingMaskIntoConstraints = false
        albumButton.setTitle("最近项目⌄", for: .normal)
        albumButton.setTitleColor(.white, for: .normal)
        albumButton.titleLabel?.font = .systemFont(ofSize: 18, weight: .semibold)
        albumButton.titleLabel?.lineBreakMode = .byTruncatingMiddle
        albumButton.backgroundColor = UIColor(white: 0.26, alpha: 1)
        albumButton.layer.cornerRadius = 21
        albumButton.clipsToBounds = true
        albumButton.contentEdgeInsets = UIEdgeInsets(top: 0, left: 22, bottom: 0, right: 22)
        albumButton.accessibilityLabel = "选择相簿"
        albumButton.addTarget(self, action: #selector(openAlbumList), for: .touchUpInside)

        header.addSubview(cancel)
        header.addSubview(albumButton)
        NSLayoutConstraint.activate([
            header.topAnchor.constraint(equalTo: view.topAnchor),
            header.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            header.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            header.heightAnchor.constraint(equalToConstant: 108),
            cancel.leadingAnchor.constraint(equalTo: header.leadingAnchor, constant: 24),
            cancel.bottomAnchor.constraint(equalTo: header.bottomAnchor, constant: -10),
            cancel.widthAnchor.constraint(equalToConstant: 48),
            cancel.heightAnchor.constraint(equalToConstant: 48),
            albumButton.centerXAnchor.constraint(equalTo: header.centerXAnchor),
            albumButton.centerYAnchor.constraint(equalTo: cancel.centerYAnchor),
            albumButton.widthAnchor.constraint(greaterThanOrEqualToConstant: 142),
            albumButton.widthAnchor.constraint(lessThanOrEqualTo: header.widthAnchor, constant: -150),
            albumButton.heightAnchor.constraint(equalToConstant: 42)
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

        previewButton.translatesAutoresizingMaskIntoConstraints = false
        previewButton.setTitle("预览", for: .normal)
        previewButton.titleLabel?.font = .systemFont(ofSize: 17)
        previewButton.contentHorizontalAlignment = .left
        previewButton.addTarget(self, action: #selector(previewSelection), for: .touchUpInside)

        counterLabel.translatesAutoresizingMaskIntoConstraints = false
        counterLabel.textColor = .white
        counterLabel.font = .systemFont(ofSize: 16, weight: .medium)
        counterLabel.textAlignment = .center

        doneButton.translatesAutoresizingMaskIntoConstraints = false
        doneButton.layer.cornerRadius = 8
        doneButton.titleLabel?.font = .systemFont(ofSize: 17, weight: .semibold)
        doneButton.addTarget(self, action: #selector(finishSelection), for: .touchUpInside)

        footer.addSubview(previewButton)
        footer.addSubview(counterLabel)
        footer.addSubview(doneButton)
        NSLayoutConstraint.activate([
            footer.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            footer.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            footer.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            footer.heightAnchor.constraint(equalToConstant: 90),
            previewButton.leadingAnchor.constraint(equalTo: footer.leadingAnchor, constant: 28),
            previewButton.centerYAnchor.constraint(equalTo: footer.centerYAnchor, constant: -8),
            previewButton.widthAnchor.constraint(equalToConstant: 84),
            previewButton.heightAnchor.constraint(equalToConstant: 48),
            counterLabel.centerXAnchor.constraint(equalTo: footer.centerXAnchor),
            counterLabel.centerYAnchor.constraint(equalTo: footer.centerYAnchor, constant: -8),
            doneButton.trailingAnchor.constraint(equalTo: footer.trailingAnchor, constant: -22),
            doneButton.centerYAnchor.constraint(equalTo: footer.centerYAnchor, constant: -8),
            doneButton.widthAnchor.constraint(equalToConstant: 84),
            doneButton.heightAnchor.constraint(equalToConstant: 42)
        ])
        updateFooter()
    }

    private func loadAssets(collection: PHAssetCollection? = nil, title: String = "最近项目") {
        currentCollection = collection
        albumButton.setTitle("\(title)⌄", for: .normal)
        let options = PHFetchOptions()
        options.sortDescriptors = [NSSortDescriptor(key: "creationDate", ascending: false)]
        let fetched = collection.map { PHAsset.fetchAssets(in: $0, options: options) } ?? PHAsset.fetchAssets(with: options)
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

    @objc private func openAlbumList() {
        let albums = TurtleAlbumListViewController(
            allowImages: allowImages,
            allowVideos: allowVideos,
            selectedCollection: currentCollection
        )
        albums.onSelect = { [weak self] collection, title in
            self?.loadAssets(collection: collection, title: title)
        }
        let navigation = UINavigationController(rootViewController: albums)
        navigation.modalPresentationStyle = .fullScreen
        present(navigation, animated: true)
    }

    @objc private func cancelSelection() {
        dismiss(animated: true) { [onCancel] in onCancel?() }
    }

    @objc private func finishSelection() {
        let selected = selectedIdentifiers.compactMap { identifier in
            selectedAssets[identifier]
        }
        let edits = editedImages
        dismiss(animated: true) { [onFinish] in onFinish?(selected, edits) }
    }

    @objc private func previewSelection() {
        guard let identifier = selectedIdentifiers.first,
              let asset = selectedAssets[identifier] else { return }
        if asset.mediaType == .video {
            previewVideo(asset)
            return
        }
        if let data = editedImages[identifier], let image = UIImage(data: data) {
            presentEditor(image: image, identifier: identifier)
            return
        }
        let options = PHImageRequestOptions()
        options.isNetworkAccessAllowed = true
        options.deliveryMode = .highQualityFormat
        options.resizeMode = .none
        PHImageManager.default().requestImage(for: asset, targetSize: PHImageManagerMaximumSize, contentMode: .aspectFit, options: options) { [weak self] image, info in
            guard let self, let image,
                  !(info?[PHImageCancelledKey] as? Bool ?? false),
                  !(info?[PHImageResultIsDegradedKey] as? Bool ?? false) else { return }
            DispatchQueue.main.async {
                self.presentEditor(image: image, identifier: identifier)
            }
        }
    }

    private func previewVideo(_ asset: PHAsset) {
        let options = PHVideoRequestOptions()
        options.isNetworkAccessAllowed = true
        options.deliveryMode = .highQualityFormat
        PHImageManager.default().requestAVAsset(forVideo: asset, options: options) { [weak self] videoAsset, _, info in
            guard let self, let videoAsset,
                  !(info?[PHImageCancelledKey] as? Bool ?? false) else { return }
            DispatchQueue.main.async {
                self.present(TurtleVideoPreviewViewController(asset: videoAsset), animated: true)
            }
        }
    }

    private func presentEditor(image: UIImage, identifier: String) {
        let editor = TurtleImageEditorViewController(image: image)
        editor.onSave = { [weak self] data in
            self?.editedImages[identifier] = data
            self?.previewButton.setTitle("已编辑", for: .normal)
        }
        present(editor, animated: true)
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
        previewButton.isEnabled = count > 0
        previewButton.setTitleColor(count > 0 ? .white : UIColor(white: 0.48, alpha: 1), for: .normal)
        let firstIdentifier = selectedIdentifiers.first
        previewButton.setTitle(firstIdentifier.flatMap { editedImages[$0] } == nil ? "预览" : "已编辑", for: .normal)
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
            selectedAssets.removeValue(forKey: asset.localIdentifier)
            editedImages.removeValue(forKey: asset.localIdentifier)
        } else {
            if selectedIdentifiers.count >= selectionLimit {
                let alert = UIAlertController(title: "最多选择 \(selectionLimit) 项", message: nil, preferredStyle: .alert)
                alert.addAction(UIAlertAction(title: "知道了", style: .default))
                present(alert, animated: true)
                return
            }
            selectedIdentifiers.append(asset.localIdentifier)
            selectedAssets[asset.localIdentifier] = asset
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

private struct TurtleMediaAlbum {
    let title: String
    let collection: PHAssetCollection?
    let count: Int
}

private final class TurtleAlbumListViewController: UITableViewController {
    private let allowImages: Bool
    private let allowVideos: Bool
    private let selectedCollectionIdentifier: String?
    private var albums: [TurtleMediaAlbum] = []
    var onSelect: ((PHAssetCollection?, String) -> Void)?

    init(allowImages: Bool, allowVideos: Bool, selectedCollection: PHAssetCollection?) {
        self.allowImages = allowImages
        self.allowVideos = allowVideos
        self.selectedCollectionIdentifier = selectedCollection?.localIdentifier
        super.init(style: .insetGrouped)
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

    override func viewDidLoad() {
        super.viewDidLoad()
        title = "选择相簿"
        view.backgroundColor = .black
        tableView.backgroundColor = .black
        tableView.separatorColor = UIColor(white: 0.22, alpha: 1)
        tableView.register(UITableViewCell.self, forCellReuseIdentifier: "album")
        navigationItem.leftBarButtonItem = UIBarButtonItem(title: "取消", style: .plain, target: self, action: #selector(close))
        if #available(iOS 13.0, *) {
            let appearance = UINavigationBarAppearance()
            appearance.configureWithOpaqueBackground()
            appearance.backgroundColor = UIColor(white: 0.11, alpha: 1)
            appearance.titleTextAttributes = [.foregroundColor: UIColor.white]
            navigationController?.navigationBar.standardAppearance = appearance
            navigationController?.navigationBar.scrollEdgeAppearance = appearance
        }
        navigationController?.navigationBar.tintColor = .white
        loadAlbums()
    }

    private func mediaCount(in collection: PHAssetCollection?) -> Int {
        let options = PHFetchOptions()
        let fetched = collection.map { PHAsset.fetchAssets(in: $0, options: options) } ?? PHAsset.fetchAssets(with: options)
        var count = 0
        fetched.enumerateObjects { asset, _, _ in
            if (asset.mediaType == .image && self.allowImages) || (asset.mediaType == .video && self.allowVideos) {
                count += 1
            }
        }
        return count
    }

    private func loadAlbums() {
        var next: [TurtleMediaAlbum] = [TurtleMediaAlbum(title: "最近项目", collection: nil, count: mediaCount(in: nil))]
        var identifiers = Set<String>()
        let appendCollections: (PHFetchResult<PHAssetCollection>) -> Void = { result in
            result.enumerateObjects { collection, _, _ in
                guard !identifiers.contains(collection.localIdentifier) else { return }
                let count = self.mediaCount(in: collection)
                guard count > 0 else { return }
                identifiers.insert(collection.localIdentifier)
                next.append(TurtleMediaAlbum(
                    title: collection.localizedTitle?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false
                        ? collection.localizedTitle!
                        : "未命名相簿",
                    collection: collection,
                    count: count
                ))
            }
        }
        appendCollections(PHAssetCollection.fetchAssetCollections(with: .smartAlbum, subtype: .any, options: nil))
        appendCollections(PHAssetCollection.fetchAssetCollections(with: .album, subtype: .any, options: nil))
        albums = next
        tableView.reloadData()
    }

    @objc private func close() { dismiss(animated: true) }

    override func tableView(_ tableView: UITableView, numberOfRowsInSection section: Int) -> Int { albums.count }

    override func tableView(_ tableView: UITableView, cellForRowAt indexPath: IndexPath) -> UITableViewCell {
        let cell = tableView.dequeueReusableCell(withIdentifier: "album", for: indexPath)
        let album = albums[indexPath.row]
        var content = cell.defaultContentConfiguration()
        content.text = album.title
        content.secondaryText = "\(album.count) 项"
        content.textProperties.color = .white
        content.secondaryTextProperties.color = UIColor(white: 0.62, alpha: 1)
        cell.contentConfiguration = content
        cell.backgroundColor = UIColor(white: 0.12, alpha: 1)
        cell.accessoryType = album.collection?.localIdentifier == selectedCollectionIdentifier ||
            (album.collection == nil && selectedCollectionIdentifier == nil) ? .checkmark : .disclosureIndicator
        cell.tintColor = UIColor(red: 0.16, green: 0.68, blue: 0.45, alpha: 1)
        return cell
    }

    override func tableView(_ tableView: UITableView, didSelectRowAt indexPath: IndexPath) {
        let album = albums[indexPath.row]
        tableView.deselectRow(at: indexPath, animated: true)
        dismiss(animated: true) { [onSelect] in onSelect?(album.collection, album.title) }
    }
}

private final class TurtleVideoPreviewViewController: UIViewController {
    private let playerController = AVPlayerViewController()
    private let player: AVPlayer

    init(asset: AVAsset) {
        self.player = AVPlayer(playerItem: AVPlayerItem(asset: asset))
        super.init(nibName: nil, bundle: nil)
        modalPresentationStyle = .fullScreen
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black
        addChild(playerController)
        playerController.view.translatesAutoresizingMaskIntoConstraints = false
        playerController.player = player
        view.addSubview(playerController.view)
        playerController.didMove(toParent: self)

        let close = UIButton(type: .system)
        close.translatesAutoresizingMaskIntoConstraints = false
        close.setTitle("完成", for: .normal)
        close.setTitleColor(.white, for: .normal)
        close.titleLabel?.font = .systemFont(ofSize: 17, weight: .semibold)
        close.backgroundColor = UIColor.black.withAlphaComponent(0.56)
        close.layer.cornerRadius = 18
        close.contentEdgeInsets = UIEdgeInsets(top: 0, left: 15, bottom: 0, right: 15)
        close.addTarget(self, action: #selector(closePreview), for: .touchUpInside)
        view.addSubview(close)

        NSLayoutConstraint.activate([
            playerController.view.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            playerController.view.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            playerController.view.topAnchor.constraint(equalTo: view.topAnchor),
            playerController.view.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            close.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 12),
            close.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -16),
            close.heightAnchor.constraint(equalToConstant: 36)
        ])
        player.play()
    }

    override func viewWillDisappear(_ animated: Bool) {
        super.viewWillDisappear(animated)
        player.pause()
    }

    @objc private func closePreview() { dismiss(animated: true) }
}

private final class TurtleImageEditorViewController: UIViewController, UIScrollViewDelegate {
    private let sourceImage: UIImage
    private let scrollView = UIScrollView()
    private let imageView = UIImageView()
    private let cropBorder = UIView()
    private var didConfigureZoom = false
    var onSave: ((Data) -> Void)?

    init(image: UIImage) {
        self.sourceImage = image
        super.init(nibName: nil, bundle: nil)
        modalPresentationStyle = .fullScreen
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black

        let title = UILabel()
        title.translatesAutoresizingMaskIntoConstraints = false
        title.text = "预览与裁剪"
        title.textColor = .white
        title.font = .systemFont(ofSize: 18, weight: .semibold)
        title.textAlignment = .center

        let cancel = UIButton(type: .system)
        cancel.translatesAutoresizingMaskIntoConstraints = false
        cancel.setTitle("取消", for: .normal)
        cancel.setTitleColor(.white, for: .normal)
        cancel.addTarget(self, action: #selector(closeEditor), for: .touchUpInside)

        let save = UIButton(type: .system)
        save.translatesAutoresizingMaskIntoConstraints = false
        save.setTitle("使用裁剪", for: .normal)
        save.setTitleColor(UIColor(red: 0.2, green: 0.82, blue: 0.53, alpha: 1), for: .normal)
        save.titleLabel?.font = .systemFont(ofSize: 17, weight: .semibold)
        save.addTarget(self, action: #selector(saveCrop), for: .touchUpInside)

        let hint = UILabel()
        hint.translatesAutoresizingMaskIntoConstraints = false
        hint.text = "双指缩放、拖动图片，调整选取范围"
        hint.textColor = UIColor(white: 0.72, alpha: 1)
        hint.font = .systemFont(ofSize: 14)
        hint.textAlignment = .center

        scrollView.translatesAutoresizingMaskIntoConstraints = false
        scrollView.delegate = self
        scrollView.showsHorizontalScrollIndicator = false
        scrollView.showsVerticalScrollIndicator = false
        scrollView.bouncesZoom = true
        scrollView.decelerationRate = .fast
        scrollView.clipsToBounds = true

        imageView.image = sourceImage
        imageView.contentMode = .scaleAspectFit
        imageView.frame = CGRect(origin: .zero, size: sourceImage.size)
        scrollView.addSubview(imageView)
        scrollView.contentSize = sourceImage.size

        cropBorder.translatesAutoresizingMaskIntoConstraints = false
        cropBorder.layer.borderColor = UIColor.white.withAlphaComponent(0.85).cgColor
        cropBorder.layer.borderWidth = 1
        cropBorder.isUserInteractionEnabled = false

        [title, cancel, save, scrollView, cropBorder, hint].forEach { view.addSubview($0) }
        NSLayoutConstraint.activate([
            title.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 12),
            title.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            cancel.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 20),
            cancel.centerYAnchor.constraint(equalTo: title.centerYAnchor),
            save.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -20),
            save.centerYAnchor.constraint(equalTo: title.centerYAnchor),
            scrollView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            scrollView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            scrollView.centerYAnchor.constraint(equalTo: view.centerYAnchor),
            scrollView.heightAnchor.constraint(equalTo: scrollView.widthAnchor),
            cropBorder.leadingAnchor.constraint(equalTo: scrollView.leadingAnchor),
            cropBorder.trailingAnchor.constraint(equalTo: scrollView.trailingAnchor),
            cropBorder.topAnchor.constraint(equalTo: scrollView.topAnchor),
            cropBorder.bottomAnchor.constraint(equalTo: scrollView.bottomAnchor),
            hint.topAnchor.constraint(equalTo: scrollView.bottomAnchor, constant: 20),
            hint.centerXAnchor.constraint(equalTo: view.centerXAnchor)
        ])
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        guard !didConfigureZoom, scrollView.bounds.width > 0, sourceImage.size.width > 0, sourceImage.size.height > 0 else { return }
        didConfigureZoom = true
        let minimum = max(scrollView.bounds.width / sourceImage.size.width, scrollView.bounds.height / sourceImage.size.height)
        scrollView.minimumZoomScale = minimum
        scrollView.maximumZoomScale = max(minimum * 6, 6)
        scrollView.zoomScale = minimum
        centerInitialCrop()
    }

    private func centerInitialCrop() {
        let scaledWidth = sourceImage.size.width * scrollView.zoomScale
        let scaledHeight = sourceImage.size.height * scrollView.zoomScale
        scrollView.contentOffset = CGPoint(
            x: max(0, (scaledWidth - scrollView.bounds.width) / 2),
            y: max(0, (scaledHeight - scrollView.bounds.height) / 2)
        )
    }

    func viewForZooming(in scrollView: UIScrollView) -> UIView? { imageView }

    @objc private func closeEditor() { dismiss(animated: true) }

    @objc private func saveCrop() {
        let zoom = max(scrollView.zoomScale, 0.0001)
        var crop = CGRect(
            x: scrollView.contentOffset.x / zoom,
            y: scrollView.contentOffset.y / zoom,
            width: scrollView.bounds.width / zoom,
            height: scrollView.bounds.height / zoom
        )
        crop.origin.x = min(max(0, crop.origin.x), max(0, sourceImage.size.width - crop.width))
        crop.origin.y = min(max(0, crop.origin.y), max(0, sourceImage.size.height - crop.height))
        crop = crop.intersection(CGRect(origin: .zero, size: sourceImage.size))
        guard crop.width > 1, crop.height > 1 else { return }
        let outputSide = min(2048, max(640, Int(max(crop.width, crop.height) * sourceImage.scale)))
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        format.opaque = true
        let renderer = UIGraphicsImageRenderer(size: CGSize(width: CGFloat(outputSide), height: CGFloat(outputSide)), format: format)
        let edited = renderer.image { _ in
            let scale = CGFloat(outputSide) / crop.width
            sourceImage.draw(in: CGRect(
                x: -crop.origin.x * scale,
                y: -crop.origin.y * scale,
                width: sourceImage.size.width * scale,
                height: sourceImage.size.height * scale
            ))
        }
        guard let data = edited.jpegData(compressionQuality: 0.9) else { return }
        dismiss(animated: true) { [onSave] in onSave?(data) }
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
