import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { Moon, Sun, Terminal } from "lucide-react";
import { useEffect, useState } from "react";
import AccountPanel from "@/components/AccountPanel";
import ConsolePanel from "@/components/ConsolePanel";
import DanmakuFloat from "@/components/DanmakuFloat";
import DanmakuPanel from "@/components/DanmakuPanel";
import SettingsPanel from "@/components/SettingsPanel";
import Sidebar from "@/components/Sidebar";
import StreamPanel from "@/components/StreamPanel";
import { AppProvider, useLive, useUI, useUser } from "@/context/AppContext";
import { loadSavedConfig } from "@/hooks/useTauri";

function AppContent() {
	const [activeTab, setActiveTab] = useState("stream");
	const { isLive } = useLive();
	const { isDark, toggleDark, consoleOpen, setConsoleOpen } = useUI();
	const { setUser } = useUser();

	useEffect(() => {
		loadSavedConfig()
			.then((u) => {
				if (u) setUser(u);
			})
			.catch(() => {});
	}, [setUser]);

	const renderPanel = () => {
		switch (activeTab) {
			case "danmaku":
				return <DanmakuPanel />;
			case "account":
				return <AccountPanel />;
			case "settings":
				return <SettingsPanel />;
			default:
				return null;
		}
	};

	return (
		<div className="app-shell bg-[#f7f5f2] text-stone-800 dark:bg-stone-950 dark:text-stone-200 overflow-hidden">
			<Sidebar activeTab={activeTab} onTabChange={setActiveTab} />
			<div className="app-toolbar flex items-center justify-end pr-2 min-[720px]:px-4 gap-1">
				{isLive && (
					<span className="whitespace-nowrap text-xs text-green-700 dark:text-green-400 min-[720px]:hidden">
						直播中
					</span>
				)}
				<button
					type="button"
					aria-label={isDark ? "切换到浅色模式" : "切换到深色模式"}
					onClick={toggleDark}
					className="w-11 h-11 min-[720px]:w-8 min-[720px]:h-8 rounded-md flex items-center justify-center text-stone-500 dark:text-stone-300 hover:text-stone-700 dark:hover:text-stone-200 hover:bg-stone-200 dark:hover:bg-[#363236] transition"
				>
					{isDark ? <Sun size={14} /> : <Moon size={14} />}
				</button>
				<button
					type="button"
					aria-label="运行日志"
					aria-pressed={consoleOpen}
					onClick={() => setConsoleOpen(!consoleOpen)}
					className={`w-11 h-11 min-[720px]:w-8 min-[720px]:h-8 rounded-md flex items-center justify-center transition ${consoleOpen ? "text-stone-800 dark:text-stone-200 bg-stone-200 dark:bg-[#363236]" : "text-stone-500 dark:text-stone-300 hover:text-stone-700 dark:hover:text-stone-200 hover:bg-stone-200 dark:hover:bg-[#363236]"}`}
				>
					<Terminal size={14} />
				</button>
			</div>
			<main className="app-content flex flex-col min-w-0 min-h-0">
				<div
					className={activeTab === "stream" ? "flex flex-1 min-h-0" : "hidden"}
				>
					<StreamPanel />
				</div>
				{renderPanel()}
				<ConsolePanel open={consoleOpen} />
			</main>
		</div>
	);
}

function AppInner() {
	const label = getCurrentWebviewWindow().label;
	if (label === "danmaku-float") {
		return <DanmakuFloat />;
	}
	return <AppContent />;
}

function App() {
	return (
		<AppProvider>
			<AppInner />
		</AppProvider>
	);
}

export default App;
