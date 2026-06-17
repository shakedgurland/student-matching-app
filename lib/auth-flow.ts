const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const STUDENT_EMAIL_PATTERN = /\.ac\.il$/i;

export function isStudentEmail(email: string): boolean {
  const normalized = email.trim().toLowerCase();
  if (!EMAIL_SHAPE.test(normalized)) return false;
  const domain = normalized.split('@')[1];
  return STUDENT_EMAIL_PATTERN.test(domain);
}

const ALREADY_REGISTERED = 'אימייל זה כבר רשום במערכת. נסי להתחבר במקום.';
const WEAK_PASSWORD = 'הסיסמה חלשה מדי. בחרי סיסמה ארוכה יותר.';
const NOT_STUDENT_EMAIL = 'ניתן להירשם רק עם אימייל אקדמי (סיומת ‎.ac.il‎).';
const GENERIC = 'אירעה שגיאה בהרשמה. נסי שוב.';

export function classifySignupError(err: unknown): string {
  if (!err) return GENERIC;

  const obj = typeof err === 'object' && err !== null ? (err as Record<string, unknown>) : null;
  const code = obj && typeof obj.code === 'string' ? obj.code : '';
  const rawMessage = obj && typeof obj.message === 'string' ? obj.message : String(err);
  const message = rawMessage.toLowerCase();

  if (
    code === 'user_already_exists' ||
    message.includes('already registered') ||
    message.includes('already been registered')
  ) {
    return ALREADY_REGISTERED;
  }

  if (
    code === 'weak_password' ||
    message.includes('password should be at least') ||
    message.includes('weak password')
  ) {
    return WEAK_PASSWORD;
  }

  if (
    message.includes('profiles_email_is_student') ||
    message.includes('check constraint')
  ) {
    return NOT_STUDENT_EMAIL;
  }

  return GENERIC;
}
