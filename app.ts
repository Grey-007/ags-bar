import app from "ags/gtk4/app"

import { handleRequest, startStoreRuntime } from "./widgets/shell/store.js"

import "./widgets/shell/overlay/window.js"
import "./widgets/shell/bar/window.js"
import "./widgets/shell/launcher/window.js"
import "./widgets/shell/controlCenter/window.js"
import "./widgets/shell/notifications/window.js"
import "./widgets/shell/overview/window.js"

app.start({
    css: "./style/style.css",
    main: () => {
        startStoreRuntime()
    },
    requestHandler: (argv, res) => {
        res(handleRequest(argv))
    },
})
