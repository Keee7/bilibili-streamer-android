

简体中文 | [English](README_EN.md)

# 哔哩哔哩直播工具

基于 [Tauri](https://tauri.app/) 重构的 B 站第三方直播推流工具，支持账号登录、获取推流码、弹幕监控与发送。

![主界面](screenshot-stream.png)

## 功能

1. 登录 B 站账号，支持多账号切换。安卓端跳转哔哩哔哩客户端确认，桌面端使用扫码登录；
2. 获取第三方推流码（RTMP / SRT），可直接在 OBS 等软件中直播；
3. 支持开播时设置标题与分区；
4. 弹幕监控（含弹幕、进场、礼物消息）以及发送弹幕；
5. 系统托盘与关闭到托盘；
6. 跟随系统的深色/浅色主题。

## 技术栈

- **桌面框架**: Tauri 2.x (Rust)
- **前端**: React 18 + TypeScript + Vite + Tailwind CSS
- **后端**: Rust (Tokio async runtime)
- **目标平台**: macOS / Windows / Linux / Android

## 下载安装

### macOS

1. 前往 [Releases](https://github.com/Keee7/bilibili-streamer-android/releases/latest) 页面下载最新版 `.dmg`；
2. 双击打开 `.dmg`，将 `Bilibili-Streamer.app` 拖入 **应用程序** 文件夹；
3. 首次运行时若提示"无法打开"，前往 **系统设置 → 隐私与安全性**，点击 **仍要打开**。

### Windows & Linux

1. 前往 [Releases](https://github.com/Keee7/bilibili-streamer-android/releases/latest) 页面下载对应平台的安装包（Windows 为 `.msi` 或 `.exe`，Linux 为 `.AppImage`）；
2. 按系统提示完成安装，或右键 `.AppImage` 选择 **属性 → 允许作为程序执行** 后双击运行。

## 使用教程

1. 登录 B 站账号；
2. 填写标题并选择分区（首次使用需要点击 `同步`）；
3. 点击 `开始直播` 来开始直播；
4. 在 **推流码** 区域复制链接和推流码至第三方推流工具；
5. 在 **弹幕** 界面可以查看并发送弹幕；
6. 点击 `停止直播` 或关闭软件来停止直播，**使用 OBS 的 `停止直播` 并不会停止直播**。

## 自行构建

### 环境要求

- **Rust**: 当前稳定版（建议通过 [rustup](https://rustup.rs/) 安装）
- **Node.js**: 20.19+ 或 22.12+

### 开发模式

```bash
# 安装前端依赖
npm install

# 启动 Tauri dev（同时启动 Vite dev server + Rust 编译）
npm run tauri-dev
```

### 生产构建

```bash
# 构建前端 + Rust 并打包为平台原生安装包
npm run tauri-build
```

输出产物位于 `src-tauri/target/release/bundle/`：

- **macOS**: `.dmg` / `.app`
- **Windows**: `.msi` / `.exe`
- **Linux**: `.AppImage`

### Android

安卓版支持 Android 7.0 及以上。界面按可用窗口宽度切换布局，窄屏使用底部导航，宽屏使用侧栏，平板横屏可并排查看直播设置和推流信息。

准备 JDK 17、Android SDK Platform 36、Platform-Tools、Build-Tools 和 NDK 28.2.13676358，按 [Tauri 的 Android 环境说明](https://v2.tauri.app/start/prerequisites/#android) 配置 `JAVA_HOME`、`ANDROID_HOME`、`NDK_HOME`。Android 工程已包含在仓库中。

在 Windows 上，请开启[开发人员模式](https://learn.microsoft.com/windows/advanced-settings/developer-mode)，以便 Tauri 在打包时创建原生库的符号链接。

```bash
rustup target add aarch64-linux-android
npm install
npm run tauri -- android build --debug --apk --target aarch64
```

调试 APK 位于 `src-tauri/gen/android/app/build/outputs/apk/` 下，可用 `adb install` 安装到 ARM64 手机或平板。也可以通过 `npm run tauri -- android dev` 在已连接的开发设备上运行。

在安卓端点击头像登录时，工具会在同一设备上尝试打开哔哩哔哩大陆版或 HD 客户端的登录确认页。使用已登录的哔哩哔哩账号确认后，返回工具即可完成登录。

开播要求人脸认证时，安卓版会在哔哩哔哩客户端打开认证页。请使用同一账号完成验证，返回本工具后会重新检查开播结果。客户端未安装、无法打开认证页时，可用另一台设备扫描人脸认证二维码。推流端仍使用 RTMP 或 SRT 地址和推流码。

### CI 和发布签名

推送到 `master` 或发起 Pull Request 时，GitHub Actions 会构建前端。手动运行 **CI and Release** 会由 CI 构建、签名并校验 ARM64 APK，可从运行记录的 Artifacts 下载。推送版本标签后，安卓 APK 和桌面安装包全部构建成功才会发布 Release。标签版本须与 `package.json`、`src-tauri/tauri.conf.json` 和 `src-tauri/Cargo.toml` 一致。

| Actions Secret | 用途 |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | Android 发布 keystore 文件的 Base64 内容 |
| `ANDROID_STORE_PASSWORD` | Android keystore 密码 |
| `TAURI_SIGNING_PRIVATE_KEY` | 与 `tauri.conf.json` 中公钥配对的桌面更新签名私钥 |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | 桌面更新签名私钥的密码 |

Android 密钥别名默认为 `bilibili-streamer`，可通过 Actions 变量 `ANDROID_KEY_ALIAS` 指定。如果密钥密码和 keystore 密码不同，另设 `ANDROID_KEY_PASSWORD` Secret。

## 致谢

本项目基于 [ChaceQC/bilibili_live_stream_code](https://github.com/ChaceQC/bilibili_live_stream_code) 进行重构，感谢原作者的基础实现与开源贡献。

## License

[Apache License 2.0](LICENSE.txt)
