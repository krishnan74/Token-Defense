# Client Troubleshooting

## `assert { type: 'json' }` breaks with React plugin

**Error:** Vite pre-transform error on any file importing JSON with the old assert syntax.

**Cause:** `@vitejs/plugin-react` uses Babel 7.29+ which dropped `assert` in favour of `with`.

**Fix:** Replace in all JSON imports (`src/main.jsx`, `src/controller.js`):
```js
// before
import manifest from '...' assert { type: 'json' };
// after
import manifest from '...' with { type: 'json' };
```

## `Failed to parse chainId` / Controller chain-ID probe error

**Error:** Browser console shows `Failed to connect to http://localhost:5050/: Failed to get chain ID: 0` even when Katana is running.

**Cause (1):** `new Controller(controllerOpts)` was called at module load time, so the Cartridge Controller probes Katana for the chain ID immediately — before the user has clicked anything. If Katana isn't fully ready, or the probe fires too early, it fails and logs the error.

**Fix:** Instantiate the Controller lazily inside the connect handler (`src/main.jsx`):
```js
let controller = null;
async function connect() {
  if (!controller) controller = new Controller(controllerOpts);
  const acct = await controller.connect();
}
```

**Cause (2):** Chrome on macOS sometimes resolves `localhost` to IPv6 (`::1`), but Katana binds only to IPv4 (`127.0.0.1`), causing a silent connection failure (status 0).

**Fix:** Use the explicit IP in all local URLs (`src/controller.js`, `src/hooks/useGameState.js`):
```js
// before
chains: [{ rpcUrl: 'http://localhost:5050' }]
// after
chains: [{ rpcUrl: 'http://127.0.0.1:5050' }]
```

## `Access to fetch blocked by CORS policy: Permission denied for loopback address`

**Error:** `Access to fetch at 'http://127.0.0.1:5050/' from origin 'https://x.cartridge.gg' has been blocked by CORS policy: Permission was denied for this request to access the loopback address space.`

**Cause:** Chrome's **Private Network Access (PNA)** policy blocks requests from public HTTPS origins (like `x.cartridge.gg`) to loopback addresses (`127.0.0.1`, `localhost`). The Cartridge Controller WASM module runs inside an iframe hosted on `x.cartridge.gg` and makes RPC calls directly to Katana. Chrome requires the server to respond with `Access-Control-Allow-Private-Network: true` — Katana does not return this header.

**Fix:** Add a Vite proxy for `/rpc` → Katana, and a custom middleware plugin that handles the OPTIONS preflight directly — returning the PNA header before Vite's own CORS handling can intercept it (`vite.config.js`):

```js
plugins: [
  // ... react, mkcert, wasm ...
  {
    name: 'private-network-access-preflight',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.method === 'OPTIONS' && req.url?.startsWith('/rpc')) {
          res.writeHead(200, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Private-Network': 'true',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
          });
          res.end();
          return;
        }
        next();
      });
    },
  },
],
server: {
  proxy: {
    '/rpc': {
      target: 'http://127.0.0.1:5050',
      changeOrigin: true,
      rewrite: (path) => path.replace(/^\/rpc/, ''),
    },
  },v
},
```

Then point the controller at the proxy instead of Katana directly (`src/controller.js`):
```js
chains: [{ rpcUrl: 'https://localhost:5173/rpc' }]
```

**Why the middleware is needed:** The `proxyRes` hook on the proxy fires after Vite's built-in CORS handling already processed OPTIONS — too late. The custom `configureServer` middleware runs first, intercepts OPTIONS for `/rpc`, and responds with 200 + PNA headers before Vite touches it. Actual POST requests pass through to the proxy and hit Katana normally.

## `Blocked a frame with origin "https://x.cartridge.gg"` (cross-origin)

**Not a bug.** The Cartridge Controller opens an iframe at `x.cartridge.gg` which communicates back via `postMessage`. The browser logs a cross-origin frame-access warning, but `postMessage` works fine across origins. No fix needed.

## `commitWaveResult failed: Error: Not connected`

**Error:** `Error: Not connected at call (useActions.js:5:44)` — appears after the wave ends.

**Cause:** Stale closure. `runLoop` is memoized with `useCallback(fn, [])`, so it captures `endWave` → `actions` → `account` from the **first render** when `account` is still `null`. Even after the user connects, the rAF loop holds the old null account reference.

**Fix:** Use a `useRef` in `useActions.js` that stays current across renders:
```js
import { useRef } from 'react';

export function useActions(account, manifest) {
  const accountRef = useRef(account);
  accountRef.current = account;  // updated every render

  async function call(entrypoint, calldata = []) {
    if (!accountRef.current || !actionsAddress) throw new Error('Not connected');
    const tx = await accountRef.current.execute({ ... });
    return tx;
  }
}
```
`accountRef.current` always reads the latest account even from stale closures.

## No enemies spawning / wave ends instantly

**Symptom:** Clicking "Start Wave" shows no enemies; wave completes immediately; only gold updates.

**Cause 1:** `subscribeEntityQuery` returns `[initialEntities, subscription]` — the first element is the initial snapshot of existing on-chain entities. The original code discarded it with `[, sub]`, so towers placed in previous sessions (or before the subscription fired) were never loaded into React state. `towers = []` → `anyTowerAlive = false` in the wave simulator → wave ends on the very first frame.

**Fix:** Use the initial snapshot:
```js
const [initialEntities, sub] = await torii.subscribeEntityQuery({ query, callback });
if (initialEntities?.length) handleEntities(initialEntities);
subscription = sub;
```

**Cause 2:** Wave termination condition `!anyAlive || !anyTowerAlive` ended the wave the moment all towers died — before enemies could be rendered.

**Fix:** Change to end only when all enemies are cleared:
```js
// WaveSimulator.js step()
const anyAlive = this.enemies.some((e) => e.alive);
if (!anyAlive) {
  this.goldEarned += GOLD_PER_WAVE(this.waveNumber);
  this.done = true;
}
```

## Token values always 0 in ResourceBar

**Symptom:** Input/Image/Code token counts stay at 0 across all waves even after placing factories.

**Cause:** The contract never wrote to `input_tokens`, `image_tokens`, `code_tokens` in `GameState`. These fields were initialized to 0 in `new_game()` and never updated.

**Fix:** Two parts — see Contract Troubleshooting for the Cairo side. On the client:
- `WaveSimulator.getResult()` now returns `tokensConsumed = { input_tokens, image_tokens, code_tokens }` (= `maxTokens - remaining` after simulation)
- `useActions.commitWaveResult` passes 3 additional calldata values: `inputConsumed, imageConsumed, codeConsumed`
- `endWave()` in `App.jsx` extracts `tokensConsumed` from the result and passes it through

## 10-second UI delay when placing towers or factories

**Symptom:** Clicking a cell to place a tower/factory takes ~10 seconds before the board updates.

**Cause:** Sepolia transaction confirmation latency. The original `handleCellClick` awaited the tx before updating state.

**Fix:** Optimistic updates in `App.jsx`. The tower/factory appears immediately; the tx fires in the background; if it fails the optimistic item is reverted:
```js
// Tower placement (free, so always safe to show)
const tempId = `opt-${Date.now()}`;
setOptimisticTowers((prev) => [...prev, { tower_id: tempId, tower_type: selectedBuild.id, x: col, y: row, ... }]);
actions.placeTower(selectedBuild.id, col, row).catch((e) => {
  setOptimisticTowers((prev) => prev.filter((t) => t.tower_id !== tempId));
});

// Factory placement (also deduct gold optimistically)
setOptimisticGoldSpent((prev) => prev + def.cost);
// ... revert both on failure
```
Optimistic state is cleared automatically when Torii confirms (via `useEffect` watching `towers.length`, `factories.length`, `gameState.gold`).
