import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";

// Capture the validator and handler from createServerFn chain
let capturedValidator!: (data: unknown) => unknown;
let capturedHandler!: (ctx: { data: unknown }) => Promise<unknown>;

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({
    inputValidator: (fn: (data: unknown) => unknown) => {
      capturedValidator = fn;
      return {
        handler: (fn: (ctx: { data: unknown }) => Promise<unknown>) => {
          capturedHandler = fn;
          return fn;
        },
      };
    },
  }),
}));

const TEST_BASE_URL = "http://localhost:11434";

function setProviderEnv(provider: "ollama" | "openai"): void {
  process.env["LLM_PROVIDER"] = provider;
  process.env["OLLAMA_URL"] = TEST_BASE_URL;
  delete process.env["OPENAI_BASE_URL"];
  delete process.env["OPENAI_CHAT_COMPLETION_PATH"];
  delete process.env["OPENAI_API_KEY"];
  delete process.env["DEFAULT_MODEL"];
}

async function loadTranslateStreamModule(provider: "ollama" | "openai"): Promise<void> {
  vi.resetModules();
  setProviderEnv(provider);
  await import("./translateStream");
}

describe("translateStream input validator", () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    await loadTranslateStreamModule("ollama");
  });

  it("accepts valid input", () => {
    const result = capturedValidator({
      text: "Hello",
      sourceLanguage: "en",
      targetLanguage: "de_DE",
    });

    expect(result).toEqual({
      text: "Hello",
      sourceLanguage: "en",
      targetLanguage: "de_DE",
    });
  });

  it("accepts optional model parameter", () => {
    const result = capturedValidator({
      text: "Hello",
      sourceLanguage: "en",
      targetLanguage: "de_DE",
      model: "custom-model",
    });

    expect(result).toEqual({
      text: "Hello",
      sourceLanguage: "en",
      targetLanguage: "de_DE",
      model: "custom-model",
    });
  });

  it("trims source and target language codes", () => {
    const result = capturedValidator({
      text: "Hello",
      sourceLanguage: "  en  ",
      targetLanguage: "  de_DE  ",
    });

    expect(result).toEqual({
      text: "Hello",
      sourceLanguage: "en",
      targetLanguage: "de_DE",
    });
  });

  it("throws on null input", () => {
    expect(() => capturedValidator(null)).toThrow("Invalid input");
  });

  it("throws on non-object input", () => {
    expect(() => capturedValidator("string")).toThrow("Invalid input");
    expect(() => capturedValidator(42)).toThrow("Invalid input");
  });

  it("throws when text is missing", () => {
    expect(() => capturedValidator({ sourceLanguage: "en", targetLanguage: "de_DE" })).toThrow(
      "Text is required"
    );
  });

  it("throws when text is empty", () => {
    expect(() =>
      capturedValidator({ text: "   ", sourceLanguage: "en", targetLanguage: "de_DE" })
    ).toThrow("Text is required");
  });

  it("throws when sourceLanguage is missing", () => {
    expect(() => capturedValidator({ text: "Hello", targetLanguage: "de_DE" })).toThrow(
      "Source language is required"
    );
  });

  it("throws when targetLanguage is missing", () => {
    expect(() => capturedValidator({ text: "Hello", sourceLanguage: "en" })).toThrow(
      "Target language is required"
    );
  });
});

describe("translateStream handler", () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    await loadTranslateStreamModule("ollama");
  });

  it("calls Ollama API with stream: true and returns a Response", async () => {
    const ndjsonBody = '{"response":"Hallo","done":false}\n{"response":"","done":true}\n';

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(ndjsonBody));
            controller.close();
          },
        }),
      })
    );

    const result = (await capturedHandler({
      data: { text: "Hello", sourceLanguage: "en", targetLanguage: "de_DE" },
    })) as Response;

    expect(result).toBeInstanceOf(Response);
    expect(result.headers.get("Content-Type")).toBe("application/x-ndjson");

    const [url, options] = (fetch as Mock).mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${TEST_BASE_URL}/api/generate`);
    const body = JSON.parse(options.body as string) as Record<string, unknown>;
    expect(body["stream"]).toBe(true);
    expect(body["model"]).toBe("translategemma:27b");
  });

  it("throws on non-200 API response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: () => Promise.resolve("Internal Server Error"),
      })
    );

    await expect(
      capturedHandler({
        data: { text: "Hello", sourceLanguage: "en", targetLanguage: "de_DE" },
      })
    ).rejects.toThrow("Ollama API error: 500 - Internal Server Error");
  });

  it("uses custom model when provided", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        body: new ReadableStream({
          start(controller) {
            controller.close();
          },
        }),
      })
    );

    await capturedHandler({
      data: {
        text: "Hello",
        sourceLanguage: "en",
        targetLanguage: "de_DE",
        model: "custom-model",
      },
    });

    const body = JSON.parse(
      ((fetch as Mock).mock.calls[0] as [string, RequestInit])[1].body as string
    ) as Record<string, unknown>;
    expect(body["model"]).toBe("custom-model");
  });
});

describe("translateStream handler (openai)", () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    await loadTranslateStreamModule("openai");
  });

  it("calls OpenAI-compatible API with stream: true and returns NDJSON", async () => {
    const sseBody = [
      'data: {"model":"translategemma:27b","choices":[{"delta":{"content":"Hallo"}}]}',
      "",
      'data: {"model":"translategemma:27b","choices":[{"delta":{"content":" Welt"}}],"usage":{"completion_tokens":2}}',
      "",
      "data: [DONE]",
      "",
    ].join("\n");

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(sseBody));
            controller.close();
          },
        }),
      })
    );

    const result = (await capturedHandler({
      data: { text: "Hello", sourceLanguage: "en", targetLanguage: "de_DE" },
    })) as Response;

    expect(result).toBeInstanceOf(Response);
    expect(result.headers.get("Content-Type")).toBe("application/x-ndjson");

    const resultText = await result.text();
    expect(resultText).toContain('{"response":"Hallo","done":false,"model":"translategemma:27b"}');
    expect(resultText).toContain('{"response":" Welt","done":false,"model":"translategemma:27b"}');
    expect(resultText).toContain(
      '{"response":"","done":true,"model":"translategemma:27b","eval_count":2}'
    );

    // Verify fetch was called with stream: true
    const [url, options] = (fetch as Mock).mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${TEST_BASE_URL}/v1/chat/completions`);
    const body = JSON.parse(options.body as string) as Record<string, unknown>;
    expect(body["stream"]).toBe(true);
    expect(body["model"]).toBe("translategemma:27b");
    const messages = body["messages"] as Record<string, unknown>[];
    expect(messages[0]?.["role"]).toBe("user");
  });

  it("throws on non-200 API response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: () => Promise.resolve("Internal Server Error"),
      })
    );

    await expect(
      capturedHandler({
        data: { text: "Hello", sourceLanguage: "en", targetLanguage: "de_DE" },
      })
    ).rejects.toThrow("OpenAI API error: 500 - Internal Server Error");
  });

  it("retries with /api/v1/chat/completions when /v1 returns 405", async () => {
    const sseBody = ['data: {"choices":[{"delta":{"content":"ok"}}]}', "", "data: [DONE]", ""].join(
      "\n"
    );

    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({
          ok: false,
          status: 405,
          text: () => Promise.resolve('{"detail":"Method Not Allowed"}'),
        })
        .mockResolvedValueOnce({
          ok: true,
          body: new ReadableStream({
            start(controller) {
              controller.enqueue(new TextEncoder().encode(sseBody));
              controller.close();
            },
          }),
        })
    );

    const result = (await capturedHandler({
      data: { text: "Hello", sourceLanguage: "en", targetLanguage: "de_DE" },
    })) as Response;

    expect((fetch as Mock).mock.calls).toHaveLength(2);
    expect(((fetch as Mock).mock.calls[0] as [string])[0]).toBe(
      `${TEST_BASE_URL}/v1/chat/completions`
    );
    expect(((fetch as Mock).mock.calls[1] as [string])[0]).toBe(
      `${TEST_BASE_URL}/api/v1/chat/completions`
    );

    expect(result).toBeInstanceOf(Response);
  });

  it("uses custom model when provided", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        body: new ReadableStream({
          start(controller) {
            controller.close();
          },
        }),
      })
    );

    await capturedHandler({
      data: {
        text: "Hello",
        sourceLanguage: "en",
        targetLanguage: "de_DE",
        model: "custom-model",
      },
    });

    const body = JSON.parse(
      ((fetch as Mock).mock.calls[0] as [string, RequestInit])[1].body as string
    ) as Record<string, unknown>;
    expect(body["model"]).toBe("custom-model");
  });
});
