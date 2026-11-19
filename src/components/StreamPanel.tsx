import { Copy } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import FaceVerificationDialog, {
	type FaceVerification,
} from "@/components/FaceVerificationDialog";
import { useLive, useUI, useUser } from "@/context/AppContext";
import {
	getPartitions,
	startLive,
	stopLive,
	updateArea,
	updateTitle,
} from "@/hooks/useTauri";
import type {
	StreamCodeData,
	StreamProtocolType,
	UserConfig,
} from "@/types/api";

const PROTOCOL_OPTIONS: { value: StreamProtocolType; label: string }[] = [
	{ value: "rtmp1", label: "RTMP" },
	{ value: "rtmp2", label: "RTMP2" },
	{ value: "srt", label: "SRT" },
];

export default function StreamPanel() {
	const { user, setUser } = useUser();
	const {
		isLive,
		setIsLive,
		streamCode,
		setStreamCode,
		selectedProtocol,
		setSelectedProtocol,
	} = useLive();
	const { addLog } = useUI();
	const [title, setTitle] = useState(user?.last_title ?? "");
	const [partitions, setPartitions] = useState<Record<string, string[]>>({});
	const [parentArea, setParentArea] = useState("");
	const [subArea, setSubArea] = useState("");
	const [verification, setVerification] = useState<FaceVerification | null>(
		null,
	);
	const [starting, setStarting] = useState(false);

	// Keep confirmed title/area in user context so remounting this panel (e.g. tab switch) doesn't revert to stale values.
	const syncSavedStreamInfo = (
		updates: Partial<Pick<UserConfig, "last_title" | "last_area_name">>,
	) => {
		setUser((currentUser) =>
			currentUser ? { ...currentUser, ...updates } : currentUser,
		);
	};

	useEffect(() => {
		setTitle(user?.last_title ?? "");
	}, [user?.last_title]);

	useEffect(() => {
		let cancelled = false;
		getPartitions()
			.then((data) => {
				if (cancelled) return;
				setPartitions(data);
				const parents = Object.keys(data);
				if (parents.length === 0) return;
				const firstParent = parents[0];
				setParentArea(firstParent);
				const subs = data[firstParent];
				if (subs && subs.length > 0) {
					setSubArea(subs[0]);
				}
			})
			.catch((e) => {
				if (cancelled) return;
				console.error("获取分区失败:", e);
			});
		return () => {
			cancelled = true;
		};
	}, []);

	useEffect(() => {
		if (Object.keys(partitions).length === 0) return;
		const saved = user?.last_area_name;
		if (
			saved &&
			saved.length >= 2 &&
			partitions[saved[0]]?.includes(saved[1])
		) {
			setParentArea(saved[0]);
			setSubArea(saved[1]);
		}
	}, [partitions, user?.last_area_name]);

	const closeVerification = useCallback(() => setVerification(null), []);
	const completeVerification = useCallback(
		(data: StreamCodeData) => {
			setVerification(null);
			setStreamCode(data);
			setIsLive(true);
			addLog("人脸认证通过，开播成功！");
		},
		[addLog, setIsLive, setStreamCode],
	);

	useEffect(() => {
		if (verification && verification.uid !== user?.uid) closeVerification();
	}, [closeVerification, user?.uid, verification]);

	const handleParentChange = (p: string) => {
		setParentArea(p);
		const subs = partitions[p] || [];
		if (subs.length > 0) {
			setSubArea(subs[0]);
		} else {
			setSubArea("");
		}
	};

	const handleUpdateArea = async () => {
		if (!parentArea || !subArea) return;
		try {
			await updateArea(parentArea, subArea);
			syncSavedStreamInfo({ last_area_name: [parentArea, subArea] });
			addLog("分区已更新");
		} catch (e) {
			addLog(`更新分区失败: ${e}`);
		}
	};

	const updateSavedTitle = async (nextTitle: string) => {
		const savedTitle = nextTitle.trim();
		await updateTitle(savedTitle);
		syncSavedStreamInfo({ last_title: savedTitle });
	};

	const handleStart = async () => {
		if (starting || verification || isLive) return;
		if (!user) {
			addLog("请先扫码登录哔哩哔哩账号");
			return;
		}
		const attempt = {
			uid: user.uid,
			parentArea: parentArea || undefined,
			subArea: subArea || undefined,
		};
		setStarting(true);
		addLog("开始获取推流码...");
		try {
			if (title.trim()) {
				await updateSavedTitle(title);
			}
			const res = await startLive(
				attempt.parentArea,
				attempt.subArea,
				attempt.uid,
			);
			if (res.code === 60024 || res.code === 60043) {
				setVerification({ ...attempt, qr: res.qr || undefined });
				addLog("需要在哔哩哔哩客户端完成人脸认证");
				return;
			}
			if (res.code !== 0) {
				addLog(`开播失败: ${res.msg || "未知错误"}`);
				return;
			}
			if (res.data) {
				setStreamCode(res.data);
				setIsLive(true);
				addLog("开播成功！");
			}
		} catch (e) {
			addLog(`开播失败: ${e}`);
		} finally {
			setStarting(false);
		}
	};

	const handleStop = async () => {
		addLog("正在停止直播...");
		try {
			await stopLive();
			setIsLive(false);
			setStreamCode(null);
			addLog("直播已停止");
		} catch (e) {
			addLog(`停止失败: ${e}`);
		}
	};

	return (
		<div className="min-w-0 flex-1 overflow-y-auto p-4 min-[720px]:p-6">
			<div
				className={`mx-auto grid gap-6 ${streamCode ? "max-w-6xl min-[960px]:grid-cols-2" : "max-w-3xl"}`}
			>
				<section className="min-w-0">
					<h2 className="text-[11px] font-semibold uppercase tracking-wider text-stone-500 mb-3">
						直播信息
					</h2>
					<div className="space-y-4">
						<div>
							<label
								htmlFor="stream-title"
								className="block text-[12px] font-medium text-stone-500 dark:text-stone-400 mb-1.5"
							>
								标题
							</label>
							<div className="flex gap-2">
								<input
									id="stream-title"
									type="text"
									value={title}
									onChange={(e) => setTitle(e.target.value)}
									className="min-w-0 flex-1 h-11 min-[720px]:h-9 px-3 rounded-lg bg-stone-50 dark:bg-stone-900 border border-stone-200 dark:border-stone-800 text-[13px] focus:outline-none focus:ring-2 focus:ring-stone-400/30 transition"
								/>
								<button
									type="button"
									onClick={async () => {
										try {
											await updateSavedTitle(title);
											addLog("标题已更新");
										} catch (e) {
											addLog(`更新标题失败: ${e}`);
										}
									}}
									className="shrink-0 h-11 min-[720px]:h-9 px-3 min-[720px]:px-4 rounded-lg bg-[#D4652A] text-white text-[13px] font-medium hover:opacity-90 transition"
								>
									更新
								</button>
							</div>
						</div>

						<div>
							<label
								htmlFor="stream-area"
								className="block text-[12px] font-medium text-stone-500 dark:text-stone-400 mb-1.5"
							>
								分区
							</label>
							<div className="flex gap-2">
								<select
									id="stream-area"
									value={parentArea}
									onChange={(e) => handleParentChange(e.target.value)}
									className="min-w-0 flex-1 h-11 min-[720px]:h-9 px-3 rounded-lg bg-stone-50 dark:bg-stone-900 border border-stone-200 dark:border-stone-800 text-[13px] focus:outline-none focus:ring-2 focus:ring-stone-400/30 transition appearance-none"
								>
									{Object.keys(partitions).map((p) => (
										<option key={p} value={p}>
											{p}
										</option>
									))}
								</select>
								<select
									aria-label="子分区"
									value={subArea}
									onChange={(e) => setSubArea(e.target.value)}
									className="min-w-0 flex-1 h-11 min-[720px]:h-9 px-3 rounded-lg bg-stone-50 dark:bg-stone-900 border border-stone-200 dark:border-stone-800 text-[13px] focus:outline-none focus:ring-2 focus:ring-stone-400/30 transition appearance-none"
								>
									{(partitions[parentArea] || []).map((s) => (
										<option key={s} value={s}>
											{s}
										</option>
									))}
								</select>
								<button
									type="button"
									onClick={handleUpdateArea}
									disabled={!parentArea || !subArea}
									className="shrink-0 h-11 min-[720px]:h-9 px-3 min-[720px]:px-4 rounded-lg bg-[#D4652A] text-white text-[13px] font-medium hover:opacity-90 transition disabled:opacity-50"
								>
									更新
								</button>
							</div>
						</div>
					</div>
					{/* Actions */}
					<div className="flex gap-3 pt-5">
						<button
							type="button"
							onClick={handleStart}
							disabled={isLive || starting || Boolean(verification)}
							className="flex-1 h-11 min-[720px]:h-10 rounded-lg bg-[#D4652A] text-white text-[13px] font-medium hover:opacity-90 transition disabled:opacity-50"
						>
							{starting ? "正在开播…" : "开始直播"}
						</button>
						<button
							type="button"
							onClick={handleStop}
							disabled={!isLive}
							className="flex-1 h-11 min-[720px]:h-10 rounded-lg bg-stone-100 dark:bg-stone-900 border border-stone-200 dark:border-stone-800 text-[13px] font-medium hover:bg-stone-200 dark:hover:bg-stone-800 transition disabled:opacity-50"
						>
							停止直播
						</button>
					</div>
				</section>

				{/* Stream Codes */}
				{streamCode && (
					<section className="min-w-0">
						<div className="flex items-center justify-between mb-3">
							<h2 className="text-[11px] font-semibold uppercase tracking-wider text-stone-500">
								推流信息
							</h2>
							<select
								value={selectedProtocol}
								onChange={(e) =>
									setSelectedProtocol(e.target.value as StreamProtocolType)
								}
								className="h-7 px-2 rounded-md bg-stone-50 dark:bg-stone-900 border border-stone-200 dark:border-stone-800 text-[12px] focus:outline-none focus:ring-2 focus:ring-stone-400/30 transition appearance-none"
							>
								{PROTOCOL_OPTIONS.map((opt) => (
									<option key={opt.value} value={opt.value}>
										{opt.label}
									</option>
								))}
							</select>
						</div>
						<div className="space-y-3">
							<div className="group p-4 rounded-xl bg-stone-50 dark:bg-stone-900 border border-stone-200 dark:border-stone-800 hover:border-stone-300 dark:hover:border-stone-700 transition">
								<div className="flex items-center justify-between mb-1.5">
									<span className="text-[12px] font-medium text-stone-500">
										服务地址
									</span>
									<button
										type="button"
										onClick={() =>
											navigator.clipboard.writeText(
												streamCode[selectedProtocol].addr,
											)
										}
										className="flex min-h-8 items-center gap-1 rounded-md px-2 text-xs text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800 transition"
									>
										<Copy size={12} />
										复制
									</button>
								</div>
								<code className="block text-[12px] text-stone-600 dark:text-stone-400 font-mono break-all leading-relaxed">
									{streamCode[selectedProtocol].addr}
								</code>
							</div>
							<div className="group p-4 rounded-xl bg-stone-50 dark:bg-stone-900 border border-stone-200 dark:border-stone-800 hover:border-stone-300 dark:hover:border-stone-700 transition">
								<div className="flex items-center justify-between mb-1.5">
									<span className="text-[12px] font-medium text-stone-500">
										推流码
									</span>
									<button
										type="button"
										onClick={() =>
											navigator.clipboard.writeText(
												streamCode[selectedProtocol].code,
											)
										}
										className="flex min-h-8 items-center gap-1 rounded-md px-2 text-xs text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800 transition"
									>
										<Copy size={12} />
										复制
									</button>
								</div>
								<code className="block text-[12px] text-stone-600 dark:text-stone-400 font-mono break-all leading-relaxed">
									{streamCode[selectedProtocol].code}
								</code>
							</div>
						</div>
					</section>
				)}
			</div>
			{verification && verification.uid === user?.uid && (
				<FaceVerificationDialog
					verification={verification}
					onClose={closeVerification}
					onSuccess={completeVerification}
				/>
			)}
		</div>
	);
}
