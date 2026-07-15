import UIKit
import Capacitor
import MuxUploadSDK

@objc(MuxVideoUploadPlugin)
public class MuxVideoUploadPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "MuxVideoUploadPlugin"
    public let jsName = "MuxVideoUpload"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "upload", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "cancel", returnType: CAPPluginReturnPromise),
    ]

    private var uploads: [String: DirectUpload] = [:]
    private var uploadCalls: [String: CAPPluginCall] = [:]

    @objc public func upload(_ call: CAPPluginCall) {
        guard
            let uploadId = call.getString("uploadId"), !uploadId.isEmpty,
            let uploadUrlValue = call.getString("uploadUrl"),
            let uploadURL = URL(string: uploadUrlValue),
            let filePath = call.getString("filePath"), !filePath.isEmpty
        else {
            call.reject("A Mux upload ID, upload URL, and local video path are required.")
            return
        }

        let fileURL: URL
        if let parsed = URL(string: filePath), parsed.isFileURL {
            fileURL = parsed
        } else {
            fileURL = URL(fileURLWithPath: filePath)
        }

        guard FileManager.default.fileExists(atPath: fileURL.path) else {
            call.reject("The selected video is no longer available on this device.")
            return
        }

        DispatchQueue.main.async {
            guard self.uploads[uploadId] == nil else {
                call.reject("This video is already uploading.")
                return
            }

            let upload = DirectUpload(
                uploadURL: uploadURL,
                inputFileURL: fileURL
            )

            self.uploads[uploadId] = upload
            self.uploadCalls[uploadId] = call

            upload.progressHandler = { [weak self] state in
                guard
                    let progress = state.progress,
                    progress.totalUnitCount > 0
                else {
                    return
                }
                let percent = progress.fractionCompleted * 100
                DispatchQueue.main.async {
                    self?.notifyListeners("progress", data: [
                        "uploadId": uploadId,
                        "percent": percent,
                    ])
                }
            }

            upload.resultHandler = { [weak self] result in
                DispatchQueue.main.async {
                    guard let self = self else {
                        return
                    }
                    let pendingCall = self.uploadCalls.removeValue(forKey: uploadId)
                    self.uploads.removeValue(forKey: uploadId)

                    switch result {
                    case .success:
                        pendingCall?.resolve()
                    case .failure(let error):
                        pendingCall?.reject(error.localizedDescription)
                    }
                }
            }

            upload.start()
        }
    }

    @objc public func cancel(_ call: CAPPluginCall) {
        guard let uploadId = call.getString("uploadId"), !uploadId.isEmpty else {
            call.reject("A Mux upload ID is required.")
            return
        }

        DispatchQueue.main.async {
            self.uploads[uploadId]?.cancel()
            call.resolve()
        }
    }
}

@objc(MainViewController)
class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(MuxVideoUploadPlugin())
    }
}

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Override point for customization after application launch.
        return true
    }

    func applicationWillResignActive(_ application: UIApplication) {
        // Sent when the application is about to move from active to inactive state. This can occur for certain types of temporary interruptions (such as an incoming phone call or SMS message) or when the user quits the application and it begins the transition to the background state.
        // Use this method to pause ongoing tasks, disable timers, and invalidate graphics rendering callbacks. Games should use this method to pause the game.
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // Use this method to release shared resources, save user data, invalidate timers, and store enough application state information to restore your application to its current state in case it is terminated later.
        // If your application supports background execution, this method is called instead of applicationWillTerminate: when the user quits.
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Called as part of the transition from the background to the active state; here you can undo many of the changes made on entering the background.
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        // Restart any tasks that were paused (or not yet started) while the application was inactive. If the application was previously in the background, optionally refresh the user interface.
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate. Save data if appropriate. See also applicationDidEnterBackground:.
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        // Called when the app was launched with a url. Feel free to add additional processing here,
        // but if you want the App API to support tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        // Called when the app was launched with an activity, including Universal Links.
        // Feel free to add additional processing here, but if you want the App API to support
        // tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        NotificationCenter.default.post(name: .capacitorDidRegisterForRemoteNotifications, object: deviceToken)
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)
    }

}
