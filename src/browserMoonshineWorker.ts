import { AutoModel, Tensor, pipeline } from "@huggingface/transformers";

const SAMPLE_RATE = 16000;
const SAMPLE_RATE_MS = SAMPLE_RATE / 1000;
const SPEECH_THRESHOLD = 0.3;
const EXIT_THRESHOLD = 0.1;
const MIN_SILENCE_DURATION_SAMPLES = 400 * SAMPLE_RATE_MS;
const SPEECH_PAD_SAMPLES = 80 * SAMPLE_RATE_MS;
const MIN_SPEECH_DURATION_SAMPLES = 250 * SAMPLE_RATE_MS;
const MAX_BUFFER_DURATION = 30;
const NEW_BUFFER_SIZE = 512;
const MAX_NUM_PREV_BUFFERS = Math.ceil(SPEECH_PAD_SAMPLES / NEW_BUFFER_SIZE);

type WorkerInput = {
  type?: "audio" | "reset" | "stop";
  buffer?: Float32Array;
};

type WorkerOutput =
  | { type: "status"; status: string; message: string }
  | { type: "partial"; text: string }
  | { type: "final"; text: string }
  | { type: "done"; text: string }
  | { type: "error"; error: string };

function postMessageToClient(message: WorkerOutput) {
  self.postMessage(message);
}

function suppressExpectedRuntimeNoise() {
  const originalWarn = console.warn.bind(console);
  const originalError = console.error.bind(console);
  const isExpectedNoise = (args: unknown[]) => {
    const message = args.map((arg) => String(arg)).join(" ");
    return (
      message.includes("Unknown model class \"custom\"") ||
      message.includes("Some nodes were not assigned to the preferred execution providers") ||
      message.includes("Rerunning with verbose output on a non-minimal build will show node assignments")
    );
  };

  console.warn = (...args: unknown[]) => {
    if (!isExpectedNoise(args)) {
      originalWarn(...args);
    }
  };
  console.error = (...args: unknown[]) => {
    if (!isExpectedNoise(args)) {
      originalError(...args);
    }
  };
}

suppressExpectedRuntimeNoise();

async function supportsWebGPU() {
  try {
    const gpu = (navigator as Navigator & {
      gpu?: {
        requestAdapter: () => Promise<unknown>;
      };
    }).gpu;
    if (!gpu) {
      return false;
    }
    return Boolean(await gpu.requestAdapter());
  } catch {
    return false;
  }
}

const device = await supportsWebGPU() ? "webgpu" : "wasm";
postMessageToClient({
  type: "status",
  status: "loading",
  message: `Loading browser Moonshine (${device})...`
});

const sileroVad = await AutoModel.from_pretrained("onnx-community/silero-vad", {
  config: {
    model_type: "custom"
  } as never,
  dtype: "fp32"
}).catch((error) => {
  postMessageToClient({
    type: "error",
    error: error instanceof Error ? error.message : "Failed to load browser VAD."
  });
  throw error;
});

const dtype = device === "webgpu"
  ? {
    encoder_model: "fp32" as const,
    decoder_model_merged: "q4" as const
  }
  : {
    encoder_model: "fp32" as const,
    decoder_model_merged: "q8" as const
  };

const transcriber = await pipeline(
  "automatic-speech-recognition",
  "onnx-community/moonshine-base-ONNX",
  {
    device,
    dtype
  }
).catch((error) => {
  postMessageToClient({
    type: "error",
    error: error instanceof Error ? error.message : "Failed to load browser Moonshine."
  });
  throw error;
});

await transcriber(new Float32Array(SAMPLE_RATE));
postMessageToClient({
  type: "status",
  status: "ready",
  message: "Browser Moonshine ready."
});

let inferenceChain = Promise.resolve<unknown>(undefined);
const audioBuffer = new Float32Array(MAX_BUFFER_DURATION * SAMPLE_RATE);
let bufferPointer = 0;
const sr = new Tensor("int64", [SAMPLE_RATE], []);
let state = new Tensor("float32", new Float32Array(2 * 1 * 128), [2, 1, 128]);
let isRecording = false;
let postSpeechSamples = 0;
let completedText = "";
let previousBuffers: Float32Array[] = [];
let pendingAudio = new Float32Array(0);
let audioInputChain = Promise.resolve();

async function vad(buffer: Float32Array) {
  const input = new Tensor("float32", buffer, [1, buffer.length]);
  const output = await (inferenceChain = inferenceChain.then(() => sileroVad({
    input,
    sr,
    state
  }))) as {
    stateN: Tensor;
    output: {
      data: Float32Array | number[];
    };
  };
  state = output.stateN;
  const speechProbability = output.output.data[0];
  return speechProbability > SPEECH_THRESHOLD || (isRecording && speechProbability >= EXIT_THRESHOLD);
}

function appendCompletedText(text: string) {
  const trimmed = text.trim();
  if (!trimmed) {
    return;
  }
  completedText = completedText ? `${completedText} ${trimmed}` : trimmed;
}

async function transcribe(buffer: Float32Array) {
  postMessageToClient({
    type: "status",
    status: "transcribing",
    message: "Transcribing..."
  });
  const result = await (inferenceChain = inferenceChain.then(() => transcriber(buffer))) as {
    text?: string;
  };
  appendCompletedText(result.text ?? "");
  postMessageToClient({
    type: "final",
    text: completedText
  });
}

function reset(offset = 0) {
  audioBuffer.fill(0, offset);
  bufferPointer = offset;
  isRecording = false;
  postSpeechSamples = 0;
}

function framesFromIncomingAudio(buffer: Float32Array) {
  const joined = new Float32Array(pendingAudio.length + buffer.length);
  joined.set(pendingAudio, 0);
  joined.set(buffer, pendingAudio.length);

  const frames: Float32Array[] = [];
  let offset = 0;
  while (offset + NEW_BUFFER_SIZE <= joined.length) {
    frames.push(joined.slice(offset, offset + NEW_BUFFER_SIZE));
    offset += NEW_BUFFER_SIZE;
  }
  pendingAudio = joined.slice(offset);
  return frames;
}

function dispatchForTranscriptionAndResetAudioBuffer(overflow?: Float32Array) {
  const buffer = audioBuffer.slice(0, bufferPointer + SPEECH_PAD_SAMPLES);
  const previousLength = previousBuffers.reduce((total, previous) => total + previous.length, 0);
  const paddedBuffer = new Float32Array(previousLength + buffer.length);
  let offset = 0;
  for (const previous of previousBuffers) {
    paddedBuffer.set(previous, offset);
    offset += previous.length;
  }
  paddedBuffer.set(buffer, offset);
  void transcribe(paddedBuffer);

  if (overflow) {
    audioBuffer.set(overflow, 0);
  }
  reset(overflow?.length ?? 0);
  previousBuffers = [];
}

async function flushForStop() {
  if (bufferPointer >= MIN_SPEECH_DURATION_SAMPLES) {
    const buffer = audioBuffer.slice(0, bufferPointer + SPEECH_PAD_SAMPLES);
    const previousLength = previousBuffers.reduce((total, previous) => total + previous.length, 0);
    const paddedBuffer = new Float32Array(previousLength + buffer.length);
    let offset = 0;
    for (const previous of previousBuffers) {
      paddedBuffer.set(previous, offset);
      offset += previous.length;
    }
    paddedBuffer.set(buffer, offset);
    await transcribe(paddedBuffer);
  }
  reset();
  previousBuffers = [];
  postMessageToClient({
    type: "done",
    text: completedText
  });
}

async function processAudioFrame(buffer: Float32Array) {
  const wasRecording = isRecording;
  const isSpeech = await vad(buffer);

  if (!wasRecording && !isSpeech) {
    if (previousBuffers.length >= MAX_NUM_PREV_BUFFERS) {
      previousBuffers.shift();
    }
    previousBuffers.push(buffer);
    return;
  }

  const remaining = audioBuffer.length - bufferPointer;
  if (buffer.length >= remaining) {
    audioBuffer.set(buffer.subarray(0, remaining), bufferPointer);
    bufferPointer += remaining;
    dispatchForTranscriptionAndResetAudioBuffer(buffer.subarray(remaining));
    return;
  }

  audioBuffer.set(buffer, bufferPointer);
  bufferPointer += buffer.length;

  if (isSpeech) {
    if (!isRecording) {
      postMessageToClient({
        type: "status",
        status: "recording",
        message: "Listening..."
      });
    }
    isRecording = true;
    postSpeechSamples = 0;
    postMessageToClient({
      type: "partial",
      text: completedText
    });
    return;
  }

  postSpeechSamples += buffer.length;
  if (postSpeechSamples < MIN_SILENCE_DURATION_SAMPLES) {
    return;
  }

  if (bufferPointer < MIN_SPEECH_DURATION_SAMPLES) {
    reset();
    return;
  }

  dispatchForTranscriptionAndResetAudioBuffer();
}

async function processIncomingAudio(buffer: Float32Array) {
  for (const frame of framesFromIncomingAudio(buffer)) {
    await processAudioFrame(frame);
  }
}

self.onmessage = (event: MessageEvent<WorkerInput>) => {
  const { type, buffer } = event.data;
  if (type === "reset") {
    audioInputChain = audioInputChain.then(() => {
      reset();
      pendingAudio = new Float32Array(0);
      completedText = "";
      previousBuffers = [];
      postMessageToClient({
        type: "partial",
        text: ""
      });
    });
    return;
  }

  if (type === "stop") {
    audioInputChain = audioInputChain.then(async () => {
      if (pendingAudio.length > 0) {
        const padded = new Float32Array(NEW_BUFFER_SIZE);
        padded.set(pendingAudio);
        pendingAudio = new Float32Array(0);
        await processAudioFrame(padded);
      }
      await flushForStop();
    });
    return;
  }

  if (type !== "audio" || !buffer) {
    return;
  }

  audioInputChain = audioInputChain.then(() => processIncomingAudio(buffer)).catch((error) => {
    postMessageToClient({
      type: "error",
      error: error instanceof Error ? error.message : "Browser Moonshine failed."
    });
  });
};
