import app from "ags/gtk4/app"
import { Astal, Gtk, Gdk } from "ags/gtk4"

import {
    activeOverlay,
    closeOverlays,
    volume,
    brightness,
    wifiEnabled,
    mediaInfo,
    setVolume,
    setBrightness,
    toggleWifi,
    refreshMediaInfo,
} from "../store.js"
import { setClasses } from "../shared/ui.js"

function sliderRow(title: string, iconText: string, val: number, onChange: (value: number) => void) {
    const titleLabel = new Gtk.Label({ label: title, xalign: 0, hexpand: true })
    setClasses(titleLabel, ["cc-row-title"])

    const icon = new Gtk.Label({ label: iconText })
    setClasses(icon, ["cc-row-icon"])

    const slider = Gtk.Scale.new_with_range(Gtk.Orientation.HORIZONTAL, 0, 100, 1)
    slider.set_hexpand(true)
    slider.set_value(val)
    setClasses(slider, ["cc-slider"])
    slider.connect("value-changed", () => onChange(Math.round(slider.get_value())))

    const row = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 8 })
    const top = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing: 8 })
    top.append(icon)
    top.append(titleLabel)
    row.append(top)
    row.append(slider)

    return { row, slider }
}

const content = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 14 })
setClasses(content, ["cc-container"])

const header = new Gtk.Label({ label: "Control Center", xalign: 0 })
setClasses(header, ["cc-header"])
content.append(header)

const volumeRow = sliderRow("Volume", "󰕾", volume.get(), setVolume)
content.append(volumeRow.row)
volume.subscribe((v) => volumeRow.slider.set_value(v))

const brightnessRow = sliderRow("Brightness", "󰃠", brightness.get(), setBrightness)
content.append(brightnessRow.row)
brightness.subscribe((v) => brightnessRow.slider.set_value(v))

const toggles = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing: 8 })
setClasses(toggles, ["cc-toggles"])

const wifi = new Gtk.Button({ child: new Gtk.Label({ label: "󰖩 Wi-Fi" }) })
setClasses(wifi, ["cc-toggle"])
wifi.connect("clicked", () => toggleWifi())
wifiEnabled.subscribe((on) => {
    const child = wifi.get_child()
    if (child instanceof Gtk.Label) {
        child.label = on ? "󰖩 Wi-Fi" : "󰖪 Wi-Fi"
    }
    setClasses(wifi, ["cc-toggle", on ? "is-on" : "is-off"])
})

const dnd = new Gtk.Button({ child: new Gtk.Label({ label: "󰂚 Focus" }) })
setClasses(dnd, ["cc-toggle", "is-off"])
let focusMode = false
dnd.connect("clicked", () => {
    focusMode = !focusMode
    setClasses(dnd, ["cc-toggle", focusMode ? "is-on" : "is-off"])
})

const bt = new Gtk.Button({ child: new Gtk.Label({ label: "󰂯 BT" }) })
setClasses(bt, ["cc-toggle", "is-on"])

const keyCtrl = new Gtk.EventControllerKey()
keyCtrl.connect("key-pressed", (_, keyval) => {
    if (keyval === Gdk.KEY_Escape) {
        closeOverlays()
        return true
    }
    return false
})

content.add_controller(keyCtrl)

toggles.append(wifi)
toggles.append(dnd)
toggles.append(bt)
content.append(toggles)

const mediaTitle = new Gtk.Label({ label: mediaInfo.get(), xalign: 0, wrap: true })
setClasses(mediaTitle, ["cc-media-title"])
mediaInfo.subscribe((m) => (mediaTitle.label = m))

const mediaRefresh = new Gtk.Button({ child: new Gtk.Label({ label: "󰑐 Refresh Media" }) })
setClasses(mediaRefresh, ["cc-media-refresh"])
mediaRefresh.connect("clicked", () => void refreshMediaInfo())

const mediaBox = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 8 })
setClasses(mediaBox, ["cc-media"])
mediaBox.append(mediaTitle)
mediaBox.append(mediaRefresh)
content.append(mediaBox)

const revealer = new Gtk.Revealer({
    transition_type: Gtk.RevealerTransitionType.SLIDE_LEFT,
    transition_duration: 190,
    reveal_child: false,
    child: content,
})

const window = new Astal.Window({
    name: "shell-control-center",
    visible: false,
    child: revealer,
})
setClasses(window, ["cc-window", "is-closed"])
window.anchor = Astal.WindowAnchor.TOP | Astal.WindowAnchor.BOTTOM | Astal.WindowAnchor.RIGHT
window.layer = Astal.Layer.OVERLAY
window.exclusivity = Astal.Exclusivity.IGNORE
window.keymode = Astal.Keymode.ON_DEMAND
window.marginTop = 44
window.marginBottom = 14
window.marginRight = 10

activeOverlay.subscribe((overlay) => {
    const open = overlay === "control-center"
    if (open) {
        window.visible = true
        setClasses(window, ["cc-window", "is-open"])
        revealer.set_reveal_child(true)
        window.present()
        void refreshMediaInfo()
        return
    }

    setClasses(window, ["cc-window", "is-closed"])
    revealer.set_reveal_child(false)
})

revealer.connect("notify::child-revealed", () => {
    if (activeOverlay.get() !== "control-center" && !revealer.get_child_revealed()) {
        window.visible = false
    }
})

let registered = false
app.connect("startup", () => {
    if (registered) return
    app.add_window(window)
    registered = true
})
