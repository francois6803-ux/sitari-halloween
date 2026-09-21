/** Public (browser-safe) values are inlined here so the build does not depend on dashboard env vars. */
const nextConfig = {
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://oiztowmttklyydxjzmjh.supabase.co',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9penRvd210dGtseXlkeGp6bWpoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk5NTIzODAsImV4cCI6MjEwNTUyODM4MH0.VQw4GvZJPQSiq2Qj6NviKnOAYVA867Qgm49EpZC42-U',
    NEXT_PUBLIC_GOOGLE_MAPS_KEY: process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY || 'AIzaSyA4Ipd5ZmadBWf7a48QitNs8vj_GZhpxrA',
    NEXT_PUBLIC_GOOGLE_MAP_ID: process.env.NEXT_PUBLIC_GOOGLE_MAP_ID || '',
    NEXT_PUBLIC_ENABLE_GOOGLE_LOGIN: process.env.NEXT_PUBLIC_ENABLE_GOOGLE_LOGIN || ''
  }
};
export default nextConfig;
