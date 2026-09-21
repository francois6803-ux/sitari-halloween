# Sitari Halloween 2026

Next.js + Supabase + Google Maps. Public map of trick-or-treat houses for Sitari Country Estate.

Environment variables (all public, optional in Vercel; defaults for Supabase are already in next.config.mjs):
- NEXT_PUBLIC_GOOGLE_MAPS_KEY  (Maps JavaScript API + Geocoding API, restricted to your domain)
- NEXT_PUBLIC_GOOGLE_MAP_ID    (Cloud Map ID for advanced markers)
- NEXT_PUBLIC_ENABLE_GOOGLE_LOGIN=1  (only after Google sign-in is enabled in Supabase Auth)

Database schema and security rules live in the Supabase project `sitari-halloween-2026`.
