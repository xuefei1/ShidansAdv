# Play on macOS

The browser game uses the same files on macOS and Windows. No Windows emulation, engine editor, package installation, or separate game build is required.

1. Install a supported **Node.js LTS** release from [the official download page](https://nodejs.org/en/download). Node 22 or newer is required; Node 24 LTS is a suitable choice. Choose the macOS installer appropriate for your Mac.
2. Clone this repository or download and extract its ZIP. Keep `src/`, `vendor/`, `scripts/`, and the launcher together.
3. Double-click **Start-Game.command**. It starts a server bound to your own computer and opens `http://localhost:4173` in the default browser.
4. Leave its Terminal window open during play. Press **Control-C** in that window when finished.

The launcher supports the standard Node installer path and Homebrew's Apple silicon and Intel paths. The game itself has no native CPU-specific dependencies. If a custom Node location is needed, launch with `SHIDAN_NODE=/absolute/path/to/node bash Start-Game.command`.

If Finder reports a permission error for a ZIP download, open Terminal, type `cd `, drag the extracted project folder into Terminal, and press Return. Then run:

```sh
bash Start-Game.command
```

If the game is already running, open the localhost address instead of starting a second server. To use a different port: `PORT=4174 bash Start-Game.command`.

## Mouse and trackpad

- WASD moves; Shift runs. Tap Space for a hop, or hold and release for a long jump on bedding, carpet, and grass.
- Click the scene for free mouse look when the browser permits it. Otherwise, hold and drag to look. The fallback works without pointer capture.
- Two-finger secondary click, a mouse right-click, or **P** drops a poop ball. P is convenient when moving with a trackpad.
- Scroll changes camera distance. **M** opens the map, **V** opens the tour, and **Esc** pauses.

Use a current desktop browser with WebGL 2 enabled. If a browser refuses mouse capture, drag-to-look is the supported fallback. Native Safari pointer capture is not a requirement. Opening `index.html` as a file is unsupported; use the launcher so browser modules load over HTTP.

## Verification

GitHub Actions runs parsing, the actual-level physics tests, and the static build on macOS, Windows, and Linux. The macOS and Linux jobs also start the game through `Start-Game.command` and fetch its page, scripts, engine and stylesheet. Launcher executable permissions and Unix line endings are tracked by Git.

The development machine is Windows. A macOS CI pass verifies the launcher/server, tests, and build; it does not replace a hands-on Safari or macOS graphics/input playtest.
