# TranslateGemma UI

[![Build](https://img.shields.io/github/actions/workflow/status/realies/translategemma-ui/build.yml?style=flat-square&logo=github)](https://github.com/realies/translategemma-ui/actions)
[![Pulls](https://img.shields.io/docker/pulls/realies/translategemma-ui?style=flat-square&logo=docker)](https://hub.docker.com/r/realies/translategemma-ui)
[![Size](https://img.shields.io/docker/image-size/realies/translategemma-ui?style=flat-square&logo=docker)](https://hub.docker.com/r/realies/translategemma-ui)

Web interface for [TranslateGemma](https://blog.google/innovation-and-ai/technology/developers-tools/translategemma/), Google's open translation model.

![TranslateGemma UI](https://github.com/user-attachments/assets/8c58730a-5fe2-4e0c-a327-08db3ba49346)

## Features

- **55 languages** — searchable dropdowns with native names
- **Local inference** — no data leaves your machine, powered by [Ollama](https://ollama.ai)
- **Keyboard-first** — `⌘ Enter` / `Ctrl Enter` triggers translation from anywhere on the page; arrow keys navigate language dropdowns
- **Remembers preferences** — last used language pair is restored on reload
- **Swap languages** — flip source and target with one click
- **Translation stats** — shows duration and token count after each translation
- **Light & dark mode** — follows your system preference
- **Multi-arch Docker** — native images for `linux/amd64` and `linux/arm64`

## Quick Start

```yaml
services:
  translategemma-ui:
    image: realies/translategemma-ui
    container_name: translategemma-ui
    restart: unless-stopped
    ports:
      - 3000:3000
    environment:
      - OLLAMA_URL=http://host.docker.internal:11434
    extra_hosts:
      - "host.docker.internal:host-gateway"
```

Access the UI at `http://localhost:3000`

## Requirements

[Ollama](https://ollama.ai) running with a TranslateGemma model:

```bash
ollama pull translategemma:27b   # best quality (~16GB)
ollama pull translategemma:12b   # balanced (~7GB)
ollama pull translategemma:4b    # fastest (~2.5GB)
```

## Configuration

| Variable        | Default                  | Description                          |
| --------------- | ------------------------ | ------------------------------------ |
| `OLLAMA_URL`    | `http://localhost:11434` | Ollama API endpoint                  |
| `DEFAULT_MODEL` | `translategemma:27b`     | Model to use (`27b`, `12b`, or `4b`) |
| `PORT`          | `3000`                   | Server port                          |
| `HOST`          | `0.0.0.0`                | Server host                          |

## Supported Languages

Arabic, Bengali, Bulgarian, Catalan, Chinese (Simplified/Traditional), Croatian, Czech, Danish, Dutch, English, Estonian, Filipino, Finnish, French (Canada/France), German, Greek, Gujarati, Hebrew, Hindi, Hungarian, Icelandic, Indonesian, Italian, Japanese, Kannada, Korean, Latvian, Lithuanian, Malayalam, Marathi, Norwegian, Persian, Polish, Portuguese (Brazil/Portugal), Punjabi, Romanian, Russian, Serbian, Slovak, Slovenian, Spanish (Mexico), Swahili, Swedish, Tamil, Telugu, Thai, Turkish, Ukrainian, Urdu, Vietnamese, Zulu

## Tech Stack

- [TanStack Start](https://tanstack.com/start) — React 19 full-stack framework
- [Tailwind CSS](https://tailwindcss.com) — styling
- [TypeScript](https://www.typescriptlang.org) — type safety
