import GLib from "gi://GLib?version=2.0"
import Gio from "gi://Gio?version=2.0"
import { execAsync } from "ags/process"

import { createVariable } from "./shared/state.js"

export type Overlay = "none" | "launcher" | "control-center" | "overview"

export interface AppEntry {
    name: string
    command: string
    icon: string
}

export interface NotificationItem {
    id: number
    title: string
    body: string
    timeoutMs: number
}

const DEFAULT_APPS: AppEntry[] = [
    { name: "Terminal", command: "foot", icon: "󰆍" },
    { name: "Browser", command: "firefox", icon: "󰈹" },
    { name: "Files", command: "nautilus", icon: "󰉋" },
    { name: "Editor", command: "code", icon: "󰨞" },
    { name: "Music", command: "spotify", icon: "󰓇" },
]

export const activeOverlay = createVariable<Overlay>("none")
export const launcherQuery = createVariable("")
export const currentWorkspace = createVariable(1)
export const workspaceIds = createVariable<number[]>([1, 2, 3])
export const activeWindowTitle = createVariable("Desktop")
export const mediaInfo = createVariable("Nothing playing")
export const clockText = createVariable("")
export const volume = createVariable(45)
export const brightness = createVariable(55)
export const wifiEnabled = createVariable(true)
export const batteryText = createVariable("--%")
export const overviewWindows = createVariable<string[]>([])
export const notifications = createVariable<NotificationItem[]>([])
export const appEntries = createVariable<AppEntry[]>(DEFAULT_APPS)

let notifId = 0
let hyprSubprocess: Gio.Subprocess | null = null
let hyprEventStream: Gio.DataInputStream | null = null
let hyprRestartId: number | null = null
let hyprRefreshDebounceId: number | null = null
let hyprFallbackPollId: number | null = null
let hyprSafetyPollId: number | null = null
let matugenMonitor: Gio.FileMonitor | null = null
let matugenMonitorLegacy: Gio.FileMonitor | null = null
let matugenReloadId: number | null = null

function formatClock() {
    const dt = GLib.DateTime.new_now_local()
    return dt ? dt.format("%a %d %b  %H:%M") ?? "--:--" : "--:--"
}

function parsePercent(raw: string, fallback: number): number {
    const v = Number.parseInt(raw.replace(/[^0-9]/g, ""), 10)
    return Number.isNaN(v) ? fallback : Math.max(0, Math.min(100, v))
}

function normalizeWorkspaceIds(ids: number[], active: number): number[] {
    const set = new Set<number>([1, 2, 3, active, ...ids.filter((id) => id > 0)])
    return [...set].sort((a, b) => a - b)
}

export function getFilteredApps(query: string): AppEntry[] {
    const q = query.trim().toLowerCase()
    if (!q) return appEntries.get()
    return appEntries.get().filter((app) => app.name.toLowerCase().includes(q))
}

export function setOverlay(overlay: Overlay) {
    activeOverlay.set(overlay)
}

export function toggleOverlay(overlay: Overlay) {
    activeOverlay.update((prev) => (prev === overlay ? "none" : overlay))
}

export function closeOverlays() {
    activeOverlay.set("none")
    launcherQuery.set("")
}

export function pushNotification(title: string, body: string, timeoutMs = 4200) {
    const id = ++notifId
    notifications.update((items) => [...items, { id, title, body, timeoutMs }])
}

export function dismissNotification(id: number) {
    notifications.update((items) => items.filter((item) => item.id !== id))
}

export async function launchApp(app: AppEntry) {
    try {
        await execAsync(["bash", "-lc", `${app.command} >/dev/null 2>&1 &`])
        pushNotification("App Launcher", `Opened ${app.name}`)
    } catch (error) {
        pushNotification("Launch failed", String(error))
    } finally {
        closeOverlays()
    }
}

export async function refreshHyprState() {
    try {
        const json = await execAsync(["hyprctl", "activewindow", "-j"])
        const parsed = JSON.parse(json) as { title?: string }
        activeWindowTitle.set(parsed.title?.trim() || "Desktop")
    } catch {
        activeWindowTitle.set("Desktop")
    }

    try {
        const json = await execAsync(["hyprctl", "activeworkspace", "-j"])
        const parsed = JSON.parse(json) as { id?: number }
        currentWorkspace.set(parsed.id ?? 1)
    } catch {
        currentWorkspace.set(1)
    }

    try {
        const json = await execAsync(["hyprctl", "workspaces", "-j"])
        const parsed = JSON.parse(json) as Array<{ id?: number }>
        const ids = parsed.map((w) => w.id ?? 0)
        workspaceIds.set(normalizeWorkspaceIds(ids, currentWorkspace.get()))
    } catch {
        workspaceIds.set(normalizeWorkspaceIds([], currentWorkspace.get()))
    }
}

function scheduleHyprRefresh() {
    if (hyprRefreshDebounceId !== null) return
    hyprRefreshDebounceId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 50, () => {
        hyprRefreshDebounceId = null
        void refreshHyprState()
        return GLib.SOURCE_REMOVE
    })
}

function handleHyprEvent(line: string) {
    if (
        line.startsWith("workspace>>") ||
        line.startsWith("focusedmon>>") ||
        line.startsWith("activewindow>>") ||
        line.startsWith("activewindowv2>>")
    ) {
        scheduleHyprRefresh()
    }
}

function scheduleHyprEventBridgeRestart() {
    if (hyprRestartId !== null) return
    hyprRestartId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1200, () => {
        hyprRestartId = null
        startHyprEventBridge()
        return GLib.SOURCE_REMOVE
    })
}

function readHyprEventLoop() {
    if (!hyprEventStream) return
    hyprEventStream.read_line_async(GLib.PRIORITY_DEFAULT, null, (stream, result) => {
        try {
            const [line] = stream.read_line_finish_utf8(result)
            if (line === null) {
                scheduleHyprEventBridgeRestart()
                return
            }
            handleHyprEvent(line)
            readHyprEventLoop()
        } catch {
            scheduleHyprEventBridgeRestart()
        }
    })
}

function startHyprEventBridge() {
    const runtimeDir = GLib.getenv("XDG_RUNTIME_DIR")
    const instance = GLib.getenv("HYPRLAND_INSTANCE_SIGNATURE")
    if (!runtimeDir || !instance) return

    const socketPath = `${runtimeDir}/hypr/${instance}/.socket2.sock`
    const socatPath = GLib.find_program_in_path("socat")
    if (!socatPath) {
        if (hyprFallbackPollId === null) {
            hyprFallbackPollId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 1, () => {
                void refreshHyprState()
                return GLib.SOURCE_CONTINUE
            })
        }
        return
    }

    const command = `exec socat -u UNIX-CONNECT:${socketPath} STDOUT`

    try {
        hyprSubprocess = Gio.Subprocess.new(
            ["bash", "-lc", command],
            Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_SILENCE,
        )
        const stdout = hyprSubprocess.get_stdout_pipe()
        hyprEventStream = new Gio.DataInputStream({ base_stream: stdout })
        readHyprEventLoop()

        hyprSubprocess.wait_async(null, (_, res) => {
            try {
                hyprSubprocess?.wait_finish(res)
            } catch {
                // handled by restart
            } finally {
                hyprSubprocess = null
                hyprEventStream = null
                scheduleHyprEventBridgeRestart()
            }
        })
    } catch {
        scheduleHyprEventBridgeRestart()
    }
}

function scheduleMatugenReload() {
    if (matugenReloadId !== null) return
    matugenReloadId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 400, () => {
        matugenReloadId = null
        void execAsync([
            "bash",
            "-lc",
            "cd /home/grey/.config/ags && ./build.sh && (pkill ags || true) && ags run --gtk 4 >/tmp/ags-theme.log 2>&1 &",
        ])
        return GLib.SOURCE_REMOVE
    })
}

function startMatugenWatcher() {
    if (matugenMonitor || matugenMonitorLegacy) return
    const matugenFile = Gio.File.new_for_path("/home/grey/.config/ags/style/_matugen.scss")
    const matugenLegacyFile = Gio.File.new_for_path("/home/grey/.config/ags/style/_matugen.generated.scss")

    const onChange = (_: Gio.FileMonitor, __: Gio.File | null, ___: Gio.File | null, eventType: Gio.FileMonitorEvent) => {
        if (
            eventType === Gio.FileMonitorEvent.CHANGES_DONE_HINT ||
            eventType === Gio.FileMonitorEvent.CREATED ||
            eventType === Gio.FileMonitorEvent.MOVED_IN
        ) {
            scheduleMatugenReload()
        }
    }

    try {
        matugenMonitor = matugenFile.monitor_file(Gio.FileMonitorFlags.NONE, null)
        matugenMonitor.connect("changed", onChange)
    } catch {
        matugenMonitor = null
    }

    try {
        matugenMonitorLegacy = matugenLegacyFile.monitor_file(Gio.FileMonitorFlags.NONE, null)
        matugenMonitorLegacy.connect("changed", onChange)
    } catch {
        matugenMonitorLegacy = null
    }
}

export async function refreshMediaInfo() {
    try {
        const out = await execAsync(["bash", "-lc", "playerctl metadata --format '{{artist}} - {{title}}'"])
        mediaInfo.set(out.trim() || "Nothing playing")
    } catch {
        mediaInfo.set("Nothing playing")
    }
}

export async function refreshSystemInfo() {
    try {
        const out = await execAsync(["bash", "-lc", "wpctl get-volume @DEFAULT_AUDIO_SINK@"])
        volume.set(parsePercent(out, volume.get()))
    } catch {
        // keep previous
    }

    try {
        const out = await execAsync(["bash", "-lc", "brightnessctl g -m | cut -d, -f4"])
        brightness.set(parsePercent(out, brightness.get()))
    } catch {
        // keep previous
    }

    try {
        const out = await execAsync(["bash", "-lc", "upower -i $(upower -e | grep BAT | head -n1) | grep -E 'percentage' | awk '{print $2}'"])
        batteryText.set(out.trim() || "--%")
    } catch {
        batteryText.set("--%")
    }
}

export async function refreshOverviewWindows() {
    try {
        const json = await execAsync(["hyprctl", "clients", "-j"])
        const parsed = JSON.parse(json) as Array<{ title?: string; workspace?: { id?: number } }>
        const list = parsed
            .filter((c) => (c.title ?? "").trim().length > 0)
            .map((c) => `[${c.workspace?.id ?? "?"}] ${c.title}`)
        overviewWindows.set(list.length > 0 ? list : ["No active windows"])
    } catch {
        overviewWindows.set(["No active windows"])
    }
}

export function setVolume(percent: number) {
    volume.set(Math.max(0, Math.min(100, percent)))
    void execAsync(["wpctl", "set-volume", "@DEFAULT_AUDIO_SINK@", `${volume.get() / 100}`])
}

export function setBrightness(percent: number) {
    brightness.set(Math.max(5, Math.min(100, percent)))
    void execAsync(["brightnessctl", "set", `${brightness.get()}%`])
}

export function toggleWifi() {
    wifiEnabled.update((v) => !v)
    const cmd = wifiEnabled.get() ? "nmcli radio wifi on" : "nmcli radio wifi off"
    void execAsync(["bash", "-lc", cmd])
    pushNotification("Quick Toggle", wifiEnabled.get() ? "Wi-Fi enabled" : "Wi-Fi disabled", 1800)
}

export function handleRequest(argv: string[]) {
    const cmd = argv[0] ?? ""
    switch (cmd) {
        case "toggle-launcher":
            toggleOverlay("launcher")
            return "ok"
        case "toggle-control":
            toggleOverlay("control-center")
            return "ok"
        case "toggle-overview":
            toggleOverlay("overview")
            return "ok"
        case "close-overlays":
            closeOverlays()
            return "ok"
        case "get-workspace":
            return `${currentWorkspace.get()}`
        case "get-workspaces":
            return workspaceIds.get().join(",")
        default:
            return "unknown-command"
    }
}

export function startStoreRuntime() {
    clockText.set(formatClock())
    void refreshHyprState()
    void refreshMediaInfo()
    void refreshSystemInfo()
    startHyprEventBridge()
    startMatugenWatcher()

    GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 1, () => {
        clockText.set(formatClock())
        return GLib.SOURCE_CONTINUE
    })

    // Safety net: keep workspace/title in sync even if event stream drops.
    if (hyprSafetyPollId === null) {
        hyprSafetyPollId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 1, () => {
            void refreshHyprState()
            return GLib.SOURCE_CONTINUE
        })
    }

    activeOverlay.subscribe((overlay) => {
        if (overlay === "overview") void refreshOverviewWindows()
        if (overlay === "control-center") {
            void refreshMediaInfo()
            void refreshSystemInfo()
        }
        if (overlay === "none") {
            void refreshHyprState()
            void refreshMediaInfo()
        }
    })
}
