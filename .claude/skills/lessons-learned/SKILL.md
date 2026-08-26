---
name: lessons-learned
description: Use before investigating or fixing a bug, visual defect, or flaky test in this codebase — and update it immediately after fixing one. Tracks this project's own recurring failure patterns and root causes so the same mistake isn't rediscovered from scratch in a later session.
---

# Lessons learned

This is a project-specific memory of bugs already found and fixed in
`ai-receptionist-dashboard`, kept separate from the chronological session
handoffs (`.claude/handoffs/*.md`). Those record *what happened, when*; this
file records *the pattern*, indexed by symptom, so a future session (or agent)
hits it via a quick scan instead of full re-diagnosis.

## Before fixing a bug

1. Read `LESSONS.md` in this skill's directory.
2. Check whether the symptom you're looking at matches an existing entry —
   same clipped-text shape, same class-merge behavior, same test-failure
   signature, etc. If it matches, the root cause and fix are already known;
   verify it still applies rather than re-deriving it.
3. If nothing matches, diagnose normally.

## After fixing a bug

Immediately after a fix is verified working — not batched at the end of a
session — append one entry to `LESSONS.md` under the closest matching
category (add a new category heading if none fits). An entry is worth adding
when the root cause was **non-obvious**: a framework quirk, a subtle class
ordering issue, a specific negative-margin/clipping interaction, a test
environment false positive, etc. A typo fix or an obviously-stated bug isn't
worth an entry — this file is for the mistakes worth not making twice.

Each entry follows this shape:

```
### <short symptom-first title>
**Where:** file(s) or component(s)
**Symptom:** what it looked like to a user or in a screenshot/test run
**Root cause:** the actual mechanism, one or two sentences
**Fix:** what changed
**Recognize it again:** the tell — what to check first next time this symptom shows up
```

Keep entries terse. This file is a lookup index, not a narrative — the full
story (if worth keeping) already lives in the dated handoff notes; link to it
by date if useful rather than repeating it here.

## Scope

This file is about **this repository's own code and tooling** — Next.js/
Turbopack/Tailwind/Recharts/Auth.js quirks as they actually manifested here,
this app's own components and conventions, this project's specific flaky-test
signatures. It is not a generic "web dev tips" file; entries should name real
files and real symptoms from this codebase.
