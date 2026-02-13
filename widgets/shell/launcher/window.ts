import app from "ags/gtk4/app"
import { Astal, Gtk, Gdk } from "ags/gtk4"

import {
    activeOverlay,
    closeOverlays,
    launcherQuery,
    getFilteredApps,
    launchApp,
} from "../store.js"
import { setClasses } from "../shared/ui.js"

const listBox = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 8 })
setClasses(listBox, ["launcher-list"])

const entry = new Gtk.Entry({ placeholder_text: "Search apps..." })
setClasses(entry, ["launcher-search"])

function renderApps() {
    let child = listBox.get_first_child()
    while (child) {
        const next = child.get_next_sibling()
        listBox.remove(child)
        child = next
    }

    const apps = getFilteredApps(launcherQuery.get())
    for (const appEntry of apps.slice(0, 8)) {
        const icon = new Gtk.Label({ label: appEntry.icon })
        setClasses(icon, ["launcher-item-icon"])

        const name = new Gtk.Label({ label: appEntry.name, xalign: 0 })
        setClasses(name, ["launcher-item-name"])

        const row = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing: 10 })
        row.append(icon)
        row.append(name)

        const button = new Gtk.Button({ child: row })
        setClasses(button, ["launcher-item"])
        button.connect("clicked", () => void launchApp(appEntry))
        listBox.append(button)
    }
}

entry.connect("changed", () => {
    launcherQuery.set(entry.get_text() ?? "")
})

entry.connect("activate", async () => {
    const first = getFilteredApps(launcherQuery.get())[0]
    if (first) await launchApp(first)
})

const keyCtrl = new Gtk.EventControllerKey()
keyCtrl.connect("key-pressed", (_, keyval) => {
    if (keyval === Gdk.KEY_Escape) {
        closeOverlays()
        return true
    }
    return false
})
entry.add_controller(keyCtrl)

const container = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 10 })
setClasses(container, ["launcher-container"])
container.halign = Gtk.Align.CENTER
container.append(entry)
container.append(listBox)

const revealer = new Gtk.Revealer({
    transition_type: Gtk.RevealerTransitionType.SLIDE_DOWN,
    transition_duration: 180,
    reveal_child: false,
    child: container,
})

const window = new Astal.Window({
    name: "shell-launcher",
    visible: false,
    child: revealer,
})
setClasses(window, ["launcher-window", "is-closed"])
window.anchor = Astal.WindowAnchor.TOP
window.layer = Astal.Layer.OVERLAY
window.exclusivity = Astal.Exclusivity.IGNORE
window.keymode = Astal.Keymode.ON_DEMAND
window.marginTop = 64

activeOverlay.subscribe((overlay) => {
    const open = overlay === "launcher"
    if (open) {
        launcherQuery.set("")
        renderApps()
        window.visible = true
        setClasses(window, ["launcher-window", "is-open"])
        revealer.set_reveal_child(true)
        window.present()
        entry.grab_focus()
        return
    }

    setClasses(window, ["launcher-window", "is-closed"])
    revealer.set_reveal_child(false)
})

launcherQuery.subscribe(() => renderApps())

revealer.connect("notify::child-revealed", () => {
    if (activeOverlay.get() !== "launcher" && !revealer.get_child_revealed()) {
        window.visible = false
    }
})

let registered = false
app.connect("startup", () => {
    if (registered) return
    app.add_window(window)
    registered = true
})
