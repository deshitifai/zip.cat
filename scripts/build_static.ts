import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { renderPage } from "../src/render";

const outDir = "dist/static";

async function bundle(entrypoint: string, outfile: string) {
  const result = await Bun.build({
    define: {
      __ZIP_CAT_STATIC_BUILD__: "true"
    },
    entrypoints: [entrypoint],
    minify: true,
    target: "browser"
  });

  if (!result.success) {
    throw new Error(`Failed to bundle ${entrypoint}.`);
  }
  await Bun.write(outfile, await result.outputs[0].text());
}

async function copyFile(source: string, target: string) {
  await Bun.write(target, Bun.file(source));
}

async function assertNoSecrets(paths: string[]) {
  const forbidden = [
    "EXA_API_KEY",
    "SERP_API_KEY",
    "OPENROUTER_API_KEY",
    "OPENAI_API_KEY",
    "CLOUDFLARE_API_TOKEN",
    "CLOUDFLARE_ACCOUNT_ID"
  ];

  for (const path of paths) {
    const text = await Bun.file(path).text();
    const found = forbidden.find((needle) => text.includes(needle));
    if (found) {
      throw new Error(`Static artifact ${path} includes forbidden secret reference ${found}.`);
    }
  }
}

await rm(outDir, {
  force: true,
  recursive: true
});
await mkdir(outDir, {
  recursive: true
});

const indexPath = join(outDir, "index.html");
const clientPath = join(outDir, "client.js");
const moonshineWorkerPath = join(outDir, "browser-moonshine-worker.js");
const gemmaWorkerPath = join(outDir, "browser-gemma-worker.js");
const gemmaBundlePath = join(outDir, "gemma-4-e2b.js");

await Bun.write(indexPath, renderPage({
  staticBuild: true
}));
await bundle("src/client.ts", clientPath);
await bundle("src/browserMoonshineWorker.ts", moonshineWorkerPath);
await bundle("src/browserGemmaWorker.ts", gemmaWorkerPath);
await copyFile("vendor/gemma-4-e2b.js", gemmaBundlePath);
await assertNoSecrets([
  indexPath,
  clientPath,
  moonshineWorkerPath,
  gemmaWorkerPath,
  gemmaBundlePath
]);

console.log(`Static zip.cat written to ${outDir}`);
