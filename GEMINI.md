# UniMatch - Project Context & Instructions

## Project Overview
**Project Name:** UniMatch
**Project Type:** Mobile app built with Expo, React Native, and TypeScript.
**Target Audience:** Verified students only.
**Description:** UniMatch is a student matching mobile app that helps students find one meaningful match at a time across faculties based on compatibility, interests, personality, values, campus, faculty, and intent.

## Language and Layout
- **Language:** Hebrew only.
- **Layout:** Full RTL (Right-to-Left) support.
- **UI Text:** All text must be in Hebrew, providing a natural experience for Hebrew-speaking students.

## Core Product Rules
1. **One Match at a Time:** Users see only one best match at a time.
2. **Monthly Limit:** Maximum of 5 matches per month per user.
3. **Chat Window:** Users have 72 hours to start a chat after receiving a match.
4. **Expiration:** Matches expire if a chat is not started within 72 hours.
5. **Tone:** Safe, personal, intentional, student-focused, and professional. Not a "random dating app."
6. **Platform:** Suitable for both iPhone and Android.

## Student Verification
- **Verification Required:** Only verified students can use the real app.
- **MVP Method:** University email verification (primary).
- **Future Methods:** Student card upload, proof of studies, manual review (to be added in later stages).
- **Privacy Rule:** Do not store sensitive ID information unless absolutely necessary. Design for privacy and security.

## Screens to Implement
1. **Welcome Screen**
2. **Signup Screen:** Username and password fields.
3. **Student Verification Demo Screen**
4. **Matching Questionnaire Screen:** Smart, multi-step personality and values assessment.
5. **Match Result Screen**
6. **72-hour Active Match Screen**
7. **Demo Chat Screen**

## Questionnaire Strategy
- **Direction:** Precise matching based on personality, values, social style, and intent.
- **Signals:** Spontaneity, social confidence, communication style, values, relationship goals, boundaries.
- **UX:** Card-based selection, progress tracking, pleasant and playful but professional.

## Design Rules
- **Hebrew RTL:** Native right-to-left flow.
- **Mobile-first:** Optimized for touch and mobile screens.
- **Readability:** Large readable text; no tiny text.
- **Consistency:** Consistent button sizes and clear main CTAs.
- **Layout:** No overlapping text; professional, modern, clean, and trustworthy.
- **Vibe:** Friendly but not childish; feels like a "real" app from the start.

## Technical Rules
- **Stack:** Expo React Native, TypeScript.
- **Code Style:** Keep code simple, readable, and focused.
- **Workflow:** 
    - Make small, focused changes.
    - Briefly explain plans before editing.
    - Summarize changes after editing.
- **Execution:** Ensure the app can run with `npx expo start`.
- **Dependencies:** Avoid unnecessary libraries; prefer built-in Expo/React Native solutions or well-established ones only when they clearly help.

## Long-term Architecture
- **Architecture:** Expo mobile app + Render backend API + Supabase Auth/Postgres/Storage/Realtime.
- **Documentation:** See `ARCHITECTURE.md` for full details.
