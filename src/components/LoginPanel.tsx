import { X } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useEffect, useRef, useState } from "react";
import { useUI, useUser } from "@/context/AppContext";
import {
	getLoginQrcode,
	isAndroid,
	openBilibiliLogin,
	pollLoginStatus,
	refreshCurrentUser,
} from "@/hooks/useTauri";
import type { QrCodeData } from "@/types/api";

interface LoginPanelProps {
	onClose: () => void;
}

type LoginStatus =
	| "loading"
	| "waiting"
	| "confirming"
	| "finishing"
	| "expired"
	| "unavailable"
	| "error";

const statusText: Record<LoginStatus, string> = {
	loading: isAndroid ? "正在打开哔哩哔哩…" : "正在获取二维码…",
	waiting: isAndroid
		? "请在哔哩哔哩客户端确认登录，然后返回这里。"
		: "请使用哔哩哔哩客户端扫码登录。",
	confirming: isAndroid
		? "等待你在哔哩哔哩客户端确认登录。"
		: "已扫码，请在手机上确认登录。",
	finishing: "登录已确认，正在获取账号信息…",
	expired: isAndroid ? "登录请求已过期。" : "二维码已过期。",
	unavailable:
		"无法打开登录确认页，请检查是否安装了最新版哔哩哔哩或哔哩哔哩 HD。",
	error: "登录失败。",
};

export default function LoginPanel({ onClose }: LoginPanelProps) {
	const { setUser } = useUser();
	const { addLog } = useUI();
	const [attempt, setAttempt] = useState<QrCodeData | null>(null);
	const [status, setStatus] = useState<LoginStatus>("loading");
	const [errorMsg, setErrorMsg] = useState("");
	const [reopening, setReopening] = useState(false);
	const dialogRef = useRef<HTMLDialogElement>(null);

	useEffect(() => {
		const dialog = dialogRef.current;
		dialog?.showModal();
		return () => dialog?.close();
	}, []);

	useEffect(() => {
		if (status !== "loading") return;
		let cancelled = false;
		async function beginLogin() {
			try {
				const next = await getLoginQrcode();
				if (cancelled) return;

				if (isAndroid) {
					if (document.hidden) throw new Error("请返回本工具后重试登录。");
					const opened = await openBilibiliLogin(next);
					if (cancelled) return;
					if (!opened) {
						setStatus("unavailable");
						return;
					}
				}

				setAttempt(next);
				setStatus("waiting");
			} catch (cause) {
				if (cancelled) return;
				setStatus("error");
				setErrorMsg(cause instanceof Error ? cause.message : String(cause));
			}
		}
		void beginLogin();
		return () => {
			cancelled = true;
		};
	}, [status]);

	useEffect(() => {
		if (!attempt) return;
		const key = attempt.qrcode_key;
		let stopped = false;
		let inFlight = false;
		let timer: number | undefined;

		async function poll() {
			if (stopped || inFlight || (isAndroid && document.hidden)) return;
			window.clearTimeout(timer);
			inFlight = true;

			try {
				const { code } = await pollLoginStatus(key);
				if (stopped) return;

				switch (code) {
					case 0: {
						setStatus("finishing");
						const user = await refreshCurrentUser();
						if (stopped) return;
						stopped = true;
						setUser(user);
						addLog(`登录成功：${user.uname}`);
						onClose();
						return;
					}
					case 86038:
						stopped = true;
						setStatus("expired");
						return;
					case 86090:
						setStatus("confirming");
						break;
					case 86101:
						setStatus("waiting");
						break;
					default:
						throw new Error(`哔哩哔哩返回登录状态 ${code}，请重试。`);
				}
				timer = window.setTimeout(poll, 3000);
			} catch (cause) {
				if (stopped) return;
				stopped = true;
				setStatus("error");
				setErrorMsg(cause instanceof Error ? cause.message : String(cause));
			} finally {
				inFlight = false;
			}
		}

		void poll();
		if (isAndroid) {
			document.addEventListener("visibilitychange", poll);
			window.addEventListener("focus", poll);
		}
		return () => {
			stopped = true;
			window.clearTimeout(timer);
			document.removeEventListener("visibilitychange", poll);
			window.removeEventListener("focus", poll);
		};
	}, [addLog, attempt, onClose, setUser]);

	const retry = () => {
		setAttempt(null);
		setStatus("loading");
		setErrorMsg("");
	};

	const reopen = async () => {
		if (!attempt || reopening) return;
		setReopening(true);
		setErrorMsg("");
		try {
			if (!(await openBilibiliLogin(attempt))) {
				setErrorMsg(statusText.unavailable);
			}
		} catch (cause) {
			setErrorMsg(cause instanceof Error ? cause.message : String(cause));
		} finally {
			setReopening(false);
		}
	};

	const awaitingConfirmation = status === "waiting" || status === "confirming";

	return (
		<dialog
			ref={dialogRef}
			aria-labelledby="login-title"
			onCancel={(event) => {
				event.preventDefault();
				if (status !== "finishing") onClose();
			}}
			className="fixed inset-0 m-auto w-[calc(100%-2rem)] max-w-xs max-h-[calc(100%-2rem)] overflow-y-auto rounded-xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 p-5 text-stone-800 dark:text-stone-100 shadow-2xl backdrop:bg-black/50"
		>
			<header className="flex items-center justify-between gap-2">
				<h3 id="login-title" className="text-base font-semibold">
					{isAndroid ? "哔哩哔哩登录" : "扫码登录"}
				</h3>
				<button
					type="button"
					onClick={onClose}
					disabled={status === "finishing"}
					aria-label="关闭登录"
					className="flex h-10 w-10 items-center justify-center rounded-lg text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800 disabled:opacity-50"
				>
					<X size={18} />
				</button>
			</header>
			<p className="text-sm text-stone-600 dark:text-stone-400" role="status">
				{statusText[status]}
			</p>
			{!isAndroid && awaitingConfirmation && attempt && (
				<div className="mx-auto mt-4 w-fit rounded-lg bg-white p-3">
					<QRCodeSVG value={attempt.url} size={152} title="登录二维码" />
				</div>
			)}
			{errorMsg && (
				<p
					role="alert"
					className="mt-3 break-words text-sm text-red-600 dark:text-red-400"
				>
					{errorMsg}
				</p>
			)}
			{isAndroid && awaitingConfirmation && (
				<button
					type="button"
					onClick={reopen}
					disabled={reopening}
					className="mt-4 w-full min-h-11 rounded-lg border border-stone-200 dark:border-stone-700 px-3 text-sm disabled:opacity-50"
				>
					{reopening ? "正在打开…" : "再次打开哔哩哔哩"}
				</button>
			)}
			{(status === "expired" ||
				status === "unavailable" ||
				status === "error") && (
				<button
					type="button"
					onClick={retry}
					disabled={reopening}
					className="mt-4 w-full min-h-11 rounded-lg bg-[#D4652A] px-3 text-sm font-medium text-white disabled:opacity-50"
				>
					{isAndroid ? "重试登录" : "刷新二维码"}
				</button>
			)}
		</dialog>
	);
}
