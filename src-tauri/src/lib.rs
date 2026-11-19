#[cfg(target_os = "android")]
mod android;
#[cfg(desktop)]
mod desktop;

pub mod commands;
pub mod models;
pub mod services;
pub mod state;
pub mod utils;

use services::bili_api::BiliApi;
use services::config_store::ConfigStore;
use services::danmaku_ws::DanmakuService;
use services::live_service::LiveService;
use services::user_service::UserService;
use state::{AppState, SessionState};
use std::sync::atomic::AtomicBool;
use std::sync::Arc;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(target_os = "linux")]
    {
        let value = match ConfigStore::new() {
            Ok(mut config) => {
                if config.data().disable_dmabuf_renderer.is_none()
                    || config.data().disable_dmabuf_renderer.is_some_and(|x| x)
                {
                    config.data_mut().disable_dmabuf_renderer = Some(true);
                    let _ = config.save();
                    "1"
                } else {
                    "0"
                }
            }
            Err(_) => "1",
        };
        std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", value);
    }

    tracing_subscriber::fmt()
        .with_file(true)
        .with_line_number(true)
        .with_target(false)
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info")),
        )
        .init();
    let builder = tauri::Builder::default();
    #[cfg(desktop)]
    let builder = builder
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .on_window_event(desktop::on_window_event);
    #[cfg(target_os = "android")]
    let builder = builder.plugin(android::plugin());

    let app = builder
        .setup(|app| {
            #[cfg(desktop)]
            let config = ConfigStore::new()?;
            #[cfg(mobile)]
            let config = ConfigStore::in_directory(&app.path().app_config_dir()?)?;
            let api = BiliApi::new()?;
            let mut session = SessionState::default();
            UserService::init_current_user(&config, &mut session, &api);
            let api = Arc::new(api);
            let danmaku = DanmakuService::new(api.clone(), app.handle().clone());

            app.manage(AppState {
                config: tokio::sync::Mutex::new(config),
                session: tokio::sync::Mutex::new(session),
                api,
                danmaku: tokio::sync::Mutex::new(Some(danmaku)),
                live: tokio::sync::Mutex::new(LiveService::new()),
                exiting: AtomicBool::new(false),
                cleanup_complete: tokio::sync::Notify::new(),
            });

            #[cfg(desktop)]
            desktop::setup(app)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::auth::get_login_qrcode,
            commands::auth::poll_login_status,
            commands::user::load_saved_config,
            commands::user::refresh_current_user,
            commands::user::get_account_list,
            commands::user::switch_account,
            commands::user::logout,
            commands::user::clear_session,
            commands::live::get_partitions,
            commands::live::update_title,
            commands::live::update_area,
            commands::live::start_live,
            commands::live::stop_live,
            commands::danmaku::start_danmaku_monitor,
            commands::danmaku::stop_danmaku_monitor,
            commands::danmaku::send_danmaku,
            commands::danmaku::get_emote_list,
            #[cfg(desktop)]
            commands::window::window_min,
            #[cfg(desktop)]
            commands::window::window_max,
            #[cfg(desktop)]
            commands::window::window_close,
            #[cfg(desktop)]
            commands::window::window_drag,
            #[cfg(desktop)]
            commands::window::set_window_background,
            #[cfg(desktop)]
            commands::window::open_danmaku_float,
            #[cfg(desktop)]
            commands::window::close_danmaku_float,
            commands::config::get_app_config,
            commands::config::set_app_config,
            commands::config::get_version,
            #[cfg(target_os = "android")]
            android::open_face_verification,
            #[cfg(target_os = "android")]
            android::open_bilibili_login,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    #[cfg(desktop)]
    app.run(desktop::on_run_event);
    #[cfg(mobile)]
    app.run(|_, _| {});
}
