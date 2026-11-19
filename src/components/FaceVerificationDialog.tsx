import { X } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
	type FaceVerificationLaunch,
	isAndroid,
	openFaceVerification,
	startLive,
} from "@/hooks/useTauri";
import type { StreamCodeData } from "@/types/api";

export interface FaceVerification {
	uid: number;
	parentArea?: string;
	subArea?: string;
	qr?: string;
}

interface Props {
	verification: FaceVerification;
	onSuccess: (data: StreamCodeData) => void;
	onClose: () => void;
}

export default function FaceVerificationDialog({
	verification,
	onSuccess,
	onClose,
}: Props) {
	const { uid, parentArea, subArea } = verification;
	const [qr, setQr] = useState(verification.qr);
	const [launchStatus, setLaunchStatus] = useState<FaceVerificationLaunch>();
	const [launching, setLaunching] = useState(false);
	const [showQr, setShowQr] = useState(!isAndroid);
	const [checking, setChecking] = useState(false);
	const [error, setError] = useState("");
	const dialog = useRef<HTMLDialogElement>(null);
	const attemptedLaunch = useRef(false);
	const checkingRef = useRef(false);

	const launch = useCallback(async () => {
		setLaunching(true);
		try {
			const status = await openFaceVerification(qr);
			setLaunchStatus(status);
			if (status !== "verificationPage") setShowQr(true);
		} catch {
			setLaunchStatus("unavailable");
			setShowQr(true);
		} finally {
			setLaunching(false);
		}
	}, [qr]);

	useEffect(() => {
		const element = dialog.current;
		element?.showModal();
		return () => element?.close();
	}, []);

	useEffect(() => {
		if (isAndroid && !attemptedLaunch.current && !document.hidden) {
			attemptedLaunch.current = true;
			void launch();
		}
	}, [launch]);

	const check = useCallback(async () => {
		if (checkingRef.current || document.hidden) return;
		checkingRef.current = true;
		setChecking(true);
		try {
			const result = await startLive(parentArea, subArea, uid);
			if (result.code === 0 && result.data) {
				onSuccess(result.data);
			} else if (result.code === 60024 || result.code === 60043) {
				setError("");
				setQr((original) => original || result.qr || undefined);
			} else {
				setError(result.msg || "暂时无法开播，请重试。");
			}
		} catch (cause) {
			setError(`检查失败：${cause}`);
		} finally {
			checkingRef.current = false;
			setChecking(false);
		}
	}, [onSuccess, parentArea, subArea, uid]);

	useEffect(() => {
		if (error) return;
		const timer = window.setInterval(check, 5000);
		document.addEventListener("visibilitychange", check);
		return () => {
			window.clearInterval(timer);
			document.removeEventListener("visibilitychange", check);
		};
	}, [check, error]);

	const instructions = {
		verificationPage: "请在哔哩哔哩中用同一个账号完成认证，再返回这里。",
		appHome: "已打开哔哩哔哩。若未出现认证页，可用另一台设备扫描下方二维码。",
		unavailable: "无法打开哔哩哔哩，请安装客户端或用另一台设备扫码。",
	};

	return createPortal(
		<dialog
			ref={dialog}
			aria-labelledby="face-verification-title"
			onCancel={(event) => {
				event.preventDefault();
				if (!checkingRef.current) onClose();
			}}
			className="fixed inset-0 m-auto w-[calc(100%-2rem)] max-w-sm max-h-[calc(100%-2rem)] overflow-y-auto rounded-xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 p-5 text-stone-800 dark:text-stone-100 shadow-2xl backdrop:bg-black/50"
		>
			<header className="flex items-center justify-between gap-2">
				<h3 id="face-verification-title" className="text-base font-semibold">
					人脸认证
				</h3>
				<button
					type="button"
					aria-label="关闭人脸认证"
					onClick={onClose}
					disabled={checking}
					className="flex h-10 w-10 items-center justify-center rounded-lg text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800 disabled:opacity-50"
				>
					<X size={18} />
				</button>
			</header>
			<p
				className="mb-4 text-sm text-stone-600 dark:text-stone-400"
				role="status"
			>
				{isAndroid
					? launchStatus
						? instructions[launchStatus]
						: "请使用哔哩哔哩客户端完成认证。"
					: "请使用哔哩哔哩客户端扫码完成认证。"}
			</p>
			{isAndroid && (
				<button
					type="button"
					onClick={launch}
					disabled={launching || checking}
					className="w-full min-h-11 rounded-lg bg-[#D4652A] px-3 text-sm font-medium text-white disabled:opacity-50"
				>
					{launching ? "正在打开…" : "打开哔哩哔哩"}
				</button>
			)}
			{qr &&
				(showQr ? (
					<div className="mx-auto my-4 w-fit rounded-lg bg-white p-3">
						<QRCodeSVG value={qr} size={152} title="人脸认证二维码" />
					</div>
				) : (
					<button
						type="button"
						onClick={() => setShowQr(true)}
						className="mt-1 w-full min-h-11 text-sm text-stone-600 dark:text-stone-400"
					>
						改用另一台设备扫码
					</button>
				))}
			{!qr && showQr && (
				<p className="mt-3 text-sm text-stone-500">
					暂未收到二维码，可关闭后重新开始直播。
				</p>
			)}
			{error && (
				<p
					className="mt-3 break-words text-sm text-red-600 dark:text-red-400"
					role="alert"
				>
					{error}
				</p>
			)}
			<button
				type="button"
				onClick={check}
				disabled={checking || launching}
				className="mt-3 w-full min-h-11 rounded-lg border border-stone-200 dark:border-stone-700 px-3 text-sm disabled:opacity-50"
			>
				{checking ? "正在检查…" : "检查认证并开播"}
			</button>
		</dialog>,
		document.body,
	);
}
