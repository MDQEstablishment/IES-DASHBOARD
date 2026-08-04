// Murshid's face. Sprint 9M(A).
//
// The owner's approved artwork, re-optimised: circular crop with alpha,
// quantised, which took the 192 from 64 kB to 14 kB.
//
// SERVED FROM public/, NOT THROUGH THE BUNDLE. The URL is built from
// import.meta.env.BASE_URL at runtime rather than written as an `import`, so
// Vite never sees it as a module: it cannot inline it as a data: URI, cannot
// hash it into a chunk, and the JS payload does not grow by a single byte.
// BASE_URL rather than a bare '/' because the app is served from the
// /IES-DASHBOARD/ sub-path on Pages.
//
// WEBP FIRST, PNG FALLBACK. Every browser that can run this app understands
// webp, but <picture> costs nothing and means a stale client still gets a face
// rather than a broken-image glyph.
//
// width and height are ALWAYS set. Without them the launcher reflows the
// moment the image lands — a button that moves under the cursor on first paint
// is worse than no avatar at all.
const B = import.meta.env.BASE_URL

export default function MurshidAvatar({ size = 24, style }) {
  return (
    <picture>
      <source type="image/webp"
        srcSet={`${B}murshid-avatar-192.webp 1x, ${B}murshid-avatar-384.webp 2x`} />
      <img
        src={`${B}murshid-avatar-192.png`}
        srcSet={`${B}murshid-avatar-192.png 1x, ${B}murshid-avatar-384.png 2x`}
        width={size} height={size} alt="Murshid" decoding="async"
        style={{ width: size, height: size, borderRadius: '50%', display: 'block', flex: 'none', ...style }} />
    </picture>
  )
}
