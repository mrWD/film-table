import { mkdir, readFile } from 'node:fs/promises'
import sharp from 'sharp'

const svg = await readFile(new URL('../public/favicon.svg', import.meta.url))
await mkdir(new URL('../public/icons', import.meta.url), { recursive: true })

const out = (name) => new URL(`../public/icons/${name}`, import.meta.url).pathname

await sharp(svg, { density: 300 }).resize(192, 192).png().toFile(out('icon-192.png'))
await sharp(svg, { density: 300 }).resize(512, 512).png().toFile(out('icon-512.png'))
await sharp(svg, { density: 300 }).resize(180, 180).flatten({ background: '#141414' }).png().toFile(out('apple-touch-icon.png'))

// Maskable: same art with extra safe-zone padding on a solid background
const inner = await sharp(svg, { density: 300 }).resize(400, 400).png().toBuffer()
await sharp({
  create: { width: 512, height: 512, channels: 4, background: '#141414' },
})
  .composite([{ input: inner, top: 56, left: 56 }])
  .png()
  .toFile(out('icon-maskable-512.png'))

console.log('icons generated')
