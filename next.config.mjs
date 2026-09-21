/** Public (browser-safe) values are inlined here so the build does not depend on dashboard env vars. */
const nextConfig = {
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://oiztowmttklyydxjzmjh.supabase.co',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_ttR5ozjshCpKhg-eIYZQVA_1PQVmxSL',
    NEXT_PUBLIC_GOOGLE_MAPS_KEY: process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY || 'AIzaSyA4Ipd5ZmadBWf7a48QitNs8vj_GZhpxrA',
    NEXT_PUBLIC_GOOGLE_MAP_ID: process.env.NEXT_PUBLIC_GOOGLE_MAP_ID || '',
    NEXT_PUBLIC_ENABLE_GOOGLE_LOGIN: process.env.NEXT_PUBLIC_ENABLE_GOOGLE_LOGIN || ''
  }
};
export default nextConfig;
