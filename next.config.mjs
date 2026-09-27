/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    // Versión del código publicada; la app la compara con la del servidor para recargarse sola.
    NEXT_PUBLIC_APP_VERSION: process.env.RENDER_GIT_COMMIT || 'dev',
  },
  poweredByHeader: false,
  async headers() {
    return [
      {
        // La página principal siempre se revalida para no quedar con una versión vieja.
        source: '/',
        headers: [{ key: 'Cache-Control', value: 'no-cache, must-revalidate' }],
      },
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Permissions-Policy', value: 'camera=(self), geolocation=(self), microphone=()' },
        ],
      },
    ];
  },
};

export default nextConfig;
