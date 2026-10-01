# Build 162: notification extension provisioning profile

The supplied `turtlekeeper-app_162_artifacts.zip` contains `App.log`. The Xcode archive failed with:

```text
"TurtleNotificationService" requires a provisioning profile.
```

This identifies a missing extension signing profile. It does not establish a Swift compilation error. Build 163 being queued was a separate state. The version remains 1.1.2 (121); the failed archive did not upload an IPA.

## One-time Apple / Codemagic setup

1. Open https://developer.apple.com/account/resources/identifiers/list . Check whether the explicit App ID `com.turtlekeeper.app.NotificationService` exists. If missing, add an **App ID / App**, description `Turtle Notification Service`, with that exact bundle identifier. It is an extension of the existing app, not a second App Store app listing. The notification service itself does not need the main app's Push Notifications or Associated Domains capabilities.
2. Open https://developer.apple.com/account/resources/profiles/list . Create a distribution provisioning profile of type **App Store Connect** (called **App Store** in some screens), select the extension App ID, and select the **existing Apple Distribution certificate used by the main app in Codemagic**. Name the profile `TurtleNotificationService AppStore`, generate and download it. Reuse the existing distribution certificate; a new certificate/private key is unnecessary.
3. In Codemagic, open the account/team settings that own this app, **codemagic.yaml settings → Code signing identities → iOS provisioning profiles**. Upload the downloaded `.mobileprovision`, or use **Fetch profiles** to fetch the new profile through the existing Apple integration. Choose a unique reference name such as `turtle_notification_appstore`.
4. Confirm the uploaded profile shows bundle identifier `com.turtlekeeper.app.NotificationService`, App Store type, the same team as the main app, a future expiry date, and a green certificate match. Keep the existing main app profile and certificate.
5. Push the code changes, then start a new `main` / `iOS TestFlight` build. An already queued build uses its original commit and signing setup; use the new commit for the retry.

Official Codemagic documentation: https://docs.codemagic.io/yaml-code-signing/signing-ios/ . The existing `distribution_type: app_store` plus `bundle_identifier: com.turtlekeeper.app` selects uploaded main and child-extension profiles. It does not create a missing extension profile.

## Code change and verification boundary

`Apply signing profiles` now stops on a failed preflight, checks installed App Store profiles and valid private-key identities, applies only App Store profiles, and checks Release signing plus both export mappings before `Build IPA`. Missing, expired, wrong-type, different-team or incompatible-certificate profiles produce an actionable error instead of being hidden behind exit code 65. The checker does not create, revoke, export or print credentials.

`node scripts/test-ios-signing.cjs` reproduces the main-profile-only failure using synthetic fixtures, and checks valid main/extension pairs and signing failure cases. Windows tests cannot validate the real Apple profile or compile/sign an IPA. Creating the profile in Apple and adding it in Codemagic is still required; the code changes alone do not fix the missing credential.

After the next cloud build succeeds, test the actual TestFlight build on an iPhone: notification title, image attachment, tap to the recommended post, and short-edge-swipe return. No server deployment or production update-policy change is required for this signing fix.
