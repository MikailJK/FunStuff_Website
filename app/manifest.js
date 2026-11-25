// Web app manifest (served at /manifest.webmanifest): the name, icon and
// colours a phone uses when the site is added to the home screen.
// The iPhone icon is app/apple-icon.png; the browser tab icon is app/icon.png.

export default function manifest() {
  return {
    name: 'Mikail Krochta',
    short_name: 'Mikail',
    start_url: '/',
    display: 'standalone',
    background_color: '#101214',
    theme_color: '#101214',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  };
}
