/**
 * Writes public/licenses.txt: every production dependency, with the licence it ships with.
 *
 * MIT, ISC, BSD and Apache all ask for the same thing — that their notice travels with the
 * software — and an app bundle is the software travelling. So the notices go into the
 * bundle as a plain file, which Profile reads in place. Being a file in `public/`, it is in
 * the native app's own assets and in the web build's precache: it opens with no network.
 *
 * "Production" is read from package-lock.json: every entry under `packages` that is not
 * marked `dev` (nor `devOptional`, which is the dev tree too). That is wider than what ends
 * up in the JavaScript bundle — it includes @capacitor/cli and its toolchain, because
 * `dependencies` is where Capacitor tells you to put it — and wider is the safe side of
 * this list.
 *
 * Run by `npm run build` (and so by `build:native`) and by `npm run dev`. The output has
 * no date in it, so two builds of the same tree produce the same file.
 */
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'public', 'licenses.txt')

/** LICENSE, LICENCE, COPYING — with or without an extension or a suffix — and NOTICE,
 *  which Apache-2.0 asks to be passed on alongside the licence. */
const NOTICE_FILE = /^(licen[cs]e|copying|notice)([.\-_].*)?$/i

// Forty, not eighty: Profile shows this file on a 375px phone, where an eighty-column rule
// breaks across two lines. The header paragraphs are unwrapped for the same reason.
const RULE = '='.repeat(40)
const THIN = '-'.repeat(40)

const lock = JSON.parse(readFileSync(join(ROOT, 'package-lock.json'), 'utf8'))

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}

/** The licence files a package ships, licence before notice, each trimmed. */
function noticeFiles(dir) {
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((name) => NOTICE_FILE.test(name) && statSync(join(dir, name)).isFile())
    .sort((a, b) => Number(/^notice/i.test(a)) - Number(/^notice/i.test(b)) || a.localeCompare(b))
    .map((name) => ({ name, text: readFileSync(join(dir, name), 'utf8').replace(/\r\n?/g, '\n').trim() }))
}

/** The declared licence, from the lock first and the package's own manifest second. */
function declared(entry, manifest) {
  const raw = entry.license ?? manifest?.license ?? manifest?.licenses
  if (!raw) return 'UNKNOWN'
  if (typeof raw === 'string') return raw
  // The old array-of-objects form: [{ type: 'MIT', url }].
  const list = Array.isArray(raw) ? raw : [raw]
  return list.map((l) => (typeof l === 'string' ? l : l.type)).join(' OR ')
}

const packages = new Map()
for (const [path, entry] of Object.entries(lock.packages)) {
  // '' is the app itself; a link is listed again under the path it points to.
  if (!path || entry.dev || entry.devOptional || entry.link) continue

  const dir = join(ROOT, path)
  const manifest = readJson(join(dir, 'package.json'))
  const name = entry.name ?? manifest?.name ?? path.slice(path.lastIndexOf('node_modules/') + 13)
  const version = entry.version ?? manifest?.version ?? ''
  const key = `${name}@${version}`
  // The same version nested twice is one set of terms, listed once.
  if (packages.has(key)) continue

  packages.set(key, { name, version, license: declared(entry, manifest), files: noticeFiles(dir) })
}

const sorted = [...packages.values()].sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version))

const out = [
  'FilmTable — open-source licences',
  '',
  'FilmTable is released under the MIT licence. It is built with the open-source packages below ' +
    `(${sorted.length} of them), each listed with the licence it is distributed under and the ` +
    'licence text it ships with.',
  '',
  'Generated from package-lock.json by scripts/gen-licenses.mjs.',
]

for (const pkg of sorted) {
  out.push('', RULE, `${pkg.name} ${pkg.version}`.trim(), `Licence: ${pkg.license}`, RULE)
  if (!pkg.files.length) {
    out.push('', `This package ships no licence file. It declares its licence as ${pkg.license}.`)
    continue
  }
  pkg.files.forEach((file, i) => {
    if (i > 0 || pkg.files.length > 1) out.push('', THIN, file.name, THIN)
    out.push('', file.text)
  })
}

writeFileSync(OUT, `${out.join('\n')}\n`)

const missing = sorted.filter((p) => !p.files.length).map((p) => `${p.name}@${p.version}`)
console.log(
  `licenses.txt: ${sorted.length} packages` +
    (missing.length ? `, ${missing.length} without a licence file (${missing.join(', ')})` : ''),
)
