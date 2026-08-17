# connect-app

<!-- Cloudflare deployment trigger -->

# ConnectApp UI Redesign

This package is a full UI replacement based on your existing `test2.txt`.

Included:
- `index.html`
- `style.css`
- `app.js`
- `config.example.js`

## Keep your existing config.js

Your original app loads:

    <script src="config.js"></script>

Keep your existing `config.js` with the same values:

    window.SUPABASE_URL = "...";
    window.SUPABASE_ANON_KEY = "...";

Do not replace it with the example unless you are configuring the project.

## Existing backend/data model preserved

The redesigned frontend continues to use the existing Supabase tables/storage referenced by your original app:
- profiles
- posts
- likes
- comments
- messages
- post-images storage bucket

## Main UI changes

Mobile:
- Instagram-inspired feed
- WhatsApp-inspired conversation flow
- Separate mobile chat screen
- Fixed bottom navigation
- Create post bottom-sheet/modal
- Compact profile/search views
- No scrollIntoView navigation for main sections

Desktop:
- Persistent left navigation
- Centered feed
- Split message list/chat layout
- Modal post creation
- Cleaner spacing and typography

## Installation

Replace your current:
- index.html
- style.css
- app.js

with the files in this package.

Keep:
- config.js
- manifest.json
- your Supabase project/database/storage configuration

Then hard-refresh the browser after deployment.
