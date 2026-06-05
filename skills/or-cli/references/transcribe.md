# Transcription (STT) with `or transcribe`

Transcribe audio files to text using OpenRouter's `/api/v1/audio/transcriptions` endpoint.

**This is a dedicated endpoint — for quick transcription via chat, use `or ask --audio`. For structured transcription with `--output`, `--language`, and usage stats, use `or transcribe`.**

## Basic Usage

```bash
# Transcribe a file (auto-detects language)
or transcribe recording.mp3

# Specify language
or transcribe interview.wav --language en

# Save to file
or transcribe podcast.m4a --output transcript.txt

# JSON with usage stats
or transcribe clip.flac --json
```

## Options

| Flag | Purpose |
|------|---------|
| `-m, --model <id>` | STT model (default: `openai/whisper-large-v3`) |
| `-l, --language <code>` | Language code (e.g. `en`, `ja`, `fr`) — auto-detected if omitted |
| `--temperature <n>` | Sampling temperature (0-1) |
| `--output <path>` | Save transcription to file |
| `--json` | Output as JSON (includes usage stats) |
| `--quiet` | Output only the transcribed text |

## Supported Formats

`wav`, `mp3`, `flac`, `m4a`, `ogg`, `webm`, `aac`, `mp4`

## Output Formats

### Default (pretty print)
```
  Transcription
  Model: openai/whisper-large-v3

  Hello, this is a test recording.

  45.2s audio • 150 tokens • $0.0023 • 1200ms
```

### JSON (`--json`)
```json
{
  "text": "Hello, this is a test recording.",
  "usage": {
    "cost": 0.0023,
    "input_tokens": 100,
    "output_tokens": 50,
    "seconds": 45.2,
    "total_tokens": 150
  },
  "latency_ms": 1200
}
```

### Quiet (`--quiet`)
Only the transcribed text, nothing else.

## Agent Patterns

```bash
# Transcribe and save
or transcribe meeting.mp3 --output meeting.txt --language en

# Quiet text output for piping
or transcribe clip.mp3 --quiet | wc -w  # Word count

# JSON for programmatic use
or transcribe clip.mp3 --json | jq '.usage.seconds'

# Transcribe multiple files
for f in *.mp3; do
  or transcribe "$f" --output "${f%.mp3}.txt" --quiet
done
```

## `or transcribe` vs `or ask --audio`

| Feature | `or transcribe` | `or ask --audio` |
|---------|----------------|-----------------|
| Purpose | Dedicated STT | Audio analysis via chat model |
| Endpoint | `/audio/transcriptions` | `/chat/completions` |
| Output | Raw transcription | Model's interpretation |
| `--output` | Save to file | ❌ |
| `--language` | Explicit language hint | Model decides |
| Usage stats | Detailed (seconds, tokens, cost) | Standard token counts |
| Best for | Pure transcription | Summarization, Q&A about audio |

Use `or transcribe` when you want the raw text. Use `or ask --audio` when you want the model to analyze, summarize, or answer questions about the audio.

## Notes

- **Default model:** `openai/whisper-large-v3`
- **Language auto-detection** works well for most languages. Use `--language` for better accuracy on short clips.
- **Large files** may take longer. The entire audio is sent as base64.
- **Pricing** varies by model. Whisper models charge per second of audio.
- **File size** — very large files may hit API limits. Consider splitting long recordings.
