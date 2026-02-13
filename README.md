# AGS v3 Hyprland Shell

GTK4 shell configuration for AGS v3, targeting Hyprland.

## Scope

- AGS v3 only
- GTK4 only
- Windows self-register on import
- `app.ts` only boots runtime and request handling
- No deprecated APIs like `App.config`, `Widget.*`, or `Utils.exec`

## Repository Layout

```text
.
├── app.ts
├── build.sh
├── style/
│   ├── style.scss
│   ├── style.css
│   ├── _matugen.scss
│   └── _matugen.generated.scss
├── widgets/
│   ├── shell/
│   │   ├── bar/window.ts
│   │   ├── launcher/window.ts
│   │   ├── controlCenter/window.ts
│   │   ├── notifications/window.ts
│   │   ├── overview/window.ts
│   │   ├── overlay/window.ts
│   │   └── store.ts
│   └── refreshMenu/
└── scripts/
    ├── apply-matugen.sh
    └── matugen-post-hook.sh
```

## Dependencies

Install the tools used by this config:

```bash
# AGS v3
yay -S aylurs-gtk-shell

# SCSS compiler used by build.sh
sudo pacman -S sassc

# Hyprland IPC tools used by widgets/shell/store.ts
sudo pacman -S socat
```

Optional but recommended:

```bash
yay -S ttf-nerd-fonts-symbols-mono
```

## Run

From this directory (`~/.config/ags`):

```bash
./build.sh
ags run --gtk 4
```

## Restart During Development

```bash
./build.sh
pkill ags || true
ags run --gtk 4
```

## Runtime Model

`app.ts` imports each window module, then starts AGS:

- `widgets/shell/overlay/window.ts`
- `widgets/shell/bar/window.ts`
- `widgets/shell/launcher/window.ts`
- `widgets/shell/controlCenter/window.ts`
- `widgets/shell/notifications/window.ts`
- `widgets/shell/overview/window.ts`

State and actions are centralized in `widgets/shell/store.ts`.

## Matugen Integration
` currently working on this `

## Hyprland Autostart

In `~/.config/hypr/hyprland.conf`:

```ini
exec-once = ags run --gtk 4
```
