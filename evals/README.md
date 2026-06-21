# zip.cat evals

## Inline substitutions

Run the `*(...)` substitution suite:

```sh
bun run eval:inline
```

Run one OpenRouter model:

```sh
bun run eval:inline -- --models openrouter:openai/gpt-4.1-mini
```

Run selected cases:

```sh
bun run eval:inline -- --case capital-france-leading --case two-substitutions
```

Run the local Gemma adapter:

```sh
bun run eval:inline:local
```

`local-gemma-node` attempts to load the vendored Gemma WebGPU bundle from the
Node/Bun runtime. It skips with a clear reason when `navigator.gpu` is not
available. The current local app path runs Gemma in the browser, where WebGPU is
available; pure Node/Bun local evals require a runtime that exposes WebGPU.

JSON results are written to `evals/results/` by default. Use `--no-out` for a
console-only run.
