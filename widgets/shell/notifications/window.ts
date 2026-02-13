import app from "ags/gtk4/app"
import { Astal, Gtk } from "ags/gtk4"
import GLib from "gi://GLib?version=2.0"

import { notifications, dismissNotification, type NotificationItem } from "../store.js"
import { setClasses } from "../shared/ui.js"

const stack = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 8 })
setClasses(stack, ["notif-stack"])

type RowState = {
    row: Gtk.Box
    autoDismissId: number | null
    removeId: number | null
}

const rows = new Map<number, RowState>()

function clearRowTimeouts(state: RowState) {
    if (state.autoDismissId !== null) {
        GLib.source_remove(state.autoDismissId)
        state.autoDismissId = null
    }
    if (state.removeId !== null) {
        GLib.source_remove(state.removeId)
        state.removeId = null
    }
}

function startDismiss(itemId: number) {
    const state = rows.get(itemId)
    if (!state) return

    const classes = state.row.get_css_classes()
    if (classes.includes("is-leaving")) return

    if (state.autoDismissId !== null) {
        GLib.source_remove(state.autoDismissId)
        state.autoDismissId = null
    }

    setClasses(state.row, ["notif-item", "is-leaving"])
    state.removeId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 190, () => {
        dismissNotification(itemId)
        return GLib.SOURCE_REMOVE
    })
}

function buildRow(item: NotificationItem): RowState {
    const title = new Gtk.Label({ label: item.title, xalign: 0 })
    setClasses(title, ["notif-title"])

    const body = new Gtk.Label({ label: item.body, wrap: true, xalign: 0 })
    setClasses(body, ["notif-body"])

    const close = new Gtk.Button({ child: new Gtk.Label({ label: "󰅖" }) })
    setClasses(close, ["notif-close"])
    close.connect("clicked", () => startDismiss(item.id))

    const head = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing: 8 })
    head.append(title)
    head.append(close)

    const row = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 6 })
    setClasses(row, ["notif-item"])
    row.append(head)
    row.append(body)

    const state: RowState = { row, autoDismissId: null, removeId: null }
    state.autoDismissId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, item.timeoutMs, () => {
        startDismiss(item.id)
        return GLib.SOURCE_REMOVE
    })

    return state
}

function syncNotifications() {
    const visibleItems = notifications.get().slice(-5).reverse()
    const ids = new Set(visibleItems.map((item) => item.id))

    for (const item of visibleItems) {
        if (!rows.has(item.id)) {
            rows.set(item.id, buildRow(item))
        }
    }

    for (const [id, state] of rows.entries()) {
        if (ids.has(id)) continue
        clearRowTimeouts(state)
        if (state.row.get_parent() === stack) stack.remove(state.row)
        rows.delete(id)
    }

    let child = stack.get_first_child()
    while (child) {
        const next = child.get_next_sibling()
        stack.remove(child)
        child = next
    }

    for (const item of visibleItems) {
        const state = rows.get(item.id)
        if (state) stack.append(state.row)
    }

    window.visible = visibleItems.length > 0
}

const window = new Astal.Window({
    name: "shell-notifications",
    visible: false,
    child: stack,
})
setClasses(window, ["notif-window"])
window.anchor = Astal.WindowAnchor.TOP | Astal.WindowAnchor.RIGHT
window.layer = Astal.Layer.OVERLAY
window.exclusivity = Astal.Exclusivity.IGNORE
window.keymode = Astal.Keymode.NONE
window.marginTop = 56
window.marginRight = 10

notifications.subscribe(() => syncNotifications())

let registered = false
app.connect("startup", () => {
    if (registered) return
    app.add_window(window)
    registered = true
})
