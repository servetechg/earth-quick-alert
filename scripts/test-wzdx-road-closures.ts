/**
 * Smoke-test all configured WZDX DOT feeds.
 *
 * Usage:
 *   npx tsx scripts/test-wzdx-road-closures.ts
 *
 * Optional env (from Postman collection):
 *   FDOT_WZDX_APP_KEY, CDOT_WZDX_API_KEY, TXDOT_WZDX_API_KEY
 */
import 'dotenv/config'
import { boundsFromStateCode } from '../lib/gis/infrastructure-search-grid'
import { fetchWzdxClosures } from '../lib/gis/wzdx/wzdx-road-closures'
import { WZDX_STATE_FEEDS } from '../lib/gis/wzdx/wzdx-feed-config'

async function testFeed(feedId: string, stateCode: string) {
    const bounds = boundsFromStateCode(stateCode)
    if (!bounds) {
        console.log(`${feedId}: no bbox for ${stateCode}`)
        return
    }
    const closures = await fetchWzdxClosures({ mode: 'bounds', bounds })
    const prefix = `wzdx-${feedId}-`
    const fromFeed = closures.filter(
        (c) => c.id.startsWith(prefix) && !(feedId === 'TX' && c.id.startsWith('wzdx-TX-AUS-')),
    )
    const feed = WZDX_STATE_FEEDS.find((f) => f.feedId === feedId)
    console.log(
        `${feedId} / ${stateCode} (${feed?.label ?? 'n/a'}): ${fromFeed.length} segments` +
            (fromFeed[0] ? ` — sample: ${fromFeed[0].roadName} [${fromFeed[0].status}]` : ''),
    )
}

async function main() {
    for (const feed of WZDX_STATE_FEEDS) {
        await testFeed(feed.feedId, feed.stateCode)
    }
}

main().catch((err) => {
    console.error(err)
    process.exit(1)
})
