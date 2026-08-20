# omp-fff

An [oh-my-pi](https://github.com/can1357/oh-my-pi) (omp) extension that replaces the built-in `find` and `grep` tools with [FFF](https://github.com/dmtrKovalenko/fff) — a Rust-native, SIMD-accelerated file finder with built-in memory.

Port of [`@ff-labs/pi-fff`](https://github.com/dmtrKovalenko/fff/tree/main/packages/pi-fff) (v0.10.5), adapted for the omp extension runtime. **omp only** — upstream pi is not a target.

## Origin: pi-fff

The upstream is [@ff-labs/pi-fff](https://github.com/dmtrKovalenko/fff/tree/main/packages/pi-fff) (v0.10.5), the FFF-powered file search extension for the pi coding agent, published as part of the [FFF monorepo](https://github.com/dmtrKovalenko/fff) by Dmitry Kovalenko (MIT).

Adaptations for omp:

- Tool renderers (`renderCall`/`renderResult`) use omp's `(args, options, theme)` contract instead of pi's `(args, theme, context)`
- `@`-mention autocomplete matches omp's 3-argument `getSuggestions` (pi passes an abort signal)
- pi-only tool fields (`promptSnippet`/`promptGuidelines`) dropped — omp does not read them
- `sdk.ts` uses string-literal dynamic imports; omp's loader rewrites only literal specifiers to absolute paths inside its compiled binary
- Bun-only: the node/bun runtime split and the `@ff-labs/fff-node` dependency were removed
- Data directory is `~/.omp/agent` (`$PI_CODING_AGENT_DIR`) instead of `~/.pi/agent`
- Manifest declares `omp.extensions` only, so pi does not auto-discover it

## What it does

| Built-in tool | omp-fff replacement | Improvement |
|---|---|---|
| `find` (spawns `fd`) | `fffind` (FFF `fileSearch`) | Fuzzy matching, frecency ranking, git-aware, pre-indexed |
| `grep` (spawns `rg`) | `ffgrep` (FFF `grep`) | SIMD-accelerated, frecency-ordered, mmap-cached, no subprocess |
| *(none)* | `fff-multi-grep` (FFF `multiGrep`, opt-in) | OR-logic multi-pattern search via Aho-Corasick |
| `@` file autocomplete (fd-backed) | `@` file autocomplete (FFF-backed, default) | Fuzzy ranking from FFF index/frecency |

Key advantages over the built-in tools: no `fd`/`rg` subprocess per call, pre-indexed background scan at session start, frecency ranking that learns across sessions, query-history boost, git-aware ranking (modified/staged/untracked files first), smart case, typo-tolerant fuzzy file search, and cursor pagination for grep/find results.

## Install

Requirements: oh-my-pi 17.x.

### Via the omp plugin manager (recommended)

```bash
omp plugin install git:github.com/tnmt-1/omp-fff
```

Pin to a release tag:

```bash
omp plugin install git:github.com/tnmt-1/omp-fff@v0.1.0
```

Restart omp. Verify with `omp plugin list` and the `/fff-health` command.

### Manual (config.yml)

Add the extension entry to `~/.omp/agent/config.yml`:

```yaml
extensions:
  - /path/to/omp-fff/src/index.ts
```

or run with `omp -e /path/to/omp-fff/src/index.ts`.

### Local development

Clone the repo, then point the plugins dependency at it:

```json
{
  "dependencies": {
    "omp-fff": "file:/path/to/omp-fff"
  }
}
```

```bash
cd ~/.omp/plugins && bun install
```

and add the entry to `~/.omp/plugins/omp-plugins.lock.json`:

```json
{
  "plugins": {
    "omp-fff": {
      "version": "0.1.0",
      "enabledFeatures": null,
      "enabled": true
    }
  },
  "settings": {}
}
```

## Tools

### `ffgrep`

Search file contents. Smart case; plain text by default, regex auto-detected.

- `pattern` — search text or regex
- `path` — directory prefix (`src/`), bare filename (`main.rs`), or glob (`*.ts`, `src/**/*.cc`). Absolute, `~/`, and `../` paths outside the workspace are searched with a separate index
- `exclude` — exclude paths, same syntax as `path` (`test/,*.min.js`)
- `caseSensitive` — force case-sensitive (default: smart case)
- `context` — context lines before/after each match (0–20)
- `limit` — max matches (default 20)
- `cursor` — pagination cursor from the previous result

### `fffind`

Fuzzy file name search, frecency-ranked, matching the whole repo-relative path.

- `pattern` — fuzzy query (multi-word = AND)
- `path` — path constraint, same syntax as `ffgrep`
- `exclude` — exclude paths
- `limit` — max results (default 30)
- `cursor` — pagination cursor

### `fff-multi-grep`

OR-logic multi-pattern content search (SIMD Aho-Corasick). Disabled by default; set `PI_FFF_MULTIGREP=1` to enable.

## Commands

- `/fff-health` — FFF status (version, mode, git, indexed files, frecency/history DB status)
- `/fff-rescan` — trigger a file rescan
- `/fff-mode [tools-and-ui | tools-only | override]` — show/set mode (tool name change requires `/reload`)

## Modes

- `tools-and-ui` (default): registers `fffind`, `ffgrep` (+ `fff-multi-grep`) alongside the built-ins + FFF-backed `@` autocomplete
- `tools-only`: same tools, keep the default `@` autocomplete
- `override`: replaces omp's built-in `find`/`grep` with FFF-backed ones + `@` autocomplete

Precedence: `--fff-mode` flag → `PI_FFF_MODE` env → persisted `/fff-mode` setting → default.

## Flags

- `--fff-mode <mode>` — set mode
- `--fff-frecency-db <path>` / `--fff-history-db <path>` — DB path overrides (also `FFF_FRECENCY_DB` / `FFF_HISTORY_DB`)
- `--fff-enable-root-scan` — allow indexing when launched from `/` (also `FFF_ENABLE_ROOT_SCAN=1`)
- `--fff-enable-home-scan` — index `$HOME` when launched from there (default on; disable with `--fff-enable-home-scan=false` or `FFF_ENABLE_HOME_SCAN=0` if your home tree is huge)

## Data

Two LMDB databases (frecency + query history), resolved per-path in this order:

1. CLI flag
2. Env var
3. An existing [fff.nvim](https://github.com/dmtrKovalenko/fff.nvim) database (`$XDG_CACHE_HOME/nvim/fff_nvim`, `$XDG_DATA_HOME/nvim/fff_queries`) so omp reuses the frecency you built in your editor
4. Host agent dir, created on demand — `$PI_CODING_AGENT_DIR/fff/{frecency,history}`, defaulting to `~/.omp/agent/fff/{frecency,history}`

The extension only reads these databases; it never writes your agent's searches into your Neovim history. If a database can't be opened, the finder starts without persistence and shows a warning instead of failing.

## Security

No shell execution, no network calls, no telemetry, no credential handling. Search state is stored locally under the agent dir.

## Development

```bash
bun install
bun run typecheck   # typechecks against @oh-my-pi 17.3.8 types
```

The runtime imports `@oh-my-pi/pi-coding-agent`, `@oh-my-pi/pi-tui`, and `@sinclair/typebox`; omp's legacy-pi compat layer rewrites them to the host-bundled packages, so they are peer deps that never need to be installed. The native FFI binding (`@ff-labs/fff-bun` → `libfff_c.dylib` for darwin-arm64) resolves from this package's `node_modules`.

## License

MIT. Upstream FFF and pi-fff are MIT © Dmitry Kovalenko.
