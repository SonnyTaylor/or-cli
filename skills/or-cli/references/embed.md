# Embeddings with `or embed`

Generate embeddings for text, images, audio, or video using OpenRouter's `/api/v1/embeddings` endpoint.

## Basic Usage

```bash
# Text embedding
or embed "Hello world" --dimensions 64

# With a specific model
or embed "Hello world" -m openai/text-embedding-3-small

# JSON output (full response with vectors)
or embed "Hello world" --json
```

## Multimodal Embeddings

Some models support image, audio, and video inputs:

```bash
# Image embedding
or embed "A photo of a cat" --image photo.jpg --dimensions 64

# Audio embedding
or embed "A recording" --audio clip.wav --dimensions 64

# Video embedding
or embed "A scene" --video clip.mp4 --dimensions 64
```

## Batch Embedding

Embed multiple text inputs at once:

```bash
# Batch from files
or embed --batch file1.txt file2.txt file3.txt --json

# Each file becomes a separate embedding in the response
```

## Options

| Flag | Purpose |
|------|---------|
| `-m, --model <id>` | Embedding model (default: `openai/text-embedding-3-small`) |
| `--input <text>` | Text to embed (alternative to positional arg) |
| `--input-file <path>` | Read input text from file |
| `--dimensions <n>` | Number of dimensions for the output |
| `--format-out <format>` | `float` or `base64` (default: `float`) |
| `--input-type <type>` | `search_query` or `search_document` |
| `--image <path>` | Image input for multimodal embedding |
| `--audio <path>` | Audio input |
| `--video <path>` | Video input |
| `--batch <paths...>` | Batch embed multiple text files |
| `--list-models` | List available embedding models |
| `--json` | Output full response as JSON |
| `--quiet` | Output only the embedding vectors (one value per line) |

## Discovering Models

```bash
or embed --list-models              # All embedding models
or models -t embedding              # Alternative
or show openai/text-embedding-3-small  # Check details
```

## Output Formats

### Default (pretty print)
```
  Embedding Results
  Model: openai/text-embedding-3-small
  Embeddings: 1

  [0] 1536d [0.002310, -0.008712, 0.014532, -0.003211, 0.009123, ...]

  8 tokens • $0.0000 • 245ms
```

### JSON (`--json`)
```json
{
  "id": "or-embed-...",
  "model": "openai/text-embedding-3-small",
  "object": "list",
  "data": [
    {
      "embedding": [0.002310, -0.008712, ...],
      "index": 0,
      "object": "embedding"
    }
  ],
  "usage": {
    "prompt_tokens": 8,
    "total_tokens": 8,
    "cost": 0.0000016
  }
}
```

### Quiet (`--quiet`)
Outputs only the embedding vector values, one per line:
```
0.002310
-0.008712
0.014532
-0.003211
```

## Agent Patterns

```bash
# Pipe embedding to file
or embed "Hello world" --quiet > embedding.txt

# JSON for programmatic use
or embed "Hello world" --json | jq '.data[0].embedding[:5]'

# Batch embed and save as JSON
or embed --batch *.txt --json > embeddings.json

# Use input-type for RAG pipelines
or embed "What is Python?" --input-type search_query --json
or embed "Python is a programming language..." --input-type search_document --json
```

## Notes

- **Default model:** `openai/text-embedding-3-small`
- **Dimensions** can be set to reduce vector size (e.g. 64, 256, 1536)
- **Multimodal embeddings** require models that support them (check with `or show`)
- **Batch mode** sends all inputs in a single API call
- **`--quiet` outputs raw vectors** — one float per line, suitable for piping
