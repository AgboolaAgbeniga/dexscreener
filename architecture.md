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

## 4. Platform Extension Roadmap
1. **Automated Alert Bot**: Hook into `database.saveLegitToken` to dispatch instant Discord webhooks or Telegram bot signals whenever a new 95+ score token is verified.
2. **On-Chain Sandbox Simulation**: Fork EVM state via Hardhat/Anvil or Solana local validator to execute simulated buy-and-sell test transactions with slippage boundaries.
3. **Portfolio & Watchlist Sync**: Allow users to pin tokens, create alerts for liquidity drains or authority transfers, and track paper trading returns.

## 5. Error Envelope
All error responses adhere to a consistent contract:
```json
{
  "error": "Upstream DEXScreener service unavailable",
  "code": "UPSTREAM_TIMEOUT",
  "retryAfter": 15
}
```

