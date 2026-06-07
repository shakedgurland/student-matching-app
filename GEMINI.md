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
- **Methods:** University email, student card upload, proof of studies, manual review.
- **Privacy Rule:** Do not store sensitive ID information unless absolutely necessary. Design for privacy and security.

## Screens Implemented
1. **Welcome Screen** (`app/(tabs)/index.tsx`)
2. **Signup Screen** (`app/signup.tsx`)
3. **Login Screen** (`app/login.tsx`)
4. **Student Verification Screen** (`app/student-verification.tsx`)
5. **Basic Questionnaire Screen** (`app/basic-questionnaire.tsx`)
6. **Questionnaire Transition Screen** (`app/questionnaire-transition.tsx`)
7. **Deeper Questionnaire Screen** (`app/deeper-questionnaire.tsx`)
8. **Match Result Screen** (`app/match-result.tsx`)
9. **Active Match Screen** (`app/active-match.tsx`)
10. **Chat Screen** (`app/chat.tsx`)
11. **My Profile Screen** (`app/my-profile.tsx`)

## User Flow
Signup/Login -> Student Verification -> Basic Questionnaire -> Transition (Initial Matches) -> Deeper Questionnaire (Optional) -> Home (Explore Tab) -> Match Result -> Active Match -> Chat.

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
