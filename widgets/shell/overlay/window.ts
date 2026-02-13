import app from "ags/gtk4/app"
import { Astal, Gtk } from "ags/gtk4"

import { activeOverlay, closeOverlays } from "../store.js"
import { setClasses } from "../shared/ui.js"

const scrim = new Gtk.Button({ hexpand: true, vexpand: true })
setClasses(scrim, ["shell-overlay-scrim"])
scrim.connect("clicked", () => closeOverlays())

const revealer = new Gtk.Revealer({
    transition_type: Gtk.RevealerTransitionType.CROSSFADE,
    transition_duration: 170,
    reveal_child: false,
    child: scrim,
})

const overlay = new Astal.Window({
    name: "shell-overlay",
    visible: false,
    child: revealer,
})
setClasses(overlay, ["shell-overlay-window", "is-closed"])
overlay.anchor =
    Astal.WindowAnchor.TOP |
    Astal.WindowAnchor.BOTTOM |
    Astal.WindowAnchor.LEFT |
    Astal.WindowAnchor.RIGHT
overlay.layer = Astal.Layer.TOP
overlay.exclusivity = Astal.Exclusivity.IGNORE
overlay.keymode = Astal.Keymode.ON_DEMAND

activeOverlay.subscribe((ov) => {
    const show = ov !== "none"
    if (show) {
        overlay.visible = true
        setClasses(overlay, ["shell-overlay-window", "is-open"])
        revealer.set_reveal_child(true)
        return
    }

    setClasses(overlay, ["shell-overlay-window", "is-closed"])
    revealer.set_reveal_child(false)
})

revealer.connect("notify::child-revealed", () => {
    if (activeOverlay.get() === "none" && !revealer.get_child_revealed()) {
        overlay.visible = false
    }
})

let registered = false
app.connect("startup", () => {
    if (registered) return
    app.add_window(overlay)
    registered = true
})
