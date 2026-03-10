# Security

## Threat Model

Primary assets:
- User-uploaded books and documents
- Generated audio assets
- Listening preferences
- Account identity

## Initial Rules

- Imports are private by default
- No DRM cracking
- No public sharing of imported files
- Validate all upload types and sizes
- Validate all public form inputs at the server boundary
- Avoid exposing raw storage paths in responses

## Security Checklist

- [ ] Auth required before private asset access
- [ ] Input validation on all mutation routes
- [ ] No secrets committed
- [ ] Env vars validated at startup
- [ ] Errors do not leak internals

## Backend Sync Notes

- Workspace sync uses an anonymous httpOnly cookie instead of localStorage-only identity.
- Sync payloads are validated at the API boundary before SQLite persistence.
- This is a bridge step, not full auth. Private asset protection still needs real account-based authorization.

## Account Notes

- Account session uses a separate httpOnly cookie.
- Current sign-in is local and email-backed only; it is not yet passwordless email delivery or third-party hosted auth.
- Workspaces can now be linked to users in SQLite, which is the first ownership step before account-based data isolation.
