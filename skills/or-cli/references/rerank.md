# Rerank

The `or rerank` command uses OpenRouter's dedicated `/rerank` endpoint to reorder a list of documents by relevance to a query. This is useful for RAG (Retrieval-Augmented Generation), search result refinement, and document ranking.

**This is a dedicated endpoint — do NOT use `or chat` for reranking.**

## Basic Usage

```bash
# Rerank documents passed as arguments
or rerank "What is the capital of France?" \
  "Paris is the capital of France." \
  "Berlin is the capital of Germany." \
  "London is the capital of the UK."

# Read documents from a file (one per line)
or rerank "query" --file documents.txt

# Pipe documents from stdin
cat documents.txt | or rerank "query"

# Use a specific rerank model (default: cohere/rerank-v3.5)
or rerank "query" "doc1" "doc2" -m cohere/rerank-4-pro

# Limit to top N results
or rerank "query" "doc1" "doc2" "doc3" --top-n 2
```

## Document Sources

Documents can be provided in three ways (combined):

1. **Positional arguments** — pass strings directly
2. **`--file <path>`** — read one document per line from a file
3. **Stdin** — pipe documents in, one per line

You can also prefix a file path with `@` to read its contents as a single document:

```bash
or rerank "summarize these" "@article1.txt" "@article2.txt"
```

## Available Rerank Models

```bash
or models -t rerank
```

Current options:

| Model | Price | Context |
|-------|-------|---------|
| `cohere/rerank-v3.5` | $0.001/search | 4K |
| `cohere/rerank-4-fast` | $0.002/search | 33K |
| `cohere/rerank-4-pro` | $0.0025/search | 33K |

## Output Formats

```bash
# Default: ranked table with scores
or rerank "query" "doc1" "doc2"

# JSON (machine-readable)
or rerank "query" "doc1" "doc2" --json

# Markdown table
or rerank "query" "doc1" "doc2" --md
```

## Response Format

The JSON response contains:

```json
{
  "id": "or-rerank-...",
  "model": "cohere/rerank-v3.5",
  "provider": "Cohere",
  "results": [
    {
      "document": { "text": "Paris is the capital of France." },
      "index": 0,
      "relevance_score": 0.8923
    }
  ],
  "usage": {
    "cost": 0.001,
    "search_units": 1,
    "total_tokens": 0
  }
}
```

## Common Patterns

### RAG Pipeline

```bash
# 1. Retrieve candidate documents (e.g., from vector DB)
# 2. Rerank them for relevance
# 3. Feed top results to a chat model

or rerank "How does quantum computing work?" \
  --file retrieved_docs.txt \
  --top-n 3 \
  --json | jq -r '.results[].document.text' > top_docs.txt

or chat "Answer based on these docs: $(cat top_docs.txt)" -m deepseek/deepseek-v4-flash
```

### Search Result Reordering

```bash
# Pipe search results through rerank
grep -r "capital" wiki/ | cut -d: -f2 | or rerank "capital of France?" --top-n 5
```

## Pricing

Rerank models charge **per search request**, not per token. The cost is based on the number of documents reranked in a single call.

```bash
or show cohere/rerank-v3.5  # Check current pricing
```
