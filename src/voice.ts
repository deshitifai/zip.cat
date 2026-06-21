import { access, mkdtemp, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

export type VoiceTranscriptionResponse = {
  text: string;
  model: "moonshine";
  provider: "moonshine.ai";
  elapsedMs: number;
};

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const moonshineScriptPath = join(projectRoot, "scripts", "moonshine_transcribe.py");
const moonshineStreamScriptPath = join(projectRoot, "scripts", "moonshine_stream.py");
const localPythonPath = join(projectRoot, ".venv", "bin", "python");
const textEncoder = new TextEncoder();

async function pythonPath() {
  try {
    await access(localPythonPath);
    return localPythonPath;
  } catch {
    return "python3";
  }
}

export type MoonshineStreamingSession = {
  send(message: string): Promise<void>;
  close(): void;
};

async function readProcessLines(
  stream: ReadableStream<Uint8Array>,
  onLine: (line: string) => void
) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (line.trim()) {
          onLine(line);
        }
      }
    }
    buffer += decoder.decode();
    if (buffer.trim()) {
      onLine(buffer);
    }
  } finally {
    reader.releaseLock();
  }
}

export async function createMoonshineStreamingSession(options: {
  language?: string;
  onMessage: (message: string) => void;
  onError: (message: string) => void;
}): Promise<MoonshineStreamingSession> {
  const python = await pythonPath();
  const process = Bun.spawn({
    cmd: [python, moonshineStreamScriptPath, options.language ?? "en"],
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe"
  });
  const stdin = process.stdin;
  let closed = false;

  void readProcessLines(process.stdout, options.onMessage).catch((error) => {
    options.onError(error instanceof Error ? error.message : "Moonshine stream failed.");
  });
  void readProcessLines(process.stderr, (line) => {
    options.onError(line);
  }).catch((error) => {
    options.onError(error instanceof Error ? error.message : "Moonshine stream failed.");
  });
  void process.exited.then((exitCode) => {
    if (!closed && exitCode !== 0) {
      options.onError(`Moonshine stream exited with ${python} and code ${exitCode}.`);
    }
  });

  return {
    async send(message: string) {
      if (closed) {
        return;
      }
      stdin.write(textEncoder.encode(`${message}\n`));
      await stdin.flush();
    },
    close() {
      if (closed) {
        return;
      }
      closed = true;
      try {
        stdin.write(textEncoder.encode("{\"type\":\"close\"}\n"));
        stdin.end();
      } catch {
        // The process may already be closed.
      }
      process.kill();
    }
  };
}

export async function transcribeMoonshineWav(audio: ArrayBuffer, language = "en"): Promise<VoiceTranscriptionResponse> {
  if (audio.byteLength === 0) {
    throw new Error("No audio was recorded.");
  }

  const startedAt = performance.now();
  const directory = await mkdtemp(join(tmpdir(), "zip-cat-voice-"));
  const wavPath = join(directory, "input.wav");

  try {
    await writeFile(wavPath, new Uint8Array(audio));
    const python = await pythonPath();
    const process = Bun.spawn({
      cmd: [python, moonshineScriptPath, wavPath, language],
      stdout: "pipe",
      stderr: "pipe"
    });
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(process.stdout).text(),
      new Response(process.stderr).text(),
      process.exited
    ]);

    if (exitCode !== 0) {
      throw new Error(stderr.trim() || `Moonshine transcription failed with ${python} and exit code ${exitCode}.`);
    }

    const jsonLine = stdout
      .trim()
      .split(/\r?\n/)
      .reverse()
      .find((line) => line.trim().startsWith("{"));
    const parsed = JSON.parse(jsonLine ?? stdout) as { text?: unknown };
    return {
      text: typeof parsed.text === "string" ? parsed.text.trim() : "",
      model: "moonshine",
      provider: "moonshine.ai",
      elapsedMs: performance.now() - startedAt
    };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
