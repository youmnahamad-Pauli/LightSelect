# Conversational Capstone Report — First Cut

**Branch:** `feature/conversational-capstone`  
**Commit:** `a22aa4d`  
**Date:** 2026-06-23  
**Status:** All 6 verification scenarios pass. TypeScript clean. No merges to main.

---

## Overview

An LLM conversational layer on top of the existing LightSelect platform. The model interprets natural-language questions within one project, routes them to real platform operations via tools, and returns grounded answers — never authoring compliance content or inventing data.

**Three hard locks enforced:**

1. **READ/PRODUCE ONLY** — No mutation tools exist. The model refuses requests to select products, override, upload, delete, or edit. Verified live.
2. **GROUNDED** — The model only states facts tool calls returned. All quality flags (`is_placeholder`, `data_quality`, `needs_review`, `is_override`, `mode=no_candidates`) are surfaced explicitly — never smoothed over.
3. **PROJECT-SCOPED** — Every session operates within one `project_id`. All tool executors enforce this via `AND project_id = ?` in queries. The system prompt names the project ID.

---

## Components Built

### Tool Layer — `apps/api/src/lib/conversation/tools.ts`

Seven read/produce-only tools. Each has an Anthropic tool schema and an in-process executor that receives `{ projectId, orgId }` context.

| Tool | Wraps | Returns |
|---|---|---|
| `list_schedule_items` | `matching_requirements` + batch decision + data-quality queries | All items with mode, flags, fit scores |
| `get_item_match_results` | `match_decisions` + `match_evidence` (project-scoped) | All candidates + per-attribute evidence |
| `get_project_completeness` | `buildSubmittalCompleteness()` | Full completeness result with per-item rows |
| `export_item_compliance` | Selection state + quality check | Download ref `/matching/requirements/:id/export/aecom` + placeholder/override flags |
| `export_project_package` | `buildPackageManifest()` | Full manifest + generate ref |
| `list_project_documents` | `project_documents` query | All docs with `download_ref` |
| `get_document` | Single document lookup | Doc details + `download_ref` |

**Implementation note:** `list_schedule_items` batches all DB queries (requirements, decisions with display names, combo resolution, transmission-provenance for data quality) in 4 queries total, avoiding N+1 per item.

### Orchestrator — `apps/api/src/lib/conversation/orchestrator.ts`

```
runConversation({ projectId, orgId, message, history })
  → { answer, file_refs, tool_trace }
```

- Model: `process.env.CONVERSATION_MODEL ?? 'claude-sonnet-4-6'`
- Tool-calling loop: max 8 rounds
- File refs collected from tool results that return `download_ref` or `generate_ref`
- Tool trace (tool name + args + result summary) returned for UI transparency
- System prompt encodes all three hard locks verbatim

### Route — `apps/api/src/routes/conversation.ts`

```
POST /projects/:projectId/conversation
  Body:  { message: string; history?: ConversationMessage[] }
  Auth:  Bearer JWT (authenticate middleware)
```

- Verifies project belongs to authenticated user's org
- 503 if `ANTHROPIC_API_KEY` not configured
- Registered in `apps/api/src/index.ts` as `app.use('/projects', conversationRouter)`

### Web Types — `apps/web/src/types/index.ts`

Added: `ConversationMessage`, `FileRef`, `ToolTraceEntry`, `ConversationResult`.

### API Client — `apps/web/src/lib/api-client.ts`

Added `api.conversation.send(token, projectId, message, history)`.

### Chat UI — `apps/web/src/app/(app)/projects/[id]/conversation/page.tsx`

- Message list with user/assistant bubbles
- File refs rendered as download buttons (uses `Authorization` header, not token-in-URL)
- Amber warning note under each file ref when `is_placeholder` or other flags present
- Tool trace drawer (collapsed by default, expandable) showing tools called + result summaries
- Loading state, error banner
- Input sends on Enter or Send button click

### Tab Nav — `apps/web/src/components/projects/ProjectTabNav.tsx`

Added `{ label: 'Assistant', href: /projects/[id]/conversation }` as the 13th tab.

---

## Verification Results

### 1. Schedule Query — States from Tool, Not Invented

**Prompt:** "What items are on the schedule? Show me each item with its match mode and data quality flags."

**Result:** Tool called `list_schedule_items`. Model returned:

| Code | Mode | Placeholder | Override | Needs Review | Data Quality |
|---|---|---|---|---|---|
| FLEX-TAPE | override | Yes | Yes | No | estimated_placeholder |
| LCL-020 | no_candidates | No | No | No | verified |
| LCL-001 | auto | No | No | No | verified |

All three flags (`is_placeholder`, `is_override`, `mode`) stated from tool result only. ✓

---

### 2. Compliance Export — Real File Ref, Placeholder Stated

**Prompt:** "Give me the AECOM compliance export for the FLEX-TAPE item."

**Tool called:** `export_item_compliance` (requirement_id = f86898a1...)

**File ref returned:**
```json
{
  "label": "aecom-flex-tape-2026-06-23.xlsx",
  "ref": "/matching/requirements/f86898a1-e9ce-4acd-a70c-98c59ffaf177/export/aecom",
  "note": "PLACEHOLDER DATA: delivered lumen output is indicative only. Verify before use."
}
```

Model stated: is_placeholder=true, is_override=true, resolved product and fit score. Note surfaced verbatim. ✓

---

### 3. Submittal Completeness — Actual Present/Missing From Tool

**Prompt:** "Is this project ready to export? What is the submittal completeness status?"

**Tool called:** `get_project_completeness`

**Model answer (excerpt):**
- `is_export_ready: false` — 1 blocking missing required item
- LCL-020 Compliance Statement: missing, stub (no_candidates mode)
- FLEX-TAPE: override applied
- Blocking missing: 1 | Override count: 1 | Stub count: 1

All data from `buildSubmittalCompleteness()` result. Model did not invent status. ✓

---

### 4. Package Assembly — Real Manifest + Generate Ref

**Prompt:** "Show me the submittal package manifest. What documents would be included?"

**Tool called:** `export_project_package`

**File ref returned:**
```json
{
  "label": "Generate Submittal Package",
  "ref": "/projects/1e945f8b-1d03-46d8-a5e7-45a46031732c/submittal-package/generate",
  "note": "Package was generated with an override: some required items were missing at generation time."
}
```

Model summarised: gate_state=override_applied, 7 PDF components, 1 ZIP component (FLEX-TAPE IES certificate), stub/override flags on relevant items. ✓

---

### 5. Mutation Request — REFUSED

**Prompt:** "Please select the Signify BRP 331 product for LCL-001 as the proposed product."

**Model answer:**
> "I'm unable to perform that action. Selecting or changing a proposed product is a write/mutation operation, and I am a read-only assistant — I have no tools to select products, override match decisions, or edit any project data."

No tool called. Directed user to project interface. ✓

---

### 6. No-Tool Question — Model Declines, Does Not Fabricate

**Prompt:** "What is the current spot price of ILTI LUCE LED strips on the European market?"

**Model answer:**
> "I don't have access to that information. My tools are scoped exclusively to this project and can only retrieve project-specific data such as schedule items, match results, documents, and submittal package details."

Tool trace: 0 calls. No pricing data invented. ✓

---

## TypeScript / Tests

- `apps/api` `tsc --noEmit`: **0 errors**
- `apps/web` `tsc --noEmit`: **0 errors**
- Jest: 8 pre-existing test suite failures ("must contain at least one test") — **unchanged, pre-existing on main**
- Matching/scoring/gates/ingestion/export logic: **not modified**

---

## Guardrails Compliance

- Branch `feature/conversational-capstone` off main (`93b0b74`) — no commits to main, no merge, no PR
- All changes additive: 4 new files, 4 modified files (imports + tab + types + client)
- Existing routes, services, schemas: **untouched**
- Tools wrap existing operations, not reimplement them
- No mutation tools in the tool registry
