import React from 'react';
import { Redirect } from 'expo-router';

// The active-match route is an alias for match-result. The match-result
// screen reads the caller's active match from public.matches and renders
// the real peer profile, compatibility score, reasons, icebreaker, expiry
// timer, and chat/feedback actions, so this route redirects there for any
// existing deep links.
export default function ActiveMatchScreen() {
  return <Redirect href={'/match-result' as any} />;
}
