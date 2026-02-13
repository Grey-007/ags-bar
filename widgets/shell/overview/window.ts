import app from "ags/gtk4/app"
import { Astal, Gtk, Gdk } from "ags/gtk4"
import { execAsync } from "ags/process"
import GLib from "gi://GLib?version=2.0"

import {
    activeOverlay,
    closeOverlays,
    currentWorkspace,
    workspaceIds,
    overviewWindows,
    refreshOverviewWindows,
} from "../store.js"
import { setClasses } from "../shared/ui.js"

const workspaceRow = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing: 8 })
setClasses(workspaceRow, ["overview-workspaces"])

let workspaceSubs: Array<() => void> = []
type WorkspaceWidget = {
    id: number
    revealer: Gtk.Revealer
    unsubscribe: () => void
    removing: boolean
}
const workspaceWidgets = new Map<number, WorkspaceWidget>()

function addWorkspaceButton(id: number) {
    const button = new Gtk.Button({ child: new Gtk.Label({ label: `${id}` }) })
    setClasses(button, ["overview-workspace"])
    button.connect("clicked", async () => {
        currentWorkspace.set(id)
        await execAsync(["hyprctl", "dispatch", "workspace", `${id}`])
    })
    const unsubscribe = currentWorkspace.subscribe((current) => {
        setClasses(button, ["overview-workspace", current === id ? "is-active" : "is-inactive"])
    })
    const revealer = new Gtk.Revealer({
        transition_type: Gtk.RevealerTransitionType.SLIDE_RIGHT,
        transition_duration: 180,
        reveal_child: false,
        child: button,
    })
    setClasses(revealer, ["overview-workspace-revealer"])

    const item: WorkspaceWidget = {
        id,
        revealer,
        unsubscribe,
        removing: false,
    }
    workspaceWidgets.set(id, item)
    workspaceSubs.push(unsubscribe)
    workspaceRow.append(revealer)

    GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
        item.revealer.set_reveal_child(true)
        return GLib.SOURCE_REMOVE
    })
}

function removeWorkspaceButton(id: number) {
    const item = workspaceWidgets.get(id)
    if (!item || item.removing) return
    item.removing = true
    item.revealer.set_reveal_child(false)

    GLib.timeout_add(GLib.PRIORITY_DEFAULT, 200, () => {
        if (item.revealer.get_parent() === workspaceRow) {
            workspaceRow.remove(item.revealer)
        }
        item.unsubscribe()
        workspaceWidgets.delete(id)
        workspaceSubs = workspaceSubs.filter((unsub) => unsub !== item.unsubscribe)
        return GLib.SOURCE_REMOVE
    })
}

function renderWorkspaceButtons(ids: number[]) {
    for (const id of ids) {
        if (!workspaceWidgets.has(id)) addWorkspaceButton(id)
    }

    const toRemove: number[] = []
    for (const id of workspaceWidgets.keys()) {
        if (!ids.includes(id)) toRemove.push(id)
    }
    for (const id of toRemove) {
        removeWorkspaceButton(id)
    }
}

workspaceIds.subscribe((ids) => renderWorkspaceButtons(ids))

const windowsList = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 8 })
setClasses(windowsList, ["overview-windows"])

function renderWindows() {
    let child = windowsList.get_first_child()
    while (child) {
        const next = child.get_next_sibling()
        windowsList.remove(child)
        child = next
    }

    for (const title of overviewWindows.get()) {
        const label = new Gtk.Label({ label: title, xalign: 0 })
        setClasses(label, ["overview-window-item"])
        windowsList.append(label)
    }
}

overviewWindows.subscribe(() => renderWindows())

const container = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 14 })
setClasses(container, ["overview-container"])
container.halign = Gtk.Align.CENTER
container.valign = Gtk.Align.START
const heading = new Gtk.Label({ label: "Overview", xalign: 0 })
setClasses(heading, ["overview-heading"])
container.append(heading)
container.append(workspaceRow)
container.append(windowsList)

const keyCtrl = new Gtk.EventControllerKey()
keyCtrl.connect("key-pressed", (_, keyval) => {
    if (keyval === Gdk.KEY_Escape) {
        closeOverlays()
        return true
    }
    return false
})
container.add_controller(keyCtrl)

const revealer = new Gtk.Revealer({
    transition_type: Gtk.RevealerTransitionType.CROSSFADE,
    transition_duration: 180,
    reveal_child: false,
    child: container,
})

const window = new Astal.Window({
    name: "shell-overview",
    visible: false,
    child: revealer,
})
setClasses(window, ["overview-window", "is-closed"])
window.anchor = Astal.WindowAnchor.TOP | Astal.WindowAnchor.BOTTOM | Astal.WindowAnchor.LEFT | Astal.WindowAnchor.RIGHT
window.layer = Astal.Layer.OVERLAY
window.exclusivity = Astal.Exclusivity.IGNORE
window.keymode = Astal.Keymode.ON_DEMAND

activeOverlay.subscribe((overlay) => {
    const open = overlay === "overview"
    if (open) {
        window.visible = true
        setClasses(window, ["overview-window", "is-open"])
        revealer.set_reveal_child(true)
        window.present()
        void refreshOverviewWindows()
        return
    }

    setClasses(window, ["overview-window", "is-closed"])
    revealer.set_reveal_child(false)
})

revealer.connect("notify::child-revealed", () => {
    if (activeOverlay.get() !== "overview" && !revealer.get_child_revealed()) {
        window.visible = false
    }
})

let registered = false
app.connect("startup", () => {
    if (registered) return
    app.add_window(window)
    registered = true
})
