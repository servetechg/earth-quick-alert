# AI Service — Duplicate Detection Gap on Cache Hits

> **Audience:** the Ready2Go Python AI-service team.
> **Owner of the fix:** the AI service (`/v1/integrity/*` pipeline + `/v1/integrity/similar`).
> **Next.js side:** already correct — it calls `GET /v1/integrity/similar/{attachmentId}`, parses
> `{ similar: [...] }`, and renders it. When the list is empty, the UI truthfully shows
> "No similar files found." No Next.js change is required to close this gap.

---

## 1. TL;DR

When a user re-uploads a **byte-for-byte identical** file, the analyze pipeline returns a
**cache hit** and **skips the Weaviate vector upsert (step 7)**. Because `/v1/integrity/similar`
matches against Weaviate (vectors + `contentHash` on stored chunks), the duplicate has **nothing in
Weaviate under its new `attachmentId`** — so it can neither build a centroid (semantic tier) nor be
found by `contentHash` (exact-duplicate tier). Result: **`/similar` returns an empty list for the
exact case it should detect most confidently.**

**The key principle being violated:** *a cache hit is definitive proof of an exact byte-duplicate.*
It is the **strongest** duplicate signal the system has — and it is precisely the case currently
dropped. A cache hit MUST surface the matching file(s) in the similar-files section with
`similarity = 1.0` and `exactDuplicate = true`.

---

## 2. Observed behaviour (from production logs)

Re-uploading `State-of-Arkansas-Recovery-Plan-2020.pdf` (already in the vault):

```
POST /v1/integrity/analyze … 202 Accepted
pipeline.fetched      … content_hash=0434c537…ae143
pipeline.cache_hit    … 'Identical file bytes were analyzed before under this model version;
                         returning the cached verdict, zero embedding/LLM tokens.'
GET /v1/integrity/result/6a2bb0c5…  → 200 (done, cacheHit:true)
```

Then the UI opens the document and calls `/similar`:

```
GET /v1/integrity/similar/6a2bb0c5…
HEAD …/schema/DocChunk/tenants/sub_69f8…  200
HEAD …/schema/DocChunk/tenants/sub_69f8…  200
http.response status_code=200          ← returns { similar: [] }
```

**Tell-tale sign:** the `/similar` request logs **only the tenant `HEAD` checks** and then returns
200 — there is **no `near_vector` search and no `contentHash` lookup**. The endpoint bailed early
because the queried attachment has **no chunks** (hence no centroid, no stored `contentHash`).

Both copies of the file therefore show **"No similar files found"** — the duplicate detection never
fires, even though the two files are bit-identical.

---

## 3. Root cause

Per `SERVICE_DOCUMENTATION.md` §6 (the 12-step pipeline):

```
 3. Cache check (contentHash, modelVersion)
        ├─ HIT  → return cached verdict immediately (0 tokens) ──► DONE   ← steps 4–11 SKIPPED
        └─ MISS → continue
 …
 7. Upsert chunks+vectors into Weaviate   (vectors/repo.py, DocChunk)     ← only runs on a MISS
```

On a **cache hit**, steps 4–11 are skipped, so **step 7 (Weaviate upsert) never runs for the new
`attachmentId`.** Consequently, for a re-uploaded identical file:

| Needed by `/similar` | Source | Present for a cache-hit file? |
|----------------------|--------|-------------------------------|
| Document **centroid** (semantic tier) | average of the file's chunk vectors in Weaviate | ❌ no chunks stored |
| Stored **`contentHash`** on a chunk (exact-dup tier) | `DocChunk.contentHash` in Weaviate | ❌ no chunks stored |
| `ai_analysis_cache` row under the new `attachmentId` | step 10 (`cache.put`) — also skipped on hit | ❌ row still points at the *original* `attachmentId` |

So `/similar/{newAttachmentId}` cannot resolve the file's own `contentHash` (no chunk, no per-id
cache row) and cannot build a centroid → it returns an empty list. And `/similar/{originalId}` can't
find the new copy either, because the new copy has **no chunk** carrying `contentHash` for
`find_exact_duplicates()` to match. **Neither direction detects the duplicate.**

---

## 4. Why this matters

- **It defeats the headline use case.** "Did someone upload the same document twice?" is the single
  most common, most obvious duplicate. The cache is the component that *knows* the answer
  (`pipeline.cache_hit`), yet that knowledge never reaches `/similar`.
- **It is counter-intuitive for users.** Two visibly identical rows, both "Compliant 83", and the
  modal says "No similar files found." That reads as a broken feature.
- **The signal is already computed.** No new embeddings or LLM calls are required — the cache hit
  already established `contentHash` equality. We are simply discarding it.

---

## 5. Requirement

> **A cache hit is an exact-duplicate match and MUST be surfaced.**

Concretely, after re-uploading an identical file `B` of an existing file `A` (same tenant):

- `GET /v1/integrity/similar/B` MUST include `A` with `similarity = 1.0`, `exactDuplicate = true`.
- `GET /v1/integrity/similar/A` MUST include `B` with `similarity = 1.0`, `exactDuplicate = true`.
- This MUST hold **regardless** of whether `B` was embedded (it won't be, on a cache hit).
- It MUST remain tenant-scoped and MUST NOT return stale/deleted attachments.

---

## 6. Proposed solutions (robust & enhanced)

Three options, smallest blast radius first. **Recommended: Option A (+ optionally B).**

### Option A — Authoritative `contentHash → attachmentIds` index in MongoDB (recommended)

Stop depending on Weaviate for **exact**-duplicate detection. Maintain a small, authoritative
per-tenant map of content hashes to the attachments that carry them, and update it on **every**
analyze — *including cache hits* — and on delete.

- **Storage.** Either:
  - a new collection `ai_content_index`: `{ _id: tenantKey, hashes: { "<contentHash>": ["<attId>", …] } }`, **or**
  - reuse `ai_audit_state.documents.<attachmentId>` by adding a `contentHash` field to each entry
    (we already write one audit entry per attachment on every analyze — see `app/store/aggregate.py`).
- **Write path.** In the analyze pipeline, after the cache check, **always** record
  `(tenant, contentHash, attachmentId)` — on both the hit and miss branches (move this registration
  *above* the step 4–11 short-circuit, or duplicate it on the hit branch). On delete, remove the
  `attachmentId` from its hash bucket.
- **Read path (`/similar` exact tier).** Resolve the queried attachment's `contentHash` from this
  index (no Weaviate chunk needed), then return every **other** attachment in the same tenant under
  that hash as `similarity = 1.0, exactDuplicate = true`.
- **Why this is robust:** it is independent of embeddings, survives cache hits, is O(1) per lookup,
  and is the *source of truth* for "same bytes" (which is exactly what a content hash means).

The semantic (near-duplicate) tier can stay Weaviate-based and simply won't include cache-hit files —
that's fine, because the exact tier already covers them with a perfect `1.0` score.

### Option B — Also upsert vectors on cache hit (fuller, higher cost)

On a cache hit, additionally upsert the file's chunks/vectors into Weaviate under the **new**
`attachmentId` (the cached row already stores `vectorIds`; copy/clone them, or re-embed). This makes
the duplicate appear in **both** the exact and semantic tiers and keeps Weaviate complete.

- **Pro:** `/similar` works uniformly via Weaviate; the new attachment also participates in *other*
  files' semantic searches.
- **Con:** more work on the hot path (vector copy or re-embed), partially defeating the cache's
  "zero-token" benefit. If re-embedding, it is no longer free; if cloning stored vectors, it needs
  the original chunk objects + vectors to copy.
- **Best combined with A** (A guarantees exact detection cheaply; B restores semantic completeness).

### Option C — Serve exact tier from `ai_analysis_cache` by `contentHash`

`ai_analysis_cache` already stores `{attachmentId, contentHash, modelVersion}`. Today it's keyed
unique on `(contentHash, modelVersion)`, so it holds only **one** attachmentId per hash and cache
hits don't insert a row for the new id. Adjust so the cache (or a sibling structure) retains **all**
attachmentIds seen for a given `(contentHash, modelVersion)` within a tenant, and serve the exact
tier from it. (This converges on Option A; A is the cleaner framing.)

---

## 7. Recommended design (summary)

1. **Always register** `(tenantKey, contentHash, attachmentId)` on analyze — **including cache hits**
   (move the registration before the step-4–11 short-circuit). Use `ai_audit_state` entries
   (`+contentHash`) or a dedicated `ai_content_index`.
2. **`/similar` exact tier** resolves the queried attachment's `contentHash` from that index and
   returns all sibling attachmentIds in-tenant as `similarity = 1.0, exactDuplicate = true` —
   **no Weaviate dependency** for exact matches.
3. **On delete**, unregister the attachmentId from its hash bucket (mirrors the existing audit-entry
   `$unset`), so duplicates of a deleted file stop being reported.
4. *(Optional, Option B)* also upsert/clone vectors on cache hit to restore semantic completeness.

This keeps the cache's zero-token benefit, makes the **exact-duplicate** guarantee deterministic,
and is fully tenant-scoped.

---

## 8. Acceptance criteria

- [ ] Upload file `A`; upload identical `B` (→ cache hit). `GET /similar/B` returns `A` with
      `exactDuplicate:true, similarity:1.0`; `GET /similar/A` returns `B` likewise.
- [ ] Holds even though `B` produced **zero** embedding/LLM tokens (still a cache hit).
- [ ] Works for **3+** identical copies (all cross-reference each other).
- [ ] Tenant isolation preserved — another tenant's identical file never appears.
- [ ] After `DELETE /v1/integrity/attachments` for `B`, it disappears from `A`'s similar list.
- [ ] After a `MODEL_VERSION` bump, stale entries don't resurrect (index is model-version aware or
      rebuilt on re-analyze).
- [ ] `/similar` still never 500s and stays within its latency budget.

---

## 9. Optional Next.js-side enhancement (decoupled, needs one field)

If the AI service adds **`contentHash`** to the `AnalyzeResponse` (`result.details.contentHash`),
Next.js can flag exact duplicates **independently of `/similar`** by grouping a tenant's attachments
by hash — a useful belt-and-suspenders for the demo:

- Persist `aiIntegrityContentHash` on the attachment (alongside the existing `aiIntegrity*` fields).
- Show a "Duplicate of …" badge in the row/modal when two attachments share a hash.

This is **not** a replacement for the server-side fix (the AI service owns vault-wide duplicate
truth and tenant isolation), but it makes the exact-duplicate UX resilient even if `/similar`
degrades. It requires only the single additive `contentHash` field on the analyze response —
no breaking change.

---

*Filed from the Next.js integration side. The Next.js `/similar` consumer + UI are already correct;
this document specifies the AI-service change needed so a cache hit (definitive exact duplicate)
surfaces in the similar-files section.*
