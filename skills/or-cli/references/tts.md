# Text-to-Speech (TTS) with `or`

**TTS uses a dedicated OpenRouter endpoint (`/api/v1/audio/speech`), NOT `or chat`.** Do not try to generate speech via `or chat` — chat completions return text, not audio bytes.

## Critical Rule: Read Model Descriptions

**Always run `or show <model-id>` before using a TTS model.** Model names are misleading:

- `google/lyria-3-pro-preview` has `audio` output but generates **music/songs**, not speech
- `openai/gpt-audio-mini` is **speech-to-text + text-to-speech via chat completions**, not the dedicated TTS endpoint
- `hexgrad/kokoro-82m` is a lightweight **text-to-speech** model

Use `or tts --list-models` to discover actual TTS models, then `or show <id>` to confirm.

## Commands

```bash
# List available TTS models
or tts --list-models

# List voices for a specific model
or tts --list-voices -m hexgrad/kokoro-82m

# Generate speech (default model: hexgrad/kokoro-82m)
or tts "Hello world" -o hello.mp3

# Use a specific model and voice
or tts "The quick brown fox" -m sesame/csm-1b -v conversational_a -o output.mp3

# Change format to PCM (lower latency, raw audio)
or tts "Hello" -f pcm -o hello.pcm

# Adjust speed (OpenAI-compatible models only)
or tts "Hello" -m x-ai/grok-voice-tts-1.0 -s 1.2 -o hello.mp3

# JSON output (metadata only, audio still saved)
or tts "Hello" --json -o hello.mp3
```

## Options

| Flag | Description |
|------|-------------|
| `-m, --model <id>` | TTS model (default: `hexgrad/kokoro-82m`) |
| `-v, --voice <voice>` | Voice identifier (default varies by model) |
| `-o, --output <path>` | Output file path (default: `output.mp3`) |
| `-f, --format <format>` | `mp3` or `pcm` (default: `mp3`) |
| `-s, --speed <n>` | Playback speed 0.5–2.0 (OpenAI/Azure only) |
| `--input <text>` | Text input (alternative to positional arg) |
| `--list-models` | List all available TTS models |
| `--list-voices` | List supported voices for the selected model |
| `--json` | Output metadata as JSON |

## Pricing

TTS models are priced **per character** of input text, not per token.

| Model | Price per char | Notes |
|-------|---------------|-------|
| `hexgrad/kokoro-82m` | ~$0.00000062 | Cheapest, lightweight |
| `google/gemini-3.1-flash-tts-preview` | ~$0.000001 | Fast, many voices |
| `zyphra/zonos-v0.1-*` | ~$0.000007 | English only |
| `sesame/csm-1b` | ~$0.000007 | Conversational style |
| `canopylabs/orpheus-3b-0.1-ft` | ~$0.000007 | Expressive delivery |
| `x-ai/grok-voice-tts-1.0` | ~$0.000015 | 20+ languages |
| `mistralai/voxtral-mini-tts-2603` | ~$0.000016 | Emotion control |
| `microsoft/mai-voice-2` | ~$0.000022 | Expressive SSML styles |

## Voice Selection

Each model has its own voice set. **Always check voices before using a model:**

```bash
# List voices for a model
or tts --list-voices -m hexgrad/kokoro-82m
or tts --list-voices -m mistralai/voxtral-mini-tts-2603
```

Common voice patterns:
- **Kokoro**: `af_bella`, `am_adam`, `bf_emma`, `bm_daniel` (`af` = American Female, `bm` = British Male)
- **Mistral Voxtral**: `en_paul_neutral`, `gb_oliver_cheerful`, `fr_marie_happy`
- **Sesame CSM**: `conversational_a`, `read_speech_a`
- **xAI Grok**: `eve`, `ara`, `rex`, `sal`, `leo`
- **Google Gemini TTS**: `Puck`, `Charon`, `Kore`, `Zephyr`
- **Microsoft MAI-Voice-2**: `en-US-Harper:MAI-Voice-2`, `fr-FR-Soleil:MAI-Voice-2`

## Response Format

The endpoint returns a **raw audio byte stream** with headers:
- `Content-Type: audio/mpeg` (for `mp3`) or `audio/pcm` (for `pcm`)
- `X-Generation-Id`: Unique generation ID for tracking

## Common Mistakes

- **Don't use `or chat` for TTS.** Chat completions return text, not audio. Use `or tts`.
- **Don't guess voice names.** Run `or tts --list-voices` first.
- **Don't assume all "audio" models do TTS.** `google/lyria-3-*` generates music, not speech.
- **Don't use `--save` with TTS.** `--save` is for image generation. `or tts` uses `-o, --output`.
- **TTS is priced per character, not per token.** A 100-character sentence costs ~$0.000062 on Kokoro.
