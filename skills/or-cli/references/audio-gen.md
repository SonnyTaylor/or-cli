# Audio Generation (TTS) with `or create audio`

Generate speech audio from text using OpenRouter's dedicated `/api/v1/audio/speech` endpoint.

**This is a dedicated endpoint — do NOT use `or ask` or `or chat` for TTS.**

## Critical: Read Model Descriptions

**Always run `or show <model-id>` before using a TTS model.** Model names lie:

- `google/lyria-3-pro-preview` outputs **music/songs**, not speech
- `openai/gpt-audio-mini` is STT+TTS via **chat completions**, not the dedicated TTS endpoint
- `hexgrad/kokoro-82m` is a lightweight **text-to-speech** model

Use `or create audio --list-models` to discover actual TTS models, then `or show <id>` to confirm.

## Basic Usage

```bash
# Default model (hexgrad/kokoro-82m)
or create audio "Hello world" -o hello.mp3

# Specific model and voice
or create audio "The quick brown fox" -m sesame/csm-1b -v conversational_a -o output.mp3

# Adjust speed (OpenAI-compatible models only)
or create audio "Hello" -m x-ai/grok-voice-tts-1.0 -s 1.2 -o hello.mp3

# PCM format (lower latency, raw audio)
or create audio "Hello" -f pcm -o hello.pcm
```

## Options

| Flag | Purpose |
|------|---------|
| `-m, --model <id>` | TTS model (default: `hexgrad/kokoro-82m`) |
| `-v, --voice <voice>` | Voice identifier (default: `alloy`) |
| `-o, --output <path>` | Output file path (default: `output.mp3`) |
| `-f, --format <format>` | `mp3` or `pcm` (default: `mp3`) |
| `-s, --speed <n>` | Playback speed 0.5–2.0 (OpenAI/Azure only) |
| `--input <text>` | Text input (alternative to positional arg) |
| `--list-models` | List all available TTS models |
| `--list-voices` | List supported voices for the selected model |
| `--dry-run` | Show cost estimate without generating |
| `--json` | Output metadata as JSON |
| `--quiet` | Suppress non-error output |

## Discovering Models and Voices

```bash
# List all TTS models
or create audio --list-models

# List voices for a specific model
or create audio --list-voices -m hexgrad/kokoro-82m
or create audio --list-voices -m mistralai/voxtral-mini-tts-2603

# Check model details
or show hexgrad/kokoro-82m
```

## Voice Patterns

Each model has its own voice set. **Always check voices before using a model.**

| Model | Voice Examples |
|-------|---------------|
| Kokoro | `af_bella`, `am_adam`, `bf_emma` (af=American Female, bm=British Male) |
| Mistral Voxtral | `en_paul_neutral`, `gb_oliver_cheerful`, `fr_marie_happy` |
| Sesame CSM | `conversational_a`, `read_speech_a` |
| xAI Grok | `eve`, `ara`, `rex`, `sal`, `leo` |
| Google Gemini TTS | `Puck`, `Charon`, `Kore`, `Zephyr` |
| Microsoft MAI-Voice-2 | `en-US-Harper:MAI-Voice-2` |

## Pricing

TTS models are priced **per character**, not per token.

| Model | Price/char | Notes |
|-------|-----------|-------|
| `hexgrad/kokoro-82m` | ~$0.00000062 | Cheapest |
| `google/gemini-3.1-flash-tts-preview` | ~$0.000001 | Fast, many voices |
| `sesame/csm-1b` | ~$0.000007 | Conversational style |
| `x-ai/grok-voice-tts-1.0` | ~$0.000015 | 20+ languages |
| `mistralai/voxtral-mini-tts-2603` | ~$0.000016 | Emotion control |

Use `--dry-run` to estimate cost before generating:

```bash
or create audio "Hello world this is a test" --dry-run
```

## Agent Patterns

```bash
# Generate silently
or create audio "Welcome message" -o welcome.mp3 --quiet

# JSON metadata (audio still saved)
or create audio "Hello" -o hello.mp3 --json | jq '.size_kb'

# Stdin input
echo "Hello world" | or create audio -o hello.mp3
```

## Notes

- **Don't use `or ask` or `or chat` for TTS.** They return text, not audio. Use `or create audio`.
- **Don't guess voice names.** Run `--list-voices` first.
- **Not all "audio" models do TTS.** `google/lyria-3-*` generates music. Always read descriptions.
- **TTS is priced per character.** A 100-char sentence costs ~$0.000062 on Kokoro.
- **PCM format** is for low-latency streaming use cases. MP3 is standard.
