# Known Issues & TODOs

Found during v0.3.0 usage testing (2025-06-05).

## Critical

### 1. `or show` uses raw `fetch` instead of `apiFetch`
**File:** `src/commands/show.ts`
**Impact:** The `show` command bypasses the SSL/DPI fix (`--insecure` / `NODE_TLS_REJECT_UNAUTHORIZED=0`). On corporate networks with certificate inspection, `or show` will fail with "self signed certificate" while other commands work.
**Fix:** Replace the raw `fetch()` call with `apiFetch()`.

### 2. Model IDs truncated in table output
**File:** `src/commands/models.ts`
**Impact:** Long model IDs like `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning` are truncated to `nvidia/nemotron-3-nano-omni-30b-a3b-reasonin…` in the table, making them impossible to copy-paste for use with `or chat` or `or show`.
**Fix:** Don't truncate model IDs, or use a much wider column. The ID is the most important field.

### 3. `or models --json` returns formatted rows, not raw API data
**File:** `src/lib/format.ts` (`outputTable`)
**Impact:** `or models --json` outputs JSON like `[{"Model": "...", "Modality": "👁 ...", "Price from/M": "$0.15"}]` instead of the actual OpenRouter API model objects. This makes it useless for programmatic use. Other commands like `or show --json` return raw API data, so this is inconsistent.
**Fix:** When `or models` gets `--json`, bypass `outputTable` and output the raw `ORModel[]` array directly.

## Medium

### 4. `-t transcription` filter is too narrow
**File:** `src/lib/openrouter.ts` (`isTranscriptionModel`)
**Impact:** `or models -t transcription` returns nothing because `isTranscriptionModel` only matches models with "transcription", "whisper", or "transcri" in their modality string. Models that actually transcribe audio (e.g. `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning` with `text+image+audio+video->text`, or `mistralai/voxtral-small-24b-2507` with `text+file+audio->text`) are missed.
**Fix:** Update `isTranscriptionModel` to also match models where the input modality includes "audio" and the output includes "text".

### 5. `or tts` lacks `--quiet` flag
**File:** `src/commands/tts.ts`
**Impact:** Cannot use `or tts` in pipelines/scripts without getting spinner and summary output.
**Fix:** Add `--quiet` flag that suppresses all non-error output (still saves audio to file).

### 6. `or tts` doesn't show cost estimate before generating
**File:** `src/commands/tts.ts`
**Impact:** Users don't know how much a TTS request will cost before making it. TTS is priced per character, which is different from chat tokens.
**Fix:** Show an estimated cost before generating based on text length × model's per-character price. Could be a `--dry-run` flag or shown in verbose mode.

## Low / Nice-to-have

### 7. `or tts` doesn't validate voice parameter
**File:** `src/commands/tts.ts`
**Impact:** Invalid voice names result in a generic 400 error from the provider with no guidance on valid voices. Users must run `or tts --list-voices` separately.
**Fix:** Optionally validate the voice against the model's `supported_voices` list before making the API call, or catch 400 errors and suggest running `--list-voices`.

### 8. `or models -t audio` is ambiguous
**File:** `src/commands/models.ts`
**Impact:** `-t audio` matches models with ANY audio capability (input STT, output TTS, music generation, audio understanding). This is confusing — the agent in testing picked a music generation model (`google/lyria-3`) thinking it was a TTS model.
**Fix:** Consider splitting into `-t audio-in` (STT), `-t audio-out` (TTS/music), or at least add better documentation. The new `or tts` command helps for TTS specifically.

### 9. `or tts --list-models` could show pricing
**File:** `src/commands/tts.ts`
**Impact:** The `--list-models` output shows names and descriptions but not pricing, making it hard to pick a cheap model.
**Fix:** Add per-character pricing to the `--list-models` table output.
