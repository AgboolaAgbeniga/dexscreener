# DEXScreener Top Gainers & Trap Inspector Architecture

## 1. Executive Summary
The DEXScreener Top Gainers & Trap Inspector Dashboard is a real-time web application engineered to monitor high-momentum cryptocurrency tokens across multiple blockchains (Solana, Base, Ethereum, BSC) and perform automated multi-vector fraud analysis. Each token is scored between 0 and 100 with clear risk badges (`SAFE`, `CAUTION`, `TRAP`) and granular inspection breakdown.

## 2. System Architecture Diagram

```
                 +-------------------------------------------------------+
                 |              Web Client (public/)                     |
                 |  - Glassmorphic Terminal UI (HTML5 / Vanilla CSS)     |
                 |  - EventSource (SSE) listener & Deep Scanner Modal    |
                 +---------------------------+---------------------------+
                                             |
                          HTTP / SSE (GET /api/stream)
                                             |
                                             v
                 +-------------------------------------------------------+
                 |              Express API Gateway (src/server.js)      |
                 |  - Rate Limiting, Error Envelope, CORS                |
                 |  - SSE Manager (Heartbeats, Client Subscriptions)    |
                 +---------------------------+---------------------------+
                                             |
                    +------------------------+------------------------+
                    |                                                 |
                    v                                                 v
   +---------------------------------+              +----------------------------------+
   |   DEXScreener Ingestion Engine  |              |    Multi-Chain Security Service  |
   |      (src/services/dexscreener) |              |       (src/services/security)    |
   | - Pairs & Boosts/Profiles Sync  |              | - Solana: RugCheck API           |
   | - 24h Momentum Sorting          |              | - EVM (Base/ETH/BSC): GoPlus API |
   | - AbortController Timeout (5s)  |              | - p-queue Rate-Limiting Engine   |
   +----------------+----------------+              +-----------------+----------------+
                    |                                                 |
                    +------------------------+------------------------+
                                             |
                                             v
                 +-------------------------------------------------------+
                 |              Inspector Scoring Core                   |
                 |             (src/services/inspector.js)               |
                 |  - Configurable Thresholds (src/config/thresholds.js) |
                 |  - Weight Distribution (0-100 Score & Badges)         |
                 |  - Granular Risk Flag Rule Engine                     |
                 +---------------------------+---------------------------+
                                             |
                                             v
                 +-------------------------------------------------------+
                 |             Unified Cache Layer (src/utils/cache.js)  |
                 |  - Default: In-Memory (node-cache, 30s TTL)           |
                 |  - Production Path: Redis (ioredis via CACHE_BACKEND) |
                 +-------------------------------------------------------+
```

## 3. Core Decisions & Rationale

### DEXScreener Polling & Data Normalization
- DEXScreener provides fast pair lookups and real-time volume/liquidity/priceChange metrics.
- Candidate tokens are ingested from multi-chain pair data and curated token pools, then filtered by the requested blockchain (`solana`, `base`, `ethereum`, `bsc`) and sorted descending by `priceChange.h24`.
- Requests enforce an `AbortController` timeout (5,000ms) to ensure unresponsive upstream endpoints never stall the SSE dispatch loop.

### Dual-Vector Security Engine
- **Solana**: Uses RugCheck API (`https://api.rugcheck.xyz`) for detecting mutable metadata, mint authority, freeze authority, LP lock status, and rug pull signatures.
- **EVM (Base, Ethereum, BSC)**: Uses GoPlus Security API (`https://api.gopluslabs.io/api/v1/token_security/{chain_id}`) to inspect honeypot mechanics, buy/sell taxes, blacklisting, mintable flags, and top holder wallet concentration.
- **Concurrency & Rate Limit Protection**: GoPlus enforces request quotas on free tiers. Requests are processed through a concurrency queue (`p-queue` style concurrency limiter) to prevent 429 throttling.

### Scoring Formula & Threshold Defaults
A clean token starts at 100 points. Penalties are deducted based on threat severity:
- **Honeypot Detected**: -30 points (Immediate high-risk alert)
- **Active Mint Authority**: -20 points (Owner can inflate supply at will)
- **Freeze Authority**: -15 points (Owner can freeze user balances)
- **Low Liquidity**: -15 points (Liquidity < $50,000 USD or Liq/FDV < 2%)
- **Excessive Taxes**: -10 points (Buy or sell tax > 10%)
- **Holder Concentration**: -10 points (Top 10 holders own > 40% of supply)
- **Suspicious Txn Dynamics**: -5 points (Sell/Buy transaction ratio > 3.0)

**Classification Badges**:
- `80 - 100`: **SAFE** (Green badge, verified liquidity & clean permissions)
- `50 - 79`: **CAUTION** (Yellow badge, elevated tax, moderate concentration, or low FDV ratio)
- `0 - 49`: **TRAP** (Red badge, honeypot, uncapped mint, or freeze capability)

### Live Updates: Server-Sent Events (SSE) vs Polling
- Traditional client-side `setInterval` polling increases duplicate HTTP round trips and header overhead.
- `/api/stream?chain={chain}` establishes an SSE channel. The backend refreshes data on a 30-second cadence, checks cache, and broadcasts structured delta updates with keep-alive comments (`:ping`).

### Caching Strategy & Redis Scale Path
- Default backend: In-memory `node-cache` with a 30-second TTL.
- Designed with an abstraction layer: setting `CACHE_BACKEND=redis` and `REDIS_URL` switches seamlessly to Redis for multi-instance horizontal scaling without modifying service logic.

### Persistence Layer (Prisma ORM & SQLite)
- **Engine**: SQLite database (`dev.db`) driven by `@prisma/client`.
- **Model (`LegitToken`)**: Stores verified top-performing tokens meeting the configured criteria (`SAFE` badge, Score ≥ 80, 24h Gain ≥ +5%, Liquidity ≥ $50,000 USD).
- **Auto-Save Pipeline**: Tokens inspected during live ingestion or on-demand scan are automatically upserted into SQLite without blocking the API response or SSE feed.
- **Query Endpoint**: `GET /api/legit` provides filtering by blockchain, minimum gain, minimum safety score, date range, pagination (`limit`, `offset`), and multiple sorting orders.

### Cohere Enterprise Design System Integration
- Styled using tokens extracted from `DESIGN-cohere.md` (`--cohere-black`, `--cohere-dark-navy`, `--cohere-action-blue`, `--cohere-coral`, `--cohere-primary`).
- Features dark-mode surface variants (`--cohere-canvas-dark`, `--cohere-surface-dark`, `--cohere-card-dark`, `--cohere-hairline-dark`) to preserve the high-contrast crypto terminal experience while adhering to Cohere's enterprise restraint.
- Full backward compatibility for `--status-safe`, `--status-caution`, and `--status-trap`.
- Features an interactive "Legit Vault" modal drawer with real-time counters, filtering, and deep-scan triggers.

### 3D Growth & Momentum Analysis Engine
- **Service (`src/services/growthAnalyzer.js`)**: Evaluates token opportunities across three institutional pillars codified in `rulebook.md`:
  1. **Legitimacy (Defense - 35%)**: Honeypot tests, revoked mint/freeze authorities, whale wallet decentralization.
  2. **Tradeable Momentum (Offense - 40%)**: Lifecycle sweet spot (20m–48h window), buyer dominance (65/35 rule), organic volume turnover ratio, and crowd transaction density.
  3. **Exitability (Survival - 25%)**: Absolute liquidity floor (≥$50,000 USD), liquidity-to-FDV cushion (≥10%), and live sell tape verification.
- **Grades & Execution Plan**: Generates composite grade (`A+`, `B+`, `C`, `D`), qualitative setup verdict, and mechanical profit-taking plan:
  - **Entry Price**: Captured at time of inspection.
  - **2x De-Risk Target (+100%)**: Sell 50% at 2x target to extract 100% of original capital.
  - **Invalidation Stop (-15%)**: Hard exit if price drops 15% from entry.
  - **45-Minute Time Stop**: Cut at market if price chops sideways without volume.

### Projection Watchlist Lab & Live PnL Validation
- **Model (`TrackedToken`)**: Persists tracked tokens in SQLite via Prisma. Stores entry price, live price, live PnL %, overall setup grade, 3D component scores, and milestone outcome status (`TRACKING`, `HIT_2X_DERISK`, `STOPPED_OUT`).
- **Real-Time PnL & Milestone Sync**: Background polling in `src/server.js` automatically queries live DEX prices for all tracked tokens, updates `pnlPercent`, and triggers status transitions (e.g. hitting 2x or stopping out).
- **Projection Lab Drawer**: Accessible via the navbar button (`#openWatchLabBtn`). Features a summary ribbon (Active Tracked count, 2x Target Win Rate %, Average PnL %), chain & milestone status filters, live PnL pills, and 1-click inspection.

## 4. Master Rulebook Reference
All trading strategies, checklists, and algorithmic scoring weights are codified in [rulebook.md](file:///c:/Users/emman/OneDrive/Documents/apps/dexscreener/rulebook.md).

## 5. Platform Extension Roadmap
1. **Automated Alert Bot**: Hook into `database.saveLegitToken` to dispatch instant Discord webhooks or Telegram bot signals whenever a new 95+ score token is verified.
2. **On-Chain Sandbox Simulation**: Fork EVM state via Hardhat/Anvil or Solana local validator to execute simulated buy-and-sell test transactions with slippage boundaries.
3. **Paper Trading Portfolio**: Expand the Projection Lab into an automated paper trading ledger with balance tracking and win/loss compounding analytics.

## 5. Error Envelope
All error responses adhere to a consistent contract:
```json
{
  "error": "Upstream DEXScreener service unavailable",
  "code": "UPSTREAM_TIMEOUT",
  "retryAfter": 15
}
```

