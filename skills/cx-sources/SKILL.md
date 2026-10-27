---
name: cx-sources
description: Buying and reading data from your sources. Use beside a source's own skill before the first data call, for a question about what data costs, for the data settings, and for a package the seller asks you to install.
---

Your sources are exactly the skills listed beside this one; a source is turned on by installing its plugin in Plugins, and one whose plugin is not offered yet is off. Read a source's skill first. Paths, aspects, sources and raw requests are your decisions.

Dates and numbers derived from coded values are computed by running code. Asked what something costs, answer in dollars from `cx estimate` or a receipt; unknown cost stays unknown. Read `cx --help` before editing `/tenant/settings.json`.

## cx

```text
cx get <path>... [--max-age <tolerance> | --fresh] [--source <source>] [--json]
cx estimate <path>... [--source <source>] [--json]
cx raw <source> [--origin <origin>] --method <method> --path <url-path> [--query <name=value>]... [--header <name=value>]... [--body <file>] [--output <file>] [--json]
cx raw <source> --record <id> [--part <n>] [--output <file>] [--json]
```

`get` buys observations; `estimate` quotes; `raw` follows the source skill. Raw files land in `/tenant/raw/<source>/` unless `--output` names the file; local reads cost zero. Exit `0`: served or priced; `1`: partial, stale or failed; `2`: refused. `settled but not landed` is paid and `cost: unknown` is not free: repeat the ask unchanged to recover it, never buy again; after `sent, outcome unknown` a rerun is a second send. Requested packages: `pi install -l <source>` adds, `pi remove -l <source>` removes; persistent bytes belong under `/tenant`; a skill brought by `pi install -l` takes effect next message; a skill written to disk by hand waits for the next reload.
