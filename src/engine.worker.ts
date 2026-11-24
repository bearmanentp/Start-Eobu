import {
  env,
  pipeline,
  TextStreamer,
  type TextGenerationPipeline,
} from "@huggingface/transformers";
env.allowLocalModels = false;
const db = new Promise<IDBDatabase>((resolve, reject) => {
  const r = indexedDB.open("star-eobu-model-v1", 1);
  r.onupgradeneeded = () => r.result.createObjectStore("files");
  r.onsuccess = () => resolve(r.result);
  r.onerror = () => reject(r.error);
});
async function cache() {
  const conn = await db;
  env.useBrowserCache = false;
  env.useCustomCache = true;
  env.customCache = {
    async match(key: string) {
      const blob = await new Promise<Blob | undefined>((resolve, reject) => {
        const r = conn.transaction("files").objectStore("files").get(key);
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      });
      return blob
        ? new Response(blob, {
            headers: { "content-length": String(blob.size) },
          })
        : undefined;
    },
    async put(key: string, response: Response) {
      const blob = await response.blob();
      await new Promise<void>((resolve, reject) => {
        const t = conn.transaction("files", "readwrite");
        t.objectStore("files").put(blob, key);
        t.oncomplete = () => resolve();
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error);
      });
    },
  } as unknown as Cache;
}
let generator: TextGenerationPipeline | undefined;
self.onmessage = async ({ data }) => {
  try {
    if (data.type === "load") {
      await cache().catch(() => {});
      const sizes = new Map<string, [number, number]>();
      const load = (choice: "quality" | "light") =>
        pipeline(
          "text-generation",
          choice === "quality"
            ? "onnx-community/Qwen3-4B-ONNX"
            : "onnx-community/gemma-3-1b-it-ONNX-GQA",
          {
            device: choice === "quality" ? "webgpu" : "wasm",
            dtype: choice === "quality" ? "q4f16" : "q4",
            progress_callback: (p) => {
              if (p.status === "progress") {
                sizes.set(p.file, [p.loaded, p.total]);
                const all = [...sizes.values()];
                self.postMessage({
                  type: "progress",
                  value: Math.min(
                    99,
                    Math.round(
                      (100 * all.reduce((a, v) => a + v[0], 0)) /
                        (all.reduce((a, v) => a + v[1], 0) || 1),
                    ),
                  ),
                });
              }
            },
          },
        );
      const nav = navigator as Navigator & {
        deviceMemory?: number;
        gpu?: {
          requestAdapter: () => Promise<{
            features: { has: (s: string) => boolean };
          } | null>;
        };
      };
      let choice: "quality" | "light" = data.choice;
      if (choice === "quality") {
        const adapter =
          (nav.deviceMemory ?? 8) >= 8
            ? await nav.gpu?.requestAdapter().catch(() => null)
            : null;
        if (!adapter?.features.has("shader-f16")) choice = "light";
      }
      self.postMessage({ type: "loading", choice });
      try {
        generator = await load(choice);
      } catch (error) {
        if (choice === "light") throw error;
        choice = "light";
        sizes.clear();
        self.postMessage({ type: "loading", choice });
        generator = await load(choice);
      }
      self.postMessage({ type: "ready", choice });
    } else if (generator) {
      await generator(
        [
          {
            role: "user",
            content:
              data.messages
                .map((m: { content: string }) => m.content)
                .join("\n\n") + "\n/no_think",
          },
        ],
        {
          max_new_tokens: 350,
          do_sample: false,
          streamer: new TextStreamer(generator.tokenizer, {
            skip_prompt: true,
            callback_function: (t) =>
              self.postMessage({ type: "chunk", value: t }),
          }),
        },
      );
      self.postMessage({ type: "done" });
    }
  } catch {
    self.postMessage({ type: "error" });
  }
};
