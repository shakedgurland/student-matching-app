// lib/match-evidence.ts
//
// Shared type + helpers for compatibility evidence rendering. Used by
// both app/match-result.tsx and app/match-profile.tsx so the two
// surfaces cannot drift on which kinds are recognized or how each
// renders in Hebrew.
//
// Source of truth for the discriminated union + Hebrew template wording
// is the server side:
//   * supabase/functions/match-create/scoring.ts (CompatibilityEvidence,
//     renderEvidenceText) — original scorer (PR #48)
//   * supabase/migrations/032_get_match_context.sql (RPC label maps) —
//     fallback derive path (PR #55)
//
// Both server paths produce evidence in the same JSON shape; this client
// helper mirrors that shape and renders identical Hebrew so the same
// item displays the same way whether it came from stored metadata or
// from the get_match_context RPC.
//
// Pure TypeScript. No Supabase calls. No React imports. Safe to import
// from any client file.

// Discriminated-union mirror of the server-side CompatibilityEvidence
// type. If the server adds a new kind in the future, parseEvidenceArray
// silently drops it (forward-compatible).
export type CompatibilityEvidence =
  | { kind: 'shared_hobbies';        values: string[]; labels: string[] }
  | { kind: 'same_city';             value: string;    label: string    }
  | { kind: 'same_region';           value: string;    label: string    }
  | { kind: 'same_university';       value: string;    label: string    }
  | { kind: 'same_faculty';          value: string;    label: string    }
  | { kind: 'same_year_of_study';    value: string;    label: string    }
  | { kind: 'shared_intent';         value: string;    label: string    }
  | { kind: 'shared_pace';           value: string;    label: string    }
  | { kind: 'shared_first_date';     value: string;    label: string    }
  | { kind: 'shared_conflict_style'; value: string;    label: string    }
  | { kind: 'shared_religion_type';  value: string;    label: string    }
  | { kind: 'shared_top_values';     values: string[]; labels: string[] }
  | { kind: 'ai_vibe' };

// Defensive array parser — accepts only items matching the expected
// per-kind shape. Malformed or unknown entries are dropped silently.
// Never throws. Accepts unknown input safely.
export function parseEvidenceArray(raw: unknown): CompatibilityEvidence[] {
  if (!Array.isArray(raw)) return [];
  const out: CompatibilityEvidence[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const obj = item as Record<string, unknown>;
    const kind = obj.kind;
    if (typeof kind !== 'string') continue;

    if (kind === 'shared_hobbies' || kind === 'shared_top_values') {
      const values = Array.isArray(obj.values)
        ? obj.values.filter((v): v is string => typeof v === 'string')
        : [];
      const labels = Array.isArray(obj.labels)
        ? obj.labels.filter((v): v is string => typeof v === 'string')
        : [];
      out.push({ kind, values, labels } as CompatibilityEvidence);
      continue;
    }
    if (kind === 'ai_vibe') {
      out.push({ kind: 'ai_vibe' });
      continue;
    }
    if (
      kind === 'same_city' || kind === 'same_region' ||
      kind === 'same_university' || kind === 'same_faculty' ||
      kind === 'same_year_of_study' || kind === 'shared_intent' ||
      kind === 'shared_pace' || kind === 'shared_first_date' ||
      kind === 'shared_conflict_style' || kind === 'shared_religion_type'
    ) {
      const value = obj.value;
      const label = obj.label;
      if (typeof value === 'string' && typeof label === 'string') {
        out.push({ kind, value, label } as CompatibilityEvidence);
      }
      continue;
    }
    // Unknown kind from a future server version — skip silently.
  }
  return out;
}

// Convenience wrapper: extract compatibility_evidence from a metadata
// jsonb-like object. Used by match-result.tsx where the input is the
// match row's metadata field. Returns [] for missing/malformed input.
export function parseEvidenceFromMetadata(
  metadata: Record<string, unknown> | null | undefined,
): CompatibilityEvidence[] {
  if (!metadata || typeof metadata !== 'object') return [];
  return parseEvidenceArray(
    (metadata as Record<string, unknown>).compatibility_evidence,
  );
}

// Strip leading definite-article "ה" when joining after the "ב"
// preposition (Hebrew "בה..." reads as "ב..."). Example:
//   joinPrepBet('שניכם לומדים ב', 'האוניברסיטה העברית')
//     → 'שניכם לומדים באוניברסיטה העברית'
//   joinPrepBet('שניכם ב', 'תל אביב')
//     → 'שניכם בתל אביב'
export function joinPrepBet(prefix: string, label: string): string {
  if (label.startsWith('ה')) return `${prefix}${label.slice(1)}`;
  return `${prefix}${label}`;
}

// Hebrew list join with vav-prefix on the last item. Cap is applied by
// the caller (shared_hobbies caps labels at 3 before this is invoked).
export function joinHebrewList(labels: string[]): string {
  if (labels.length === 0) return '';
  if (labels.length === 1) return labels[0];
  if (labels.length === 2) return `${labels[0]} ו${labels[1]}`;
  return `${labels.slice(0, -1).join(', ')} ו${labels[labels.length - 1]}`;
}

// Render a single evidence item to its user-facing Hebrew string.
// Mirrors supabase/functions/match-create/scoring.ts:renderEvidenceText
// so server-rendered and client-rendered strings match exactly.
// Sensitive kinds render generic copy — the raw value/label is
// preserved in the data but never surfaced.
export function renderEvidenceText(ev: CompatibilityEvidence): string {
  switch (ev.kind) {
    case 'shared_hobbies':
      return `שניכם סימנתם ${joinHebrewList(ev.labels)}`;
    case 'same_city':
      return joinPrepBet('שניכם ב', ev.label);
    case 'same_region':
      return `שניכם באזור ${ev.label}`;
    case 'same_university':
      return joinPrepBet('שניכם לומדים ב', ev.label);
    case 'same_faculty':
      return `שניכם בפקולטה ל${ev.label}`;
    case 'same_year_of_study':
      return joinPrepBet('שניכם ב', ev.label);
    case 'shared_intent':
      return `שניכם מחפשים ${ev.label}`;
    case 'shared_pace':
      return `שניכם מעדיפים ${ev.label}`;
    case 'shared_first_date':
      return `שניכם מעדיפים ${ev.label} לדייט ראשון`;
    case 'shared_conflict_style':
      return 'שניכם בסגנון פתרון קונפליקטים דומה';
    case 'shared_religion_type':
      return 'יש לכם רקע דתי משותף';
    case 'shared_top_values':
      return `יש לכם ${ev.values.length} ערכים זוגיים משותפים`;
    case 'ai_vibe':
      return 'וייב דומה בהומור ובערכים';
  }
}
