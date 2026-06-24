-- Migration 032: get_match_context RPC
--
-- Returns the caller's safe view of an active or chat_started match:
--   * peer_details            — inclusion-listed safe questionnaire fields
--   * compatibility_evidence  — concrete evidence array (PR #48 shape)
--
-- Why
-- ───
-- 1. Old matches (created before the PR #48 deploy) carry only the
--    generic legacy compatibility_reasons text (e.g.,
--    "יש חפיפה בתחומי העניין", "יש לכם העדפות דומות לחיבור ראשוני",
--    "יש התאמה ברקע הלימודי"). The PR #49 match-result fallback path
--    renders those generic strings verbatim. This RPC lets the client
--    derive concrete evidence on-the-fly for those rows.
--
-- 2. match-profile today shows only public profile columns (name,
--    university, hobbies, bio). The questionnaire holds richer context
--    that helps users understand who their match is — intent, pace,
--    preferred first date, top values, what the peer wants the partner
--    to know. questionnaire_answers RLS is owner-only (migration
--    002:104-107), so the client cannot SELECT peer answers directly.
--    A SECURITY DEFINER RPC with a strict participant gate + inclusion-
--    list filter is the safe path.
--
-- Scope (intentionally narrow)
-- ────────────────────────────
--   * ONE new SECURITY DEFINER function. No table changes, no RLS
--     changes, no other function changes.
--   * Inclusion-listed peer fields ONLY. No raw answers JSONB is ever
--     returned. No preference / filter / dealbreaker / partner-quality
--     / height-preference / age-range / interested_in_genders /
--     conflict_style / religion fields. No email or auth data. No
--     score / weights / AI traits.
--   * The free-text fields (partner_should_know_text,
--     conversation_starter, green_flag) are surfaced because their
--     questionnaire prompts explicitly framed them as peer-facing
--     ("מה חשוב שבן/בת הזוג יידעו עליי", "פרט שיכול להפוך לשיחת
--     שעה", "סימן שזה מתחיל טוב"). Each is trimmed and capped at 500
--     characters.
--   * For enums in peer_details the function returns the RAW CODE.
--     The client's lib/profile-labels.ts:labelFor() maps to Hebrew.
--     This keeps the Hebrew label source-of-truth on the client and
--     prevents server/client label drift.
--   * For compatibility_evidence the function emits the same shape
--     PR #48's scoring.ts produces:
--       { kind: '<type>', value: '<code>', label: '<hebrew>' }
--       (or values/labels for array kinds)
--     so app/match-result.tsx's existing parseEvidence + render path
--     handles RPC-derived evidence with zero code changes.
--   * Evidence preference order:
--       1. matches.metadata.compatibility_evidence if present + non-
--          empty (PR #48 originally-computed evidence — preserved
--          as-is so renderings stay stable across loads).
--       2. Otherwise derive from caller + peer profiles +
--          questionnaire_answers using the same gates as scoring.ts.
--   * Access control:
--       - auth.uid() must be non-null
--       - caller must be matches.user_a_id or user_b_id
--       - match status must be 'active' or 'chat_started'
--       - any failure returns {"error":"permission_denied"} — does
--         not leak which case failed (existence / participation /
--         status)
--   * Grants: REVOKE FROM PUBLIC, GRANT EXECUTE TO authenticated.
--     NOT anon — peer questionnaire context is participant-only.
--
-- What this migration deliberately does NOT do
-- ────────────────────────────────────────────
--   * Does NOT change existing RLS, tables, or functions.
--   * Does NOT modify create_authorized_match (PR #50 / migration
--     031 is untouched).
--   * Does NOT touch chat send (migration 030 untouched).
--   * Does NOT touch profile email privacy (migration 022 untouched).
--   * Does NOT surface religion_type, religion, conflict_style,
--     dealbreakers, partner_qualities, match_preferences,
--     shared_hobbies_priority, preferred_age_min/max,
--     interested_in_genders, height preferences, AI traits, or
--     scoring internals.
--   * Does NOT change scoring weights or thresholds — evidence
--     thresholds mirror scoring.ts exactly.
--
-- Idempotency
-- ───────────
-- CREATE OR REPLACE FUNCTION + REVOKE/GRANT — re-runs cleanly.

CREATE OR REPLACE FUNCTION public.get_match_context(
  p_match_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  ----------------------------------------------------------------------
  -- Identity + match
  ----------------------------------------------------------------------
  v_caller_id           uuid;
  v_match_user_a        uuid;
  v_match_user_b        uuid;
  v_match_status        text;
  v_match_metadata      jsonb;
  v_peer_id             uuid;

  ----------------------------------------------------------------------
  -- Peer + caller data (read once)
  ----------------------------------------------------------------------
  v_peer_hobbies        text[];
  v_peer_region         text;
  v_peer_campus         text;
  v_peer_university     text;
  v_peer_faculty        text;
  v_peer_year_of_study  text;
  v_peer_answers        jsonb;

  v_caller_hobbies      text[];
  v_caller_region       text;
  v_caller_campus       text;
  v_caller_university   text;
  v_caller_faculty      text;
  v_caller_year_of_study text;
  v_caller_answers      jsonb;

  ----------------------------------------------------------------------
  -- Output builders
  ----------------------------------------------------------------------
  v_peer_details        jsonb := '{}'::jsonb;
  v_evidence            jsonb := '[]'::jsonb;
  v_existing_evidence   jsonb;

  ----------------------------------------------------------------------
  -- Label maps — mirror supabase/functions/match-create/labels.ts so
  -- the same Hebrew strings render whether evidence came from
  -- metadata (PR #48) or from this RPC's derive path. Codes NOT in
  -- these maps are SKIPPED from evidence (per spec: never return raw
  -- code). Maps intentionally exclude 'other' / 'prefer_not_to_say'
  -- / 'attraction' for the same reasons the Edge Function map
  -- excludes them.
  ----------------------------------------------------------------------
  v_hobby_labels        jsonb;
  v_intent_labels       jsonb;
  v_pace_labels         jsonb;
  v_date_labels         jsonb;
  v_region_labels       jsonb;
  v_university_labels   jsonb;
  v_faculty_labels      jsonb;
  v_year_labels         jsonb;
  v_value_labels        jsonb;

  ----------------------------------------------------------------------
  -- Locals for peer_details builders
  ----------------------------------------------------------------------
  v_str                 text;
  v_top_values_safe     text[];

  ----------------------------------------------------------------------
  -- Locals for evidence derivation
  ----------------------------------------------------------------------
  v_shared_hobbies      text[];
  v_shared_hobby_labels text[];
  v_my_city_norm        text;
  v_peer_city_norm      text;
  v_shared_values       text[];
  v_shared_value_labels text[];
BEGIN
  ------------------------------------------------------------------------
  -- 0. Bind Hebrew label maps. Sourced verbatim from:
  --    supabase/functions/match-create/labels.ts and
  --    lib/profile-labels.ts. Source-of-truth for option codes themselves
  --    is app/questionnaire.tsx.
  ------------------------------------------------------------------------
  v_hobby_labels := jsonb_build_object(
    'gym', 'חדר כושר', 'running', 'ריצה', 'hiking', 'טיולים',
    'camping', 'קמפינג', 'beach', 'ים', 'music', 'מוזיקה',
    'concerts', 'הופעות', 'movies', 'סרטים', 'series', 'סדרות',
    'reading', 'קריאה', 'gaming', 'גיימינג', 'cooking', 'בישול',
    'restaurants', 'מסעדות', 'art', 'אומנות', 'photography', 'צילום',
    'dancing', 'ריקוד', 'dogs', 'כלבים', 'cats', 'חתולים',
    'tech', 'טכנולוגיה', 'entrepreneurship', 'יזמות',
    'tennis', 'טניס', 'jet_ski', 'אופנוע ים'
  );
  v_intent_labels := jsonb_build_object(
    'long_term', 'קשר לטווח ארוך',
    'short_term', 'קשר קצר',
    'casual', 'משהו קליל',
    'open_flow', 'משהו זורם'
  );
  v_pace_labels := jsonb_build_object(
    'very_slow', 'קצב איטי מאוד',
    'gradual', 'להכיר בהדרגה',
    'medium', 'קצב בינוני',
    'fast_with_connection', 'כשיש חיבור — לזרום מהר'
  );
  v_date_labels := jsonb_build_object(
    'coffee', 'בית קפה', 'restaurant', 'מסעדה', 'bar', 'בר',
    'picnic', 'פיקניק', 'nature_walk', 'טיול בטבע',
    'active', 'פעילות אקטיבית', 'home_evening', 'ערב ביתי'
  );
  v_region_labels := jsonb_build_object(
    'north', 'צפון', 'south', 'דרום', 'center', 'מרכז',
    'jerusalem', 'ירושלים והסביבה', 'haifa', 'חיפה והקריות'
  );
  v_university_labels := jsonb_build_object(
    'huji', 'האוניברסיטה העברית',
    'tau', 'אוניברסיטת תל אביב',
    'bgu', 'אוניברסיטת בן גוריון',
    'haifa', 'אוניברסיטת חיפה',
    'technion', 'הטכניון',
    'biu', 'אוניברסיטת בר אילן',
    'ariel', 'אוניברסיטת אריאל'
  );
  v_faculty_labels := jsonb_build_object(
    'psychology', 'פסיכולוגיה', 'cs', 'מדעי המחשב',
    'law', 'משפטים', 'medicine', 'רפואה',
    'business', 'מנהל עסקים', 'engineering', 'הנדסה'
  );
  v_year_labels := jsonb_build_object(
    'year_1', 'שנה א׳', 'year_2', 'שנה ב׳',
    'year_3', 'שנה ג׳', 'year_4', 'שנה ד׳',
    'year_5_plus', 'שנה ה׳ ומעלה', 'masters', 'תואר שני'
  );
  v_value_labels := jsonb_build_object(
    'trust', 'אמון', 'communication', 'תקשורת', 'humor', 'הומור',
    'stability', 'יציבות', 'friendship', 'חברות',
    'independence', 'עצמאות', 'ambition', 'שאפתנות',
    'family', 'משפחתיות'
  );

  ------------------------------------------------------------------------
  -- 1. Auth gate. The whole point of the RPC is to surface peer data
  --    that requires participant identity — refuse unconditionally if
  --    auth.uid() is null.
  ------------------------------------------------------------------------
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RETURN jsonb_build_object('error', 'permission_denied');
  END IF;

  ------------------------------------------------------------------------
  -- 2. Fetch + verify match. A single error code for all failure modes
  --    (missing match / non-participant / terminal status) to avoid
  --    leaking which users exist or which matches the caller is in.
  ------------------------------------------------------------------------
  SELECT user_a_id, user_b_id, status, metadata
    INTO v_match_user_a, v_match_user_b, v_match_status, v_match_metadata
    FROM public.matches
   WHERE id = p_match_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'permission_denied');
  END IF;

  IF v_caller_id <> v_match_user_a AND v_caller_id <> v_match_user_b THEN
    RETURN jsonb_build_object('error', 'permission_denied');
  END IF;

  IF v_match_status NOT IN ('active', 'chat_started') THEN
    RETURN jsonb_build_object('error', 'permission_denied');
  END IF;

  ------------------------------------------------------------------------
  -- 3. Determine peer id.
  ------------------------------------------------------------------------
  v_peer_id := CASE
    WHEN v_caller_id = v_match_user_a THEN v_match_user_b
    ELSE v_match_user_a
  END;

  ------------------------------------------------------------------------
  -- 4. Read peer profile. Inclusion-listed columns only — never SELECT
  --    email, gender, birth_year, interested_in_genders, height
  --    preferences, AI traits, or any preference field. If the peer's
  --    profile row is gone (cascade race), return empty payload (not
  --    an error — match-profile UI handles empty gracefully).
  ------------------------------------------------------------------------
  SELECT hobbies, region, campus, university, faculty, year_of_study
    INTO v_peer_hobbies, v_peer_region, v_peer_campus,
         v_peer_university, v_peer_faculty, v_peer_year_of_study
    FROM public.profiles
   WHERE id = v_peer_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'peer_details', '{}'::jsonb,
      'compatibility_evidence', '[]'::jsonb
    );
  END IF;

  ------------------------------------------------------------------------
  -- 5. Read caller profile (needed for evidence derivation only).
  --    Same inclusion list — never SELECT email or filters.
  ------------------------------------------------------------------------
  SELECT hobbies, region, campus, university, faculty, year_of_study
    INTO v_caller_hobbies, v_caller_region, v_caller_campus,
         v_caller_university, v_caller_faculty, v_caller_year_of_study
    FROM public.profiles
   WHERE id = v_caller_id;

  ------------------------------------------------------------------------
  -- 6. Read questionnaire_answers (peer + caller). NULL-safe.
  --    NEVER returned raw — only inclusion-listed keys are read out.
  ------------------------------------------------------------------------
  SELECT answers INTO v_peer_answers
    FROM public.questionnaire_answers
   WHERE user_id = v_peer_id;
  v_peer_answers := COALESCE(v_peer_answers, '{}'::jsonb);

  SELECT answers INTO v_caller_answers
    FROM public.questionnaire_answers
   WHERE user_id = v_caller_id;
  v_caller_answers := COALESCE(v_caller_answers, '{}'::jsonb);

  ------------------------------------------------------------------------
  -- 7. Build peer_details (raw codes for enums; trimmed+capped text
  --    for free-text). Each field is added ONLY if it passes the
  --    inclusion-list / safe-label / non-empty check.
  ------------------------------------------------------------------------

  -- intent_type — return code only if in safe label set.
  v_str := NULLIF(v_peer_answers ->> 'intent_type', '');
  IF v_str IS NOT NULL AND v_intent_labels ? v_str THEN
    v_peer_details := v_peer_details || jsonb_build_object('intent_type', v_str);
  END IF;

  -- relationship_pace — same pattern.
  v_str := NULLIF(v_peer_answers ->> 'relationship_pace', '');
  IF v_str IS NOT NULL AND v_pace_labels ? v_str THEN
    v_peer_details := v_peer_details || jsonb_build_object('relationship_pace', v_str);
  END IF;

  -- preferred_first_date — same pattern. 'connection_matters' is not
  -- in v_date_labels, so it's skipped (consistent with the Edge
  -- Function's DATE_LABELS_HE exclusion).
  v_str := NULLIF(v_peer_answers ->> 'preferred_first_date', '');
  IF v_str IS NOT NULL AND v_date_labels ? v_str THEN
    v_peer_details := v_peer_details || jsonb_build_object('preferred_first_date', v_str);
  END IF;

  -- relationship_top_values — filter the peer's array to the safe
  -- 8-code subset (attraction + other excluded). Returned ONLY if the
  -- filtered array has >= 1 element.
  IF jsonb_typeof(v_peer_answers -> 'relationship_top_values') = 'array' THEN
    SELECT array_agg(v ORDER BY ord)
      INTO v_top_values_safe
      FROM jsonb_array_elements_text(v_peer_answers -> 'relationship_top_values')
        WITH ORDINALITY AS t(v, ord)
     WHERE v_value_labels ? v;
    IF v_top_values_safe IS NOT NULL AND array_length(v_top_values_safe, 1) > 0 THEN
      v_peer_details := v_peer_details ||
        jsonb_build_object('relationship_top_values', to_jsonb(v_top_values_safe));
    END IF;
  END IF;

  -- Free-text fields: trim, cap at 500 chars (chars, not bytes — safe
  -- for Hebrew), include ONLY if non-empty after trim.
  v_str := NULLIF(btrim(COALESCE(v_peer_answers ->> 'partner_should_know_text', '')), '');
  IF v_str IS NOT NULL THEN
    v_peer_details := v_peer_details ||
      jsonb_build_object('partner_should_know_text', left(v_str, 500));
  END IF;

  v_str := NULLIF(btrim(COALESCE(v_peer_answers ->> 'conversation_starter', '')), '');
  IF v_str IS NOT NULL THEN
    v_peer_details := v_peer_details ||
      jsonb_build_object('conversation_starter', left(v_str, 500));
  END IF;

  v_str := NULLIF(btrim(COALESCE(v_peer_answers ->> 'green_flag', '')), '');
  IF v_str IS NOT NULL THEN
    v_peer_details := v_peer_details ||
      jsonb_build_object('green_flag', left(v_str, 500));
  END IF;

  ------------------------------------------------------------------------
  -- 8. Compatibility evidence. Prefer the originally-computed evidence
  --    stored on the match row (PR #48) so the displayed evidence
  --    stays stable across loads. Fall back to deriving fresh evidence
  --    from current profile + questionnaire state if metadata is missing
  --    or empty.
  ------------------------------------------------------------------------
  v_existing_evidence := v_match_metadata -> 'compatibility_evidence';
  IF v_existing_evidence IS NOT NULL
     AND jsonb_typeof(v_existing_evidence) = 'array'
     AND jsonb_array_length(v_existing_evidence) > 0 THEN
    v_evidence := v_existing_evidence;
  ELSE
    -- Derive. Each kind mirrors the corresponding emission in
    -- supabase/functions/match-create/scoring.ts so the shape +
    -- thresholds match exactly. Order here mirrors the
    -- EVIDENCE_PRIORITY list in scoring.ts; the client's
    -- applyEvidencePriorityAndCap (in scoring.ts) already capped
    -- stored evidence to 3 items, but here we don't enforce the cap
    -- because the client's renderer accepts any non-empty array.

    -- shared_hobbies — caller-order preserved, only safe-labeled
    -- codes counted, ≥2 overlap required (same gate as scoring.ts).
    -- Returns top 3 labels.
    IF v_caller_hobbies IS NOT NULL AND v_peer_hobbies IS NOT NULL THEN
      SELECT
        array_agg(h ORDER BY ord) FILTER (WHERE TRUE),
        array_agg(v_hobby_labels ->> h ORDER BY ord) FILTER (WHERE TRUE)
        INTO v_shared_hobbies, v_shared_hobby_labels
        FROM (
          SELECT h, ord
            FROM unnest(v_caller_hobbies) WITH ORDINALITY AS t(h, ord)
           WHERE h = ANY(v_peer_hobbies)
             AND v_hobby_labels ? h
           ORDER BY ord
           LIMIT 3
        ) sub;
      IF v_shared_hobbies IS NOT NULL
         AND array_length(v_shared_hobbies, 1) >= 2 THEN
        v_evidence := v_evidence || jsonb_build_array(
          jsonb_build_object(
            'kind', 'shared_hobbies',
            'values', to_jsonb(v_shared_hobbies),
            'labels', to_jsonb(v_shared_hobby_labels)
          )
        );
      END IF;
    END IF;

    -- same_university — exact match + safe label.
    IF v_caller_university IS NOT NULL
       AND v_peer_university IS NOT NULL
       AND v_caller_university = v_peer_university
       AND v_university_labels ? v_caller_university THEN
      v_evidence := v_evidence || jsonb_build_array(
        jsonb_build_object(
          'kind', 'same_university',
          'value', v_caller_university,
          'label', v_university_labels ->> v_caller_university
        )
      );
    END IF;

    -- same_faculty — exact match + safe label.
    IF v_caller_faculty IS NOT NULL
       AND v_peer_faculty IS NOT NULL
       AND v_caller_faculty = v_peer_faculty
       AND v_faculty_labels ? v_caller_faculty THEN
      v_evidence := v_evidence || jsonb_build_array(
        jsonb_build_object(
          'kind', 'same_faculty',
          'value', v_caller_faculty,
          'label', v_faculty_labels ->> v_caller_faculty
        )
      );
    END IF;

    -- same_year_of_study — exact match + safe label.
    IF v_caller_year_of_study IS NOT NULL
       AND v_peer_year_of_study IS NOT NULL
       AND v_caller_year_of_study = v_peer_year_of_study
       AND v_year_labels ? v_caller_year_of_study THEN
      v_evidence := v_evidence || jsonb_build_array(
        jsonb_build_object(
          'kind', 'same_year_of_study',
          'value', v_caller_year_of_study,
          'label', v_year_labels ->> v_caller_year_of_study
        )
      );
    END IF;

    -- same_city — case-insensitive whitespace-normalized match on
    -- profiles.campus (free text). Caller's trimmed campus is used
    -- for the displayed value (same convention as scoring.ts).
    v_my_city_norm := lower(regexp_replace(btrim(COALESCE(v_caller_campus, '')), '\s+', ' ', 'g'));
    v_peer_city_norm := lower(regexp_replace(btrim(COALESCE(v_peer_campus, '')), '\s+', ' ', 'g'));
    IF length(v_my_city_norm) > 0 AND v_my_city_norm = v_peer_city_norm THEN
      v_evidence := v_evidence || jsonb_build_array(
        jsonb_build_object(
          'kind', 'same_city',
          'value', btrim(v_caller_campus),
          'label', btrim(v_caller_campus)
        )
      );
    END IF;

    -- same_region — exact match only (PR #48 dropped strong-adjacent
    -- region emission).
    IF v_caller_region IS NOT NULL
       AND v_peer_region IS NOT NULL
       AND v_caller_region = v_peer_region
       AND v_region_labels ? v_caller_region THEN
      v_evidence := v_evidence || jsonb_build_array(
        jsonb_build_object(
          'kind', 'same_region',
          'value', v_caller_region,
          'label', v_region_labels ->> v_caller_region
        )
      );
    END IF;

    -- shared_intent — both meaningful, equal, in safe label set.
    v_str := NULLIF(v_caller_answers ->> 'intent_type', '');
    IF v_str IS NOT NULL
       AND v_str = NULLIF(v_peer_answers ->> 'intent_type', '')
       AND v_intent_labels ? v_str THEN
      v_evidence := v_evidence || jsonb_build_array(
        jsonb_build_object(
          'kind', 'shared_intent',
          'value', v_str,
          'label', v_intent_labels ->> v_str
        )
      );
    END IF;

    -- shared_pace — both meaningful, equal, in safe label set.
    v_str := NULLIF(v_caller_answers ->> 'relationship_pace', '');
    IF v_str IS NOT NULL
       AND v_str = NULLIF(v_peer_answers ->> 'relationship_pace', '')
       AND v_pace_labels ? v_str THEN
      v_evidence := v_evidence || jsonb_build_array(
        jsonb_build_object(
          'kind', 'shared_pace',
          'value', v_str,
          'label', v_pace_labels ->> v_str
        )
      );
    END IF;

    -- shared_first_date — both meaningful, equal, in safe label set.
    v_str := NULLIF(v_caller_answers ->> 'preferred_first_date', '');
    IF v_str IS NOT NULL
       AND v_str = NULLIF(v_peer_answers ->> 'preferred_first_date', '')
       AND v_date_labels ? v_str THEN
      v_evidence := v_evidence || jsonb_build_array(
        jsonb_build_object(
          'kind', 'shared_first_date',
          'value', v_str,
          'label', v_date_labels ->> v_str
        )
      );
    END IF;

    -- shared_top_values — intersect safe-labeled subsets of both
    -- arrays. Same gate as scoring.ts: ≥2 safe overlapping values.
    IF jsonb_typeof(v_caller_answers -> 'relationship_top_values') = 'array'
       AND jsonb_typeof(v_peer_answers -> 'relationship_top_values') = 'array' THEN
      WITH peer_safe AS (
        SELECT v
          FROM jsonb_array_elements_text(v_peer_answers -> 'relationship_top_values') AS v
         WHERE v_value_labels ? v
      )
      SELECT
        array_agg(v ORDER BY ord),
        array_agg(v_value_labels ->> v ORDER BY ord)
        INTO v_shared_values, v_shared_value_labels
        FROM jsonb_array_elements_text(v_caller_answers -> 'relationship_top_values')
          WITH ORDINALITY AS t(v, ord)
       WHERE v_value_labels ? v
         AND v IN (SELECT v FROM peer_safe);
      IF v_shared_values IS NOT NULL
         AND array_length(v_shared_values, 1) >= 2 THEN
        v_evidence := v_evidence || jsonb_build_array(
          jsonb_build_object(
            'kind', 'shared_top_values',
            'values', to_jsonb(v_shared_values),
            'labels', to_jsonb(v_shared_value_labels)
          )
        );
      END IF;
    END IF;
  END IF;

  ------------------------------------------------------------------------
  -- 9. Return the assembled payload.
  ------------------------------------------------------------------------
  RETURN jsonb_build_object(
    'peer_details', v_peer_details,
    'compatibility_evidence', v_evidence
  );
END;
$$;

-- Strip the default PUBLIC EXECUTE; grant ONLY to authenticated.
-- Peer questionnaire context is participant-only — anon should never
-- be able to invoke this (no in-function auth.uid() fallback exists
-- for anon callers; the function returns permission_denied in that
-- case via the auth.uid() IS NULL check, but defense in depth: keep
-- anon out of the EXECUTE permission set entirely).
REVOKE ALL ON FUNCTION public.get_match_context(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_match_context(uuid) TO authenticated;

COMMENT ON FUNCTION public.get_match_context(uuid) IS
  'Returns safe peer questionnaire details + compatibility evidence for '
  'the caller''s active or chat_started match. SECURITY DEFINER with strict '
  'participant + status gate. Inclusion-listed peer fields only (raw '
  'questionnaire JSONB never returned). Evidence preference order: stored '
  'matches.metadata.compatibility_evidence first (PR #48), else derived '
  'from caller + peer profile + questionnaire using the same gates as '
  'scoring.ts. Returns {"error":"permission_denied"} on any auth / '
  'participant / status failure (single code to avoid existence leaks). '
  'Granted to authenticated only.';
