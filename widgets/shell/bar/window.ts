import app from "ags/gtk4/app"
import { Astal, Gtk } from "ags/gtk4"
import { execAsync } from "ags/process"
import Pango from "gi://Pango?version=1.0"
import GLib from "gi://GLib?version=2.0"

import {
    activeWindowTitle,
    clockText,
    currentWorkspace,
    workspaceIds,
    mediaInfo,
    batteryText,
    wifiEnabled,
    volume,
    toggleOverlay,
    toggleWifi,
    setVolume,
    closeOverlays,
    refreshHyprState,
} from "../store.js"
import { setClasses } from "../shared/ui.js"

function WorkspaceButton(id: number) {
    const dot = new Gtk.Label({ label: "•" })
    setClasses(dot, ["bar-workspace-dot"])

    const button = new Gtk.Button({ child: dot })
    setClasses(button, ["bar-workspace"])

    const unsubscribe = currentWorkspace.subscribe((active) => {
        setClasses(button, ["bar-workspace", ...(active === id ? ["is-active"] : [])])
    })

    button.connect("clicked", async () => {
        currentWorkspace.set(id)
        try {
            await execAsync(["hyprctl", "dispatch", "workspace", `${id}`])
        } finally {
            void refreshHyprState()
        }
    })

    return { button, unsubscribe }
}

type WorkspaceWidget = {
    revealer: Gtk.Revealer
    unsubscribe: () => void
    removing: boolean
}

function makeLabel(text = "") {
    const label = new Gtk.Label({ label: text, xalign: 0 })
    setClasses(label, ["bar-text"])
    return label
}

const leftInner = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing: 6 })
setClasses(leftInner, ["bar-left"])

const leftLauncher = new Gtk.Button({ child: new Gtk.Label({ label: "󰣇" }) })
setClasses(leftLauncher, ["bar-mini-btn"])
leftLauncher.connect("clicked", () => toggleOverlay("launcher"))
leftInner.append(leftLauncher)

const workspaceTrack = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing: 6 })

const workspaceWidgets = new Map<number, WorkspaceWidget>()

function addWorkspaceWidget(id: number) {
    const { button, unsubscribe } = WorkspaceButton(id)
    const revealer = new Gtk.Revealer({
        transition_type: Gtk.RevealerTransitionType.SLIDE_RIGHT,
        transition_duration: 180,
        reveal_child: false,
        child: button,
    })
    workspaceTrack.append(revealer)

    const item: WorkspaceWidget = {
        revealer,
        unsubscribe,
        removing: false,
    }
    workspaceWidgets.set(id, item)

    GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
        item.revealer.set_reveal_child(true)
        return GLib.SOURCE_REMOVE
    })
}

function removeWorkspaceWidget(id: number) {
    const item = workspaceWidgets.get(id)
    if (!item || item.removing) return
    item.removing = true
    item.revealer.set_reveal_child(false)

    GLib.timeout_add(GLib.PRIORITY_DEFAULT, 200, () => {
        if (item.revealer.get_parent() === workspaceTrack) {
            workspaceTrack.remove(item.revealer)
        }
        item.unsubscribe()
        workspaceWidgets.delete(id)
        return GLib.SOURCE_REMOVE
    })
}

function renderWorkspaceTrack(ids: number[]) {
    for (const id of ids) {
        if (!workspaceWidgets.has(id)) addWorkspaceWidget(id)
    }

    const toRemove: number[] = []
    for (const id of workspaceWidgets.keys()) {
        if (!ids.includes(id)) toRemove.push(id)
    }
    for (const id of toRemove) {
        removeWorkspaceWidget(id)
    }
}

workspaceIds.subscribe((ids) => renderWorkspaceTrack(ids))
leftInner.append(workspaceTrack)

const leftUtility = new Gtk.Button({ child: new Gtk.Label({ label: "󰍉" }) })
setClasses(leftUtility, ["bar-mini-btn"])
leftUtility.connect("clicked", () => toggleOverlay("overview"))
leftInner.append(leftUtility)

const weatherBox = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing: 4 })
setClasses(weatherBox, ["bar-chip", "bar-weather"])
weatherBox.append(new Gtk.Label({ label: "󰖙" }))
const weatherText = new Gtk.Label({ label: "30C" })
setClasses(weatherText, ["bar-weather-text"])
weatherBox.append(weatherText)
leftInner.append(weatherBox)

const left = new Gtk.Box()
setClasses(left, ["bar-segment"])
left.append(leftInner)

const centerInner = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing: 10, hexpand: true })
setClasses(centerInner, ["bar-center"])
const mediaGlyph = new Gtk.Label({ label: "󰎆" })
setClasses(mediaGlyph, ["bar-center-icon"])
const titleLabel = makeLabel("Desktop")
setClasses(titleLabel, ["bar-title"])
titleLabel.set_ellipsize(Pango.EllipsizeMode.END)
titleLabel.set_max_width_chars(34)
titleLabel.set_hexpand(true)
const mediaLabel = makeLabel("Nothing playing")
setClasses(mediaLabel, ["bar-media"])
mediaLabel.set_ellipsize(Pango.EllipsizeMode.END)
mediaLabel.set_max_width_chars(44)
mediaLabel.set_hexpand(true)
centerInner.append(mediaGlyph)
centerInner.append(titleLabel)
centerInner.append(mediaLabel)

const center = new Gtk.Box()
setClasses(center, ["bar-segment", "bar-segment-center"])
center.append(centerInner)

const rightInner = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing: 6 })
setClasses(rightInner, ["bar-right"])

const tray = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing: 4 })
for (const glyph of ["󰕮", "󰖳", "󰛳"]) {
    const l = new Gtk.Label({ label: glyph })
    setClasses(l, ["bar-tray-icon"])
    tray.append(l)
}

const wifi = new Gtk.Button({ child: new Gtk.Label({ label: "󰖩" }) })
setClasses(wifi, ["bar-toggle"])
wifi.connect("clicked", () => toggleWifi())
wifiEnabled.subscribe((on) => {
    const child = wifi.get_child()
    if (child instanceof Gtk.Label) child.label = on ? "󰖩" : "󰖪"
})

const vol = new Gtk.Button({ child: new Gtk.Label({ label: "󰕾" }) })
setClasses(vol, ["bar-toggle"])
vol.connect("clicked", () => {
    setVolume(volume.get() > 0 ? 0 : 45)
})
volume.subscribe((v) => {
    const child = vol.get_child()
    if (child instanceof Gtk.Label) child.label = v === 0 ? "󰝟" : "󰕾"
})

const launcher = new Gtk.Button({ child: new Gtk.Label({ label: "󰣇" }) })
setClasses(launcher, ["bar-toggle"])
launcher.connect("clicked", () => toggleOverlay("launcher"))

const control = new Gtk.Button({ child: new Gtk.Label({ label: "󰕾" }) })
setClasses(control, ["bar-toggle"])
control.connect("clicked", () => toggleOverlay("control-center"))

const overview = new Gtk.Button({ child: new Gtk.Label({ label: "󰍉" }) })
setClasses(overview, ["bar-toggle"])
overview.connect("clicked", () => toggleOverlay("overview"))

const clock = makeLabel("--:--")
setClasses(clock, ["bar-clock"])
const battery = makeLabel("--%")
setClasses(battery, ["bar-battery"])

rightInner.append(tray)
rightInner.append(wifi)
rightInner.append(vol)
rightInner.append(launcher)
rightInner.append(control)
rightInner.append(overview)

const status = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing: 4 })
setClasses(status, ["bar-chip", "bar-status"])
status.append(battery)
status.append(clock)
rightInner.append(status)

const power = new Gtk.Button({ child: new Gtk.Label({ label: "󰐥" }) })
setClasses(power, ["bar-mini-btn", "bar-power"])
power.connect("clicked", () => toggleOverlay("control-center"))
rightInner.append(power)

const right = new Gtk.Box()
setClasses(right, ["bar-segment"])
right.append(rightInner)

activeWindowTitle.subscribe((t) => (titleLabel.label = t))
mediaInfo.subscribe((m) => (mediaLabel.label = m))
clockText.subscribe((c) => (clock.label = c))
batteryText.subscribe((b) => (battery.label = b))

const root = new Gtk.CenterBox()
root.set_start_widget(left)
root.set_center_widget(center)
root.set_end_widget(right)
setClasses(root, ["shell-bar-root"])

const bar = new Astal.Window({
    name: "shell-bar",
    visible: true,
    child: root,
})
setClasses(bar, ["shell-bar-window"])
bar.anchor = Astal.WindowAnchor.TOP | Astal.WindowAnchor.LEFT | Astal.WindowAnchor.RIGHT
bar.layer = Astal.Layer.TOP
bar.exclusivity = Astal.Exclusivity.EXCLUSIVE
bar.keymode = Astal.Keymode.NONE

const keyCtrl = new Gtk.EventControllerKey()
keyCtrl.connect("key-pressed", (_, keyval) => {
    if (keyval === 65307) {
        closeOverlays()
        return true
    }
    return false
})
bar.add_controller(keyCtrl)

let registered = false
app.connect("startup", () => {
    if (registered) return
    app.add_window(bar)
    registered = true
})
