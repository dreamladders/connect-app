# ConnectApp - Final UI Redesign

This version is based on the existing ConnectApp frontend contract in `test2.txt`.

## Files
- index.html - complete UI
- style.css - responsive UI system
- app.js - Supabase/auth/posts/search/chat logic
- config.example.js - copy to config.js

## Keep your existing files
Keep your existing `config.js` and `manifest.json` if you already have them.

`config.js` must expose:
```js
window.SUPABASE_URL = "https://YOUR_PROJECT.supabase.co";
window.SUPABASE_ANON_KEY = "YOUR_PUBLISHABLE_OR_ANON_KEY";
```

Use only the Supabase publishable/anon key in browser code. Never expose a secret/service_role key.

## Existing Supabase tables/bucket used
- profiles
- posts
- likes
- comments
- messages
- storage bucket: post-images

No database migration is included because this UI preserves the existing data contract.

## UI changes
- Mobile-first social feed
- Fixed mobile bottom navigation
- Separate mobile conversation list and full-screen chat
- Desktop split chat layout
- Stable message scrolling
- Preserve scroll position while reading older messages
- Auto-scroll only when already near the bottom
- New-message notice when a realtime message arrives while reading older messages
- Persistent chat recipient header with avatar/name
- Create post modal/bottom sheet
- Cleaner profile/search screens
- Removed page-level scrollIntoView navigation for app sections
- Removed ambiguous home symbols/counts; no fake member count is shown
