# ConnectApp Final UI

This package is based on the supplied ConnectApp frontend and the verified Supabase contract.

## Supabase contract preserved

Tables:
- profiles
- posts
- likes
- comments
- messages

Storage bucket:
- post-images

No database migration is included.

## Main fixes

- Desktop Messages now fills the available content area instead of leaving a large blank right side.
- Desktop chat has a real empty state instead of an apparently broken/blank panel.
- Desktop message list and composer live inside a stable chat panel.
- Mobile Messages uses a full-screen conversation view.
- Mobile chat has its own scrolling message area.
- The page itself does not jump while reading messages.
- The composer remains attached to the bottom of the chat.
- Previous messages remain scrollable on mobile.
- Chat header always shows the selected recipient name/avatar.
- New-message notice appears when a realtime message arrives while reading older messages.
- Realtime chat continues to use the existing `messages` table.
- Added Change Password under Profile → Security.
- Added Forgot Password / reset-link flow.
- No fake member count or ambiguous `C + +` symbol.
- Existing posts, likes, comments, search, profiles and post image storage remain based on the existing schema.

## Setup

1. Copy `config.example.js` to `config.js`.
2. Put only your Supabase URL and browser-safe publishable/anon key in `config.js`.
3. Do not put a secret/service_role key in `config.js`.
4. Open `index.html` through your existing hosting/deployment method.

## Password reset

The browser calls Supabase Auth:
- `resetPasswordForEmail`
- `updateUser({ password })`

The reset email itself still depends on Supabase Auth email configuration and provider/rate limits. The frontend cannot force an email to be delivered.

## Important

The code intentionally does not create or modify:
- database tables
- RLS policies
- foreign keys
- Storage policies
- Realtime publications

Those were already verified for the existing ConnectApp backend.
