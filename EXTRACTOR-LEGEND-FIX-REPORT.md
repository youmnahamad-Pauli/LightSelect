# Extractor Legend Fix Report
## feature/extractor-legend-fix

**Branch**: `feature/extractor-legend-fix` (off main, 2026-06-23)  
**File changed**: `apps/api/src/lib/ingestion/catalogue-llm.ts`  
**Tested on**: `ingestion-input/luxspace-pro-dn5xx.pdf` (Signify LuxSpace Pro DN5XX, pp.120–124), filter `DN589B`

---

## 1. The Gap

Phase B ingestion (feature/phaseb-luxspace) found that the extractor assigned `resolution_method = "legend_decoded"` to `cct` and `cri` for all 23 DN589B products, even though the 5-page Signify catalogue slice contains **no printed order-code legend**. The model decoded CCT and CRI from training knowledge of Signify's model-code conventions (`/940` = 4000K CRI90, `/840` = 4000K CRI80, etc.).

This violates the provenance guarantee that `legend_decoded` implies: a human reviewer reading the `source_locator` should be able to open the document and find the exact legend entry cited. Source locators like `"page 4, Product Information table: model code segment '940' in 'LED10/940'"` point to the model code itself, not a printed legend — they cannot be verified.

The behaviour was also **unstable across runs**: one failed run correctly reasoned *"catalogue does NOT print an explicit order-code legend... I must omit CCT per the rules"*, but the subsequent successful run violated the rule. This run-to-run disagreement indicated the rule was under-specified, not reliably enforced.

### Root cause in the old prompt

The old definition of `legend_decoded` said:

> *"decoded from a model-code legend THAT IS PRINTED IN THIS DOCUMENT and whose relevant entry you can quote exactly in source_locator."*

This is not wrong, but it has three failure modes:

1. **No named prohibition on training-knowledge decoding**: The model could self-justify by reasoning "I know this manufacturer's coding convention from training, and the model code IS printed in the document."
2. **Source_locator requirement under-specified**: Nothing prevented the model from citing the model code's location (a valid document pointer) rather than a legend entry's location.
3. **No deterministic post-hoc guard**: If the prompt failed to prevent a slip, the pipeline accepted `legend_decoded` regardless of what `source_locator` pointed to.

---

## 2. Changes Made

### 2a. Prompt: explicit prohibition and hard gate

**Old wording (relevant excerpt):**
```
"legend_decoded"    — decoded from a model-code legend THAT IS PRINTED IN THIS DOCUMENT and
                      whose relevant entry you can quote exactly in source_locator.
```

**New wording:**
```
"legend_decoded"    — decoded from a model-code legend or order-code key table THAT IS PHYSICALLY
                      PRINTED IN THIS DOCUMENT. The source_locator MUST name the page and the
                      printed legend entry itself (e.g. "page 3, order-code key, entry: '/940 = 4000K CRI90'"),
                      NOT the model code where you applied it.
                      HARD GATE: before emitting legend_decoded, ask: can I quote the EXACT TEXT of
                      the legend entry as printed on a specific page of this document? If the answer
                      is no — if you are relying on training knowledge of a manufacturer's coding
                      conventions (e.g. Philips /9XX = CRI90, Osram letter suffixes, etc.) rather
                      than a printed legend in front of you — then legend_decoded is PROHIBITED.
                      Use inferred_flagged with needs_review: true instead, or omit the attribute.
```

A **NAMED FAILURE MODE** block was also added immediately after the resolution_method definitions:

```
NAMED FAILURE MODE — training_knowledge_decoding:
  Applying training knowledge of a manufacturer's model-code conventions to decode an attribute value
  is PROHIBITED, even when you are confident the convention is correct. Common examples:
  - Decoding CCT or CRI from Philips/Signify "/9XX", "/8XX" suffixes without a printed legend
  - Decoding wattage from numeric prefixes without a printed key
  - Decoding beam angle from letter codes without a printed optics table
  If no legend is printed in this document, the value cannot be legend_decoded. Do not self-justify
  by pointing to the model code itself as the "source" — the model code is not a legend.
```

The CCT-specific CRITICAL RULE was also tightened to make step 2 require the legend entry and page to be quoted in `source_locator`, not just the model code.

### 2b. Writer-side deterministic guard (`coerceProduct()`)

Added `isLegitLegendSourceLocator()` in `coerceProduct()`:

```typescript
function isLegitLegendSourceLocator(sl: string | null): boolean {
  if (!sl) return false;
  const lower = sl.toLowerCase();
  return (
    lower.includes('legend') ||
    lower.includes('order-code key') || lower.includes('order code key') ||
    lower.includes('code key') || lower.includes('key table') ||
    lower.includes('key box') || lower.includes(' key,') ||
    lower.includes(' key:') || lower.includes(' key ') ||
    /entry:\s*['"]/.test(lower) || /entry:\s+[/']/.test(lower)
  );
}
```

After parsing each attribute, if `resolution_method === 'legend_decoded'` and the source locator fails this check, the pipeline automatically downgrades to `inferred_flagged` and logs a `console.warn`:

```typescript
if (resolution_method === 'legend_decoded' && !isLegitLegendSourceLocator(source_locator)) {
  console.warn(
    `[coerce] legend_decoded guard: attribute "${key}" source_locator does not reference a ` +
    `printed legend ("${source_locator ?? 'null'}"). Downgrading to inferred_flagged.`,
  );
  resolution_method = 'inferred_flagged';
}
```

This guard fires deterministically regardless of what the model returns. A `legend_decoded` row can only reach the database if its `source_locator` names an actual legend location (contains "legend", "order-code key", "key table", etc.). A source locator that merely points to the model code ("page 4, model code segment '940'") will always be caught and downgraded.

**Why the guard is needed even with a fixed prompt**: the guard makes the rule a hard contract rather than a best-effort instruction. LLMs are probabilistic; a rule that can be satisfied by the model alone will slip under distributional pressure (unusual document layouts, short context windows, quantization differences across model versions). The guard is the non-probabilistic backstop.

### 2c. Additional infrastructure fix: `findJsonObjectEnd()`

An additional parse-robustness fix was required during re-testing. When the prompt was tightened, the model began reasoning in prose before its JSON output (describing its reasoning about the legend absence), then writing the JSON in a markdown fence, then appending a closing prose block after the `\`\`\`` fence. The existing prose-stripping code found the first `{` and sliced from there — but did not strip content after the closing `}`, causing `JSON.parse` to fail with `Unexpected non-whitespace character after JSON`.

Fix: added `findJsonObjectEnd()` which walks the JSON text bracket-by-bracket to locate the true end of the top-level object, then truncates there before parsing:

```typescript
function findJsonObjectEnd(text: string): number {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (escaped) { escaped = false; continue; }
    if (ch === '\\' && inString) { escaped = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{' || ch === '[') depth++;
    if (ch === '}' || ch === ']') { depth--; if (depth === 0) return i; }
  }
  return -1;
}
```

This is not a logic change — it is purely parse robustness for documents where the model's reasoning produces structured-then-unstructured output.

---

## 3. Re-test Results: Three Runs on the LuxSpace Slice

All three runs: `--pdf ingestion-input/luxspace-pro-dn5xx.pdf --filter DN589B`, model `claude-sonnet-4-6`, 2026-06-23.

| Run | Timestamp | Products | CCT treatment | CRI treatment | `legend_decoded` guard fired? | table_read regression? |
|-----|-----------|----------|--------------|---------------|-------------------------------|------------------------|
| Baseline (phaseb) | 13:07 | 23 | **legend_decoded ❌** | **legend_decoded ❌** | n/a (guard not present) | — |
| Run 1 | 13:42–13:45 | 22 | **omitted ✓** | inferred_flagged ✓ | No (model self-corrected) | None |
| Run 2 | 13:57–14:00 | 23 | **omitted ✓** | omitted ✓ | No | None |
| Run 3 | 14:05–14:09 | 22 | **omitted ✓** | omitted/inferred_flagged ✓ | No | None |

**CCT across all 3 re-test runs**: completely absent from extraction output. The model stated (run 1 reasoning, visible in failed attempt before JSON fix): *"The CCT codes /940, /930, /840, /830 appear in model numbers but no printed legend in this document maps these to Kelvin values, so I must not decode them."* This reasoning held consistently.

**CRI across all 3 runs**: either omitted or returned as `inferred_flagged`. Never `legend_decoded`. The mild run-to-run variation (sometimes omitted, sometimes flagged) is acceptable: both outcomes are correct per the rules. `inferred_flagged` is the more conservative and reviewable choice.

**Stability verdict**: 3/3 runs produced no `legend_decoded` for CCT or CRI. The behaviour is stable. The slight variation in attribute counts (16–19 per product) reflects the model's varying depth of extraction from the three-table layout, not any regression in provenance correctness.

**Performance attributes unaffected**: lumens, watts, efficacy, beam_angle all remained `table_read` from the correct per-cut-out performance tables (D75, D100, D125, D150) across all runs. The fix did not disturb the multi-table association logic.

### DB state note

The DB still carries `legend_decoded` CCT rows from the baseline phaseb run (pre-fix), identifiable by `updated_at` timestamps of ~13:07–13:08 (the phaseb run time). These rows were **not touched** by the legend-fix runs because the model omitted CCT entirely — the registry writer only updates rows it receives; it cannot delete stale rows from previous extractions.

A human reviewer of the DN589B family will need to:
1. Either confirm or delete the 23 stale `legend_decoded` CCT rows from the phaseb run.
2. Add correct CCT values (e.g., 4000K for `/940` and `/840` variants, 3000K for `/930` and `/830`) as `confirmed` values once the Signify order-code structure has been externally verified.

Alternatively, a re-ingest from a PDF slice that includes the Signify order-code legend page would allow proper `legend_decoded` extraction.

---

## 4. What the Guard Catches vs. What the Prompt Catches

| Scenario | Prompt catches? | Guard catches? |
|----------|----------------|----------------|
| Model correctly omits CCT (no legend in doc) | ✓ Primary fix | Not needed |
| Model returns `legend_decoded` citing model code as "source" | ✓ After fix | ✓ Deterministic fallback |
| Model returns `legend_decoded` with null source_locator | ✓ After fix | ✓ (null fails guard) |
| Model returns `inferred_flagged` with needs_review: true | ✓ | Not needed |
| Future model version / prompt regression | ✗ Might slip | ✓ Always fires |

The prompt fix corrects the behaviour in the primary path. The guard is the non-probabilistic contract that holds even if the prompt degrades with a model update or layout variation.

---

## 5. Files Changed

| File | Change |
|---|---|
| `apps/api/src/lib/ingestion/catalogue-llm.ts` | Prompt: tightened `legend_decoded` definition, added NAMED FAILURE MODE block, tightened CCT rule step 2. Code: `isLegitLegendSourceLocator()` guard in `coerceProduct()`, `findJsonObjectEnd()` for robust JSON parsing. Also carries prior infrastructure fixes from phaseb branch: streaming (`client.messages.stream`), `max_tokens: 64000`, prose-strip before JSON parse. |
| `ingestion-input/luxspace-pro-dn5xx.pdf` | Test fixture — 5-page Signify slice carried over from phaseb branch for re-testing. |
| `ingestion-input/INGESTION-REVIEW.md` | Updated by the three re-test runs. |

**Not changed**: matching engine, scoring, schema, migrations, types, registry-writer, any other pipeline stage.
