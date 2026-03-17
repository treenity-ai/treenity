# @treenity/recall

**Claude Code session transcript search — BM25 + vector hybrid RAG.**

Indexes Claude Code conversation transcripts (JSONL) and provides hybrid search combining BM25 keyword matching with vector similarity (HuggingFace embeddings).

## Install

```bash
npm install @treenity/recall
```

## Usage

```typescript
import { searchTranscripts, listSessions, getSessionText } from '@treenity/recall';

// Search across all sessions
const results = await searchTranscripts('vite plugin resolution');
for (const r of results) {
  console.log(r.session, r.score, r.text);
}

// List available sessions
const sessions = await listSessions();

// Read full session text
const text = await getSessionText(sessions[0].id);
```

## Embeddings

Uses `@huggingface/transformers` for local vector embeddings (no API key needed):

```typescript
import { embed, preloadEmbedder, disposeEmbedder } from '@treenity/recall';

await preloadEmbedder();
const vector = await embed('search query');
await disposeEmbedder();
```

## API

| Function | Description |
|----------|-------------|
| `searchTranscripts(query)` | Hybrid BM25 + vector search across transcripts |
| `listSessions()` | List all available transcript sessions |
| `getSessionText(id, opts?)` | Read full text of a session |
| `findTranscriptsDir()` | Locate Claude Code transcripts directory |
| `invalidateIndex()` | Force re-index on next search |
| `embed(text)` | Generate embedding vector |
| `preloadEmbedder()` | Warm up the embedding model |
| `disposeEmbedder()` | Release embedding model resources |

## License

Licensed under FSL-1.1-MIT. Free to use for any purpose. Converts to MIT automatically after two years from each release date.
