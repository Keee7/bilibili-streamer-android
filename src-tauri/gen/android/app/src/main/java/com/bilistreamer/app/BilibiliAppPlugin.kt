package com.bilistreamer.app

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import app.tauri.annotation.Command
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin

private val BILIBILI_PACKAGES = listOf("tv.danmaku.bili", "tv.danmaku.bilibilihd")
private const val VERIFICATION_PATH = "/blackboard/live/face-auth-middle.html"

@TauriPlugin
class BilibiliAppPlugin(private val activity: Activity) : Plugin(activity) {
    @Command
    fun openLogin(invoke: Invoke) {
        val args = invoke.getArgs()
        val page = Uri.parse(args.optString("url"))
        val key = args.optString("key")
        val isLoginPage = when (page.encodedAuthority) {
            "account.bilibili.com" -> page.encodedPath == "/h5/account-h5/auth/scan-web"
            "passport.bilibili.com" -> page.encodedPath == "/h5-app/passport/login/scan"
            else -> false
        }
        if (page.scheme != "https" || !isLoginPage || key.isBlank() ||
            page.getQueryParameters("qrcode_key") != listOf(key)
        ) {
            invoke.reject("哔哩哔哩返回了无法识别的登录链接")
            return
        }
        invoke.resolve(JSObject().apply { put("opened", openBilibiliPage(page)) })
    }

    @Command
    fun openFaceVerification(invoke: Invoke) {
        val verificationPage = Uri.parse(invoke.getArgs().optString("url"))
        val status = when {
            openVerificationPage(verificationPage) -> "verificationPage"
            BILIBILI_PACKAGES.any { launch(activity.packageManager.getLaunchIntentForPackage(it)) } -> "appHome"
            else -> "unavailable"
        }
        invoke.resolve(JSObject().apply { put("status", status) })
    }

    private fun openVerificationPage(page: Uri): Boolean {
        if (page.scheme != "https" || page.encodedAuthority != "www.bilibili.com" ||
            page.encodedPath != VERIFICATION_PATH
        ) {
            return false
        }

        return openBilibiliPage(page)
    }

    private fun openBilibiliPage(page: Uri): Boolean {
        val inAppPage = Uri.Builder()
            .scheme("bilibili")
            .authority("browser")
            .path("/")
            .appendQueryParameter("url", page.toString())
            .build()
        val links = listOf(inAppPage, page)
        return BILIBILI_PACKAGES.any { packageName ->
            links.any { link ->
                launch(Intent(Intent.ACTION_VIEW, link)
                    .addCategory(Intent.CATEGORY_BROWSABLE)
                    .setPackage(packageName))
            }
        }
    }

    private fun launch(intent: Intent?): Boolean {
        if (intent == null) return false
        return try {
            activity.startActivity(intent)
            true
        } catch (_: ActivityNotFoundException) {
            false
        } catch (_: SecurityException) {
            false
        }
    }
}
