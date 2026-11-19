use serde::{Deserialize, Serialize};
use tauri::plugin::{Builder, PluginHandle, TauriPlugin};
use tauri::{Manager, State, Wry};

pub struct BilibiliApp(PluginHandle<Wry>);

pub fn plugin() -> TauriPlugin<Wry> {
    Builder::new("bilibili-app")
        .setup(|app, api| {
            let handle =
                api.register_android_plugin("com.bilistreamer.app", "BilibiliAppPlugin")?;
            app.manage(BilibiliApp(handle));
            Ok(())
        })
        .build()
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
enum LaunchStatus {
    VerificationPage,
    AppHome,
    Unavailable,
}

#[derive(Deserialize, Serialize)]
pub struct LaunchResult {
    status: LaunchStatus,
}

#[tauri::command]
pub async fn open_face_verification(
    url: Option<String>,
    app: State<'_, BilibiliApp>,
) -> Result<LaunchResult, String> {
    app.0
        .run_mobile_plugin_async("openFaceVerification", serde_json::json!({ "url": url }))
        .await
        .map_err(|e| e.to_string())
}

#[derive(Deserialize, Serialize)]
pub struct LoginLaunchResult {
    opened: bool,
}

#[tauri::command]
pub async fn open_bilibili_login(
    url: String,
    key: String,
    app: State<'_, BilibiliApp>,
) -> Result<LoginLaunchResult, String> {
    app.0
        .run_mobile_plugin_async("openLogin", serde_json::json!({ "url": url, "key": key }))
        .await
        .map_err(|e| e.to_string())
}
