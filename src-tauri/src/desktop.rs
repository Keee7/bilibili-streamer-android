use crate::services::float_geometry::{self, WindowGeometry};
use crate::services::live_session::LiveSession;
use crate::state::AppState;
use std::sync::atomic::Ordering;
use tauri::{Emitter, Manager, RunEvent, Window, WindowEvent};

async fn cleanup_and_exit(app_handle: tauri::AppHandle) {
    let state = app_handle.state::<AppState>();
    if state.exiting.swap(true, Ordering::SeqCst) {
        // Another task is already cleaning up; wait for it and exit
        let _ = tokio::time::timeout(
            std::time::Duration::from_secs(10),
            state.cleanup_complete.notified(),
        )
        .await;
        app_handle.exit(0);
        return;
    }

    let live_session = LiveSession::new(&state);
    let cleanup_fut = live_session.shutdown_cleanup();

    let _ = tokio::time::timeout(std::time::Duration::from_secs(10), cleanup_fut).await;
    state.cleanup_complete.notify_waiters();
    app_handle.exit(0);
}

pub fn setup(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    // System tray
    let show_i = tauri::menu::MenuItem::with_id(app, "show", "显示主界面", true, None::<&str>)?;
    let start_i = tauri::menu::MenuItem::with_id(app, "start", "开始直播", true, None::<&str>)?;
    let stop_i = tauri::menu::MenuItem::with_id(app, "stop", "停止直播", true, None::<&str>)?;
    let sep = tauri::menu::PredefinedMenuItem::separator(app)?;
    let quit_i = tauri::menu::MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
    let menu = tauri::menu::Menu::with_items(app, &[&show_i, &start_i, &stop_i, &sep, &quit_i])?;

    #[cfg(target_os = "macos")]
    let tray_icon = tauri::image::Image::from_bytes(include_bytes!("../icons/tray-icon-macos.png"))
        .expect("Failed to load macOS tray icon");
    #[cfg(not(target_os = "macos"))]
    let tray_icon = app
        .default_window_icon()
        .ok_or("No default window icon set")?
        .clone();

    tauri::tray::TrayIconBuilder::with_id("main-tray")
        .icon(tray_icon)
        .icon_as_template(cfg!(target_os = "macos"))
        .tooltip("Bilibili-Streamer")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => {
                if let Some(win) = app.get_webview_window("main") {
                    if let Err(e) = win.show() {
                        tracing::warn!("Failed to show window: {}", e);
                    }
                    if let Err(e) = win.set_focus() {
                        tracing::warn!("Failed to focus window: {}", e);
                    }
                }
            }
            "start" => {
                let _ = app.emit("tray-start-live", ());
            }
            "stop" => {
                let _ = app.emit("tray-stop-live", ());
            }
            "quit" => {
                let handle = app.clone();
                tauri::async_runtime::spawn(async move {
                    cleanup_and_exit(handle).await;
                });
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            use tauri::tray::{MouseButton, MouseButtonState, TrayIconEvent};
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
                if let Some(win) = app.get_webview_window("main") {
                    if let Err(e) = win.unminimize() {
                        tracing::warn!("Failed to unminimize window: {}", e);
                    }
                    if let Err(e) = win.show() {
                        tracing::warn!("Failed to show window: {}", e);
                    }
                    if let Err(e) = win.set_focus() {
                        tracing::warn!("Failed to focus window: {}", e);
                    }
                }
            }
        })
        .build(app)?;

    let handle = app.handle().clone();
    tauri::async_runtime::spawn(async move {
        if let Err(e) = tokio::signal::ctrl_c().await {
            tracing::error!("Failed to listen for Ctrl+C: {}", e);
            return;
        }
        tracing::info!("Ctrl+C received, shutting down gracefully...");
        cleanup_and_exit(handle).await;
    });

    Ok(())
}

pub fn on_window_event(window: &Window, event: &WindowEvent) {
    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
        if window.label() == "danmaku-float" {
            api.prevent_close();
            let handle = window.app_handle().clone();
            let window_clone = window.clone();
            tauri::async_runtime::spawn(async move {
                if let Ok((x, y, w, h)) = window_clone.float_geometry() {
                    let state = handle.state::<AppState>();
                    float_geometry::save_geometry(&state.config, x, y, w, h).await;
                }
                let _ = window_clone.destroy();
            });
            return;
        }

        let handle = window.app_handle().clone();
        let window_clone = window.clone();
        api.prevent_close();
        tauri::async_runtime::spawn(async move {
            let state = handle.state::<AppState>();
            if state.exiting.load(Ordering::SeqCst) {
                return;
            }
            let config = state.config.lock().await;
            let min_to_tray = config.data().min_to_tray;
            drop(config);
            if min_to_tray {
                if let Err(e) = window_clone.hide() {
                    tracing::warn!("Failed to hide window: {}", e);
                }
            } else {
                cleanup_and_exit(handle).await;
            }
        });
    }
}

pub fn on_run_event(app_handle: &tauri::AppHandle, event: RunEvent) {
    match event {
        tauri::RunEvent::ExitRequested { api, .. } => {
            let state = app_handle.state::<AppState>();
            if state.exiting.load(Ordering::SeqCst) {
                return;
            }
            api.prevent_exit();
            let handle = app_handle.clone();
            tauri::async_runtime::spawn(async move {
                cleanup_and_exit(handle).await;
            });
        }
        // macOS: clicking the Dock icon when no window is visible
        #[cfg(target_os = "macos")]
        tauri::RunEvent::Reopen {
            has_visible_windows: false,
            ..
        } => {
            if let Some(win) = app_handle.get_webview_window("main") {
                if let Err(e) = win.show() {
                    tracing::warn!("Failed to show window on dock reopen: {}", e);
                }
                if let Err(e) = win.set_focus() {
                    tracing::warn!("Failed to focus window on dock reopen: {}", e);
                }
            }
        }
        _ => {}
    }
}
