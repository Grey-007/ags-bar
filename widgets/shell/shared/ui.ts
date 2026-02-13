import { Gtk } from "ags/gtk4"

export function setClasses(widget: Gtk.Widget, classes: string[]) {
    widget.set_css_classes(classes)
}
