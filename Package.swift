// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "PushcashcoCapacitor",
    platforms: [.iOS(.v15)],
    products: [
        .library(
            name: "PushcashcoCapacitor",
            targets: ["PushApplePayPlugin"])
    ],
    dependencies: [
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", from: "7.0.0")
    ],
    targets: [
        .target(
            name: "PushApplePayCore",
            path: "ios/Sources/PushApplePayCore"),
        .target(
            name: "PushApplePayPlugin",
            dependencies: [
                "PushApplePayCore",
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "Cordova", package: "capacitor-swift-pm")
            ],
            path: "ios/Sources/PushApplePayPlugin"),
        .testTarget(
            name: "PushApplePayCoreTests",
            dependencies: ["PushApplePayCore"],
            path: "ios/Tests/PushApplePayCoreTests"),
        .testTarget(
            name: "PushApplePayPluginTests",
            dependencies: ["PushApplePayPlugin"],
            path: "ios/Tests/PushApplePayPluginTests")
    ]
)