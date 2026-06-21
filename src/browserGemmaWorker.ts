type GemmaChatMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

type GemmaProgress = {
  status?: string;
  message?: string;
  loaded?: number;
  total?: number | null;
  fraction?: number;
  fromCache?: boolean;
};

type GemmaModel = {
  generate: (
    messages: GemmaChatMessage[],
    options: {
      maxNewTokens?: number;
      signal?: AbortSignal;
    }
  ) => AsyncGenerator<{ text: string; delta?: string; token?: number }>;
  warmup?: () => Promise<void>;
};

type GemmaModule = {
  Gemma4Mobile: {
    load: (
      model?: string | null,
      options?: {
        cache?: boolean;
        cacheName?: string;
        onProgress?: (progress: GemmaProgress) => void;
      }
    ) => Promise<GemmaModel>;
  };
};

type WorkerInput =
  | {
      type: "generate";
      requestId: string;
      prompt: string;
      messages?: GemmaChatMessage[];
      maxNewTokens?: number;
    }
  | {
      type: "preload";
    }
  | {
      type: "cancel";
    };

type WorkerOutput =
  | {
      type: "status";
      requestId?: string;
      status: "loading" | "ready" | "generating";
      message: string;
      progress?: GemmaProgress;
    }
  | {
      type: "token";
      requestId: string;
      text: string;
    }
  | {
      type: "done";
      requestId: string;
      text: string;
      elapsedMs: number;
      model: string;
      provider: string;
    }
  | {
      type: "error";
      requestId?: string;
      error: string;
    };

let modelPromise: Promise<GemmaModel> | undefined;
let abortController: AbortController | undefined;

function postMessageToClient(message: WorkerOutput) {
  self.postMessage(message);
}

function requireWebGpu() {
  const gpu = (navigator as Navigator & {
    gpu?: {
      requestAdapter: () => Promise<unknown>;
    };
  }).gpu;
  if (!gpu) {
    throw new Error("Local Gemma requires a browser with WebGPU enabled.");
  }
  return gpu;
}

async function getModel() {
  if (!modelPromise) {
    modelPromise = (async () => {
      const gpu = requireWebGpu();
      const adapter = await gpu.requestAdapter();
      if (!adapter) {
        throw new Error("Local Gemma could not get a WebGPU adapter.");
      }

      postMessageToClient({
        type: "status",
        status: "loading",
        message: "Loading local Gemma 4 WebGPU..."
      });

      const moduleUrl = "/gemma-4-e2b.js";
      const { Gemma4Mobile } = await import(moduleUrl) as unknown as GemmaModule;
      const model = await Gemma4Mobile.load(null, {
        cache: true,
        cacheName: "zip-cat-gemma-4-webgpu",
        onProgress: (progress) => {
          postMessageToClient({
            type: "status",
            status: progress.status === "ready" ? "ready" : "loading",
            message: progress.message ?? "Loading local Gemma 4 WebGPU...",
            progress
          });
        }
      });

      await model.warmup?.();
      postMessageToClient({
        type: "status",
        status: "ready",
        message: "Local Gemma 4 WebGPU ready."
      });
      return model;
    })();
  }

  return modelPromise;
}

self.addEventListener("message", (event: MessageEvent<WorkerInput>) => {
  const message = event.data;
  if (message.type === "cancel") {
    abortController?.abort();
    return;
  }

  if (message.type === "preload") {
    void getModel().catch((error) => {
      postMessageToClient({
        type: "error",
        error: error instanceof Error ? error.message : "Failed to preload local Gemma."
      });
    });
    return;
  }

  if (message.type !== "generate") {
    return;
  }

  void (async () => {
    const startedAt = performance.now();
    abortController?.abort();
    abortController = new AbortController();

    try {
      const model = await getModel();
      postMessageToClient({
        type: "status",
        requestId: message.requestId,
        status: "generating",
        message: "Generating locally..."
      });

      let text = "";
      const messages: GemmaChatMessage[] = message.messages?.length ? message.messages : [
        {
          role: "user",
          content: message.prompt
        }
      ];

      for await (const chunk of model.generate(messages, {
        maxNewTokens: message.maxNewTokens ?? 1024,
        signal: abortController.signal
      })) {
        text = chunk.text;
        postMessageToClient({
          type: "token",
          requestId: message.requestId,
          text
        });
      }

      postMessageToClient({
        type: "done",
        requestId: message.requestId,
        text,
        elapsedMs: performance.now() - startedAt,
        model: "google/gemma-4-E2B-it-qat-mobile-transformers",
        provider: "browser WebGPU"
      });
    } catch (error) {
      postMessageToClient({
        type: "error",
        requestId: message.requestId,
        error: error instanceof Error ? error.message : "Local Gemma request failed."
      });
    }
  })();
});
