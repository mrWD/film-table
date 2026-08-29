import { createRequire } from 'node:module'
const sharp = createRequire('/Users/viktor/Projects/film-table/package.json')('sharp')

/*
 * Full-bleed App Store icons, from artwork drawn with its own rounded corners.
 *
 * Apple masks the icon itself and asks that the file not carry rounding. These were
 * drawn at an 18.4% radius on the app's light background — measured off the pixels — so
 * the corners held #f2f2f2.
 *
 * The mask is inset well inside the drawn edge rather than laid exactly on the drawn radius. The
 * first attempt matched it precisely and left a pale halo tracing the old corner: the
 * boundary pixels are anti-aliased, half background, and a mask that keeps them keeps
 * the light in them.
 */
const SIZE = 1024
const RADIUS = Math.round(SIZE * 0.184)
const INSET = 12

for (const [dir, bg] of [
  ['film-table', '#141414'],
  ['games-table', '#16141c'],
  ['books-table', '#141414'],
]) {
  const file = `/Users/viktor/Projects/${dir}/ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png`
  const mask = Buffer.from(
    `<svg width="${SIZE}" height="${SIZE}"><rect x="${INSET}" y="${INSET}" ` +
      `width="${SIZE - INSET * 2}" height="${SIZE - INSET * 2}" ` +
      `rx="${RADIUS}" ry="${RADIUS}" fill="#fff"/></svg>`,
  )
  const inner = await sharp(file)
    .ensureAlpha()
    .composite([{ input: mask, blend: 'dest-in' }])
    .png()
    .toBuffer()

  await sharp({ create: { width: SIZE, height: SIZE, channels: 4, background: bg } })
    .composite([{ input: inner }])
    .flatten({ background: bg })
    .removeAlpha()
    .png()
    .toFile(`${file}.new`)

  // The halo showed up as a light pixel a little way along the edge, so that is where
  // it is checked rather than only in the very corner.
  const { data, info } = await sharp(`${file}.new`).raw().toBuffer({ resolveWithObject: true })
  const at = (x, y) => { const o = (y * info.width + x) * info.channels; return data[o] }
  let worst = { v: -1 }
  for (let y = 0; y < 320; y++) for (let x = 0; x < 320; x++) {
    const o = (y * info.width + x) * info.channels
    if (data[o] > worst.v) worst = { v: data[o], x, y }
  }
  console.log(`${dir.padEnd(12)} самый светлый в углу: ${worst.v} при (${worst.x},${worst.y}), фон ${at(SIZE / 2, 20)}`)
}
