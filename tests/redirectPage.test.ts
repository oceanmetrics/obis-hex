// the redirect page template (public/redirect/, 2026-10-23): its pure decide() with obis-hex's codec, the checksum that
// keeps erddap-places' and obis-hex's copies identical, and the shipped codec bundle driven through the page's own
// function. Not active: see docs/redirects.md "Activation".
import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'vite'
import { describe, expect, it } from 'vitest'
import { redirectFor } from '../src/lib/redirect'

interface Decision {
  redirect: boolean; reason: 'ok' | 'noredirect' | 'unreadable'; url: string; exact: boolean; note: string
  stay: string; delayMs: number; message: string
}
interface Config {
  app?: string; target?: string; stay?: string; delayMs?: number; home?: string
  codec: (link: string) => { url: string; exact?: boolean; note?: string }
}
const DIR = resolve(fileURLToPath(new URL('../public/redirect/', import.meta.url)))
const page = await import(pathToFileURL(join(DIR, 'redirect.js')).href) as {
  decide: (loc: { search?: string; hash?: string }, config: Config) => Decision
  DEFAULT_DELAY_MS: number
}
const { decide } = page
const CONFIG = JSON.parse(readFileSync(join(DIR, 'config.json'), 'utf8')) as Omit<Config, 'codec'>
const cfg: Config = { ...CONFIG, codec: (link) => redirectFor(link) }
const ATLAS = 'https://oceanmetrics.io/atlas/?c=obis_h3'
const HASH = '#i=es&l=eov:fish&p=1990&r=3&c=-20,5,1.4'
const WANT = `${ATLAS}&i=fish&dim.indicator=es&dim.period=1990s&res=3&map=-20,5,1.4&proj=globe`

describe('decide: the template\'s one decision', () => {
  it('asks the codec about the hash and redirects after the default 5 s', () => {
    const d = decide({ search: '', hash: HASH }, cfg)
    expect(d.url).toBe(WANT)
    expect(d).toMatchObject({ redirect: true, reason: 'ok', exact: true, note: '', delayMs: 5000 })
    expect(d.message).toBe('This app moved to the Ocean Metrics Atlas; taking you there…')
    expect(page.DEFAULT_DELAY_MS).toBe(5000)
  })
  it('?noredirect=1 keeps the page: same address shown, no navigation', () => {
    const d = decide({ search: '?noredirect=1', hash: HASH }, cfg)
    expect(d).toMatchObject({ redirect: false, reason: 'noredirect' })
    expect(d.url).toBe(WANT)
    expect(d.message).toContain('paused')
    // only the exact value 1 is the switch
    expect(decide({ search: '?noredirect=0', hash: HASH }, cfg).redirect).toBe(true)
    expect(decide({ search: '?xnoredirect=1', hash: HASH }, cfg).redirect).toBe(true)
  })
  it('the stay link is the app with its own link and the switch, so it does not forward again', () => {
    expect(decide({ search: '', hash: HASH }, cfg).stay).toBe('../?noredirect=1' + HASH)
    expect(decide({ search: '?theme=dark&noredirect=1', hash: '' }, cfg).stay).toBe('../?noredirect=1&theme=dark')
    expect(decide({ search: '', hash: '' }, { ...cfg, stay: '/obis-hex/' }).stay).toBe('/obis-hex/?noredirect=1')
  })
  it('hands the codec the query and hash without the page\'s own switch, the rest byte for byte', () => {
    const seen: string[] = []
    const spy: Config = { ...cfg, codec: (l) => (seen.push(l), { url: 'https://x.test/', exact: false }) }
    decide({ search: '?noredirect=1&legacy=_inputs_&a=%22b%22', hash: '#k=v' }, spy)
    decide({ search: '?noredirect=1', hash: '' }, spy)
    decide({ search: '', hash: '' }, spy)
    expect(seen).toEqual(['?legacy=_inputs_&a=%22b%22#k=v', '', ''])
  })
  it('carries the codec\'s inexact flag and note', () => {
    const d = decide({ search: '', hash: '#l=eov:fish&x=8928308280fffff' }, cfg)
    expect(d.exact).toBe(false)
    expect(d.note).toContain('hexagon')
  })
  it('a codec that throws or gives no http(s) address leaves the page in place (or goes to config.home)', () => {
    const boom: Config = { ...cfg, codec: () => { throw new Error('x') }, home: undefined }
    expect(decide({ search: '', hash: HASH }, boom)).toMatchObject({ redirect: false, reason: 'unreadable', url: '' })
    const bad: Config = { ...boom, codec: () => ({ url: 'javascript:alert(1)' }) }
    expect(decide({ search: '', hash: HASH }, bad)).toMatchObject({ redirect: false, reason: 'unreadable', url: '' })
    const home: Config = { ...boom, home: ATLAS }
    expect(decide({ search: '', hash: HASH }, home)).toMatchObject({ redirect: true, url: ATLAS, exact: false })
  })
  it('config.delayMs overrides the 5 s; a bad value falls back; junk locations never throw', () => {
    expect(decide({ search: '', hash: HASH }, { ...cfg, delayMs: 0 }).delayMs).toBe(0)
    expect(decide({ search: '', hash: HASH }, { ...cfg, delayMs: -3 }).delayMs).toBe(5000)
    expect(() => decide({}, cfg)).not.toThrow()
    expect(() => decide(undefined as never, cfg)).not.toThrow()
  })
  it('an empty link is still carried to the atlas on the default view, not dropped', () => {
    const d = decide({ search: '', hash: '' }, cfg)
    expect(d.redirect).toBe(true)
    expect(d.url).toBe(`${ATLAS}&i=all&dim.indicator=es&dim.period=all&res=auto&map=-103.7,33.2,2.57&proj=globe`)
  })
  it('a Shiny bookmark (?legacy=) is read by the codec; the page\'s switch after it is stripped, not swallowed', () => {
    const d = decide({ search: '?legacy=_inputs_&preset=%22Fish%22&indicator=%22shannon%22&noredirect=1', hash: '' }, cfg)
    expect(d).toMatchObject({ redirect: false, reason: 'noredirect' })
    expect(d.url).toBe(`${ATLAS}&i=fish&dim.indicator=shannon&dim.period=all&res=auto&map=-103.7,33.2,2.57&proj=globe`)
    expect(d.stay).toBe('../?noredirect=1&legacy=_inputs_&preset=%22Fish%22&indicator=%22shannon%22')
  })
})

describe('the template files', () => {
  const html = readFileSync(join(DIR, 'redirect.html'), 'utf8')
  const js = readFileSync(join(DIR, 'redirect.js'), 'utf8')

  it('config.json names the app, the target and the codec', () => {
    expect(CONFIG).toMatchObject({ app: 'OBIS hex', target: 'the Ocean Metrics Atlas', codec: './codec.js' })
  })
  it('every element id the script writes exists in the page, and the page loads the script', () => {
    for (const id of new Set([...js.matchAll(/\$\('([a-z]+)'\)/g)].map((m) => m[1]))) expect(html, id).toContain(`id="${id}"`)
    expect(html).toContain('src="./redirect.js"')
  })

  // the template is ONE file in two repos. The pin below is the same in erddap-places' and obis-hex's tests; a change to
  // either copy fails the pin, and changing the pin in one repo without the other fails the sibling comparison.
  const PIN = '124dc8bbd4a1127fc0896de7e2affa5c80ae152790a1799977f248840e089fd5'
  const sha = (...fs: string[]) => createHash('sha256').update(fs.map((f) => readFileSync(f)).reduce((a, b) => Buffer.concat([a, b]))).digest('hex')
  it('redirect.html + redirect.js are the pinned template (identical in erddap-places and obis-hex)', () => {
    expect(sha(join(DIR, 'redirect.html'), join(DIR, 'redirect.js'))).toBe(PIN)
  })
  it('and equal the sibling checkout\'s copy when one is next to this repo', () => {
    const other = resolve(DIR, '../../../erddap-places/app/static/redirect')
    if (!existsSync(join(other, 'redirect.js'))) return
    for (const f of ['redirect.html', 'redirect.js']) expect(readFileSync(join(other, f), 'utf8'), f).toBe(readFileSync(join(DIR, f), 'utf8'))
  })
})

describe('the shipped codec bundle (what vite.config.ts writes to dist/redirect/codec.js)', () => {
  it('builds, exports redirectFor, and drives decide() to the same answer as the source', async () => {
    const out = mkdtempSync(join(tmpdir(), 'redirect-codec-'))
    try {
      await build({
        configFile: false, logLevel: 'silent', publicDir: false,
        build: { target: 'es2022', emptyOutDir: false, outDir: out,
          lib: { entry: fileURLToPath(new URL('../src/lib/redirect.ts', import.meta.url)), formats: ['es'], fileName: () => 'codec.js' } },
      })
      const mod = await import(pathToFileURL(join(out, 'codec.js')).href) as { redirectFor: Config['codec'] }
      expect(typeof mod.redirectFor).toBe('function')
      const loc = { search: '?noredirect=1&tour=off', hash: HASH + '&pl=NMS:CINMS' }
      const shipped = decide(loc, { ...cfg, codec: mod.redirectFor })
      expect(shipped).toEqual(decide(loc, cfg))
      expect(shipped.url).toBe(`${WANT}&tour=off#pl=p.NMS%253ACINMS.`)
    } finally { rmSync(out, { recursive: true, force: true }) }
  })
})
