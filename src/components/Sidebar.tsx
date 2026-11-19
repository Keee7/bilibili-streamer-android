import {
	LayoutPanelTop,
	MessageSquare,
	RadioTower,
	Settings,
	User,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLive, useUI, useUser } from "@/context/AppContext";
import {
	clearSession,
	isAndroid,
	logout,
	openDanmakuFloat,
} from "@/hooks/useTauri";
import LoginPanel from "./LoginPanel";

interface SidebarProps {
	activeTab: string;
	onTabChange: (tab: string) => void;
}

const navItems = [
	{ id: "stream", label: "推流设置", icon: RadioTower },
	{ id: "danmaku", label: "弹幕监控", icon: MessageSquare },
	{ id: "account", label: "账户管理", icon: User },
	{ id: "settings", label: "设置", icon: Settings },
];

export default function Sidebar({ activeTab, onTabChange }: SidebarProps) {
	const { user, setUser } = useUser();
	const { isLive } = useLive();
	const { addLog } = useUI();
	const [showLogin, setShowLogin] = useState(false);
	const [showMenu, setShowMenu] = useState(false);
	const menuRef = useRef<HTMLDivElement>(null);
	const closeLogin = useCallback(() => setShowLogin(false), []);

	useEffect(() => {
		const handleClickOutside = (event: MouseEvent) => {
			if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
				setShowMenu(false);
			}
		};
		document.addEventListener("mousedown", handleClickOutside);
		return () => document.removeEventListener("mousedown", handleClickOutside);
	}, []);

	const handleLogout = async () => {
		if (!user) return;
		try {
			await logout(user.uid);
			setUser(null);
			addLog("已退出登录");
		} catch (e) {
			addLog(`退出登录失败: ${e}`);
		}
		setShowMenu(false);
	};

	const handleSwitchUser = async () => {
		if (!user) return;
		try {
			await clearSession();
			setUser(null);
			addLog("已退出当前账户");
		} catch (e) {
			addLog(`切换用户失败: ${e}`);
		}
		setShowMenu(false);
		setShowLogin(true);
	};

	return (
		<div className="app-sidebar contents min-[720px]:flex min-[720px]:w-52 min-[720px]:flex-col min-[720px]:border-r border-stone-300 dark:border-[#4a454d] bg-stone-100 dark:bg-[#221f22]">
			{/* User Card */}
			<div
				ref={menuRef}
				className="app-account relative min-w-0 p-2 min-[720px]:p-3 min-[720px]:mb-2"
			>
				<button
					type="button"
					aria-expanded={user ? showMenu : showLogin}
					onClick={() => {
						if (user) {
							setShowMenu((v) => !v);
						} else {
							setShowLogin((v) => !v);
						}
					}}
					className="flex w-full items-center gap-2.5 px-2.5 py-1.5 min-[720px]:py-2.5 text-left rounded-lg transition hover:bg-stone-200 dark:hover:bg-[#363236]"
				>
					<img
						src={
							user?.face || "https://static.hdslb.com/images/member/noface.gif"
						}
						className="w-8 h-8 rounded-full object-cover"
						referrerPolicy="no-referrer"
						alt=""
					/>
					<div className="flex-1 min-w-0">
						<div className="text-[14px] font-medium truncate text-stone-800 dark:text-stone-100">
							{user?.uname ?? "未登录"}
						</div>
						<div className="text-[11px] text-stone-400 truncate">
							{user ? `LV${user.level} · ${user.uid}` : "点击登录"}
						</div>
					</div>
				</button>

				{showMenu && user && (
					<div className="absolute left-3 right-3 top-full mt-1 py-1 rounded-lg bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 shadow-lg z-20">
						<button
							type="button"
							onClick={handleSwitchUser}
							className="w-full px-3 py-2 text-[12px] text-left text-stone-700 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 transition"
						>
							切换用户
						</button>
						<button
							type="button"
							onClick={handleLogout}
							className="w-full px-3 py-2 text-[12px] text-left text-red-500 hover:bg-stone-100 dark:hover:bg-stone-800 transition"
						>
							退出登录
						</button>
					</div>
				)}

				{showLogin && !user && <LoginPanel onClose={closeLogin} />}
			</div>

			{/* Navigation */}
			<nav
				aria-label="主导航"
				className="app-navigation grid grid-cols-4 gap-1 border-t border-stone-200 dark:border-[#4a454d] bg-stone-100 dark:bg-[#221f22] p-1.5 min-[720px]:block min-[720px]:flex-1 min-[720px]:border-t-0 min-[720px]:px-2 min-[720px]:py-0 min-[720px]:space-y-0.5"
			>
				{navItems.map((item) => {
					const isActive = activeTab === item.id;
					return (
						<div
							key={item.id}
							className={`relative min-w-0 ${item.id === "settings" ? "min-[720px]:!mt-8" : ""}`}
						>
							<button
								type="button"
								aria-current={isActive ? "page" : undefined}
								onClick={() => onTabChange(item.id)}
								className={`w-full min-h-11 flex flex-col items-center justify-center gap-1 px-1 rounded-lg text-xs font-medium transition min-[720px]:min-h-0 min-[720px]:flex-row min-[720px]:gap-3 min-[720px]:px-3 min-[720px]:py-2 min-[720px]:text-[13px] ${
									isActive
										? "bg-stone-200 dark:bg-[#363236] text-stone-900 dark:text-stone-100"
										: "text-stone-500 dark:text-stone-400 hover:bg-stone-200 dark:hover:bg-[#363236] hover:text-stone-900 dark:hover:text-stone-100"
								}`}
							>
								<item.icon size={16} />
								<span className="min-[720px]:flex-1 min-[720px]:text-left">
									{item.label}
								</span>
							</button>
							{item.id === "danmaku" && isActive && !isAndroid && (
								<button
									type="button"
									aria-label="打开弹幕浮窗"
									onClick={() => {
										openDanmakuFloat().catch(() => {});
									}}
									className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 rounded hidden min-[720px]:flex items-center justify-center transition text-stone-500 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 hover:bg-stone-300 dark:hover:bg-[#4a454d]"
									title="浮窗"
								>
									<LayoutPanelTop size={13} />
								</button>
							)}
						</div>
					);
				})}
			</nav>

			{/* Live Status */}
			<div className="hidden min-[720px]:block px-3 pt-2">
				<div className="flex items-center gap-2 px-3 py-2">
					<span
						className={`w-1.5 h-1.5 rounded-full ${isLive ? "bg-[#34C759] animate-pulse" : "bg-stone-300 dark:bg-stone-600"}`}
					/>
					<span className="text-[11px] text-stone-400">
						{isLive ? "直播中" : "未开播"}
					</span>
				</div>
			</div>
		</div>
	);
}
