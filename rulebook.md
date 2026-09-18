# 📖 The DEXInspector Master Rulebook
### *Tactical On-Chain Trading Playbook, Heuristics, & Institutional Knowledge Base*

---

## 🧭 1. Core Philosophy: The Reality of 24-Hour DEX Trading

> **"Skilled traders on X who flip tokens inside 24 hours are not picking 'quality projects.' They are hunting short-lived attention + tradeable structure, then selling into the crowd. The edge is speed, filtering, and exits — not conviction."**

### Non-Negotiable Axioms
1. **Trade Structure, Not Stories**: On a 1–24 hour horizon, whitepapers, roadmaps, and promises are irrelevant. The only things that matter are **orderflow**, **attention**, **clean contracts**, and **exit liquidity**.
2. **The First Move Is the Only Move**: Most of the tradeable move happens in the first hours after launch, bonding curve graduation, or an organic narrative breakout. Holding past that window turns a profitable trader into exit liquidity.
3. **Defense Precedes Offense**: 95% of newly created tokens are predatory (honeypots, soft rugs, cabal bundles, wash trades). Surviving is a prerequisite to profitability.
4. **Never Buy Trending / Boosted Blindly**: Trending and Boosted tags on DEXScreener are paid advertisements, not endorsements of safety or momentum.

---

## 📐 2. The Three-Dimensional Evaluation Matrix

Every token must pass through three distinct evaluation filters before capital is deployed:

```
┌────────────────────────────────────────────────────────────────────────┐
│                      THE 3D EVALUATION MATRIX                          │
├────────────────────┬────────────────────┬──────────────────────────────┤
│ 1. LEGITIMACY (35%)│ 2. MOMENTUM (40%)  │ 3. EXITABILITY (25%)         │
│ (Will it steal?)   │ (Will it run?)     │ (Can I get out with profit?) │
├────────────────────┼────────────────────┼──────────────────────────────┤
│ • Honeypot checks  │ • 20m–48h age      │ • $30k–$50k min liquidity    │
│ • Mint/Freeze off  │ • 65%+ buy ratio   │ • Liq/FDV cushion ≥ 10%      │
│ • LP burned/locked │ • 1.5x–5x turnover │ • Active real sell tape      │
│ • Top 10 < 25%     │ • Higher lows      │ • Unlocked LP hard stop      │
└────────────────────┴────────────────────┴──────────────────────────────┘
```

### Dimension 1: Contract & Project Legitimacy (Defense)
- **Honeypot Simulation**: Verified on-chain buy and sell execution without variable tax traps or blacklist functions.
- **Authority Revocation**:
  - *Solana*: Both **Mint Authority** and **Freeze Authority** must be revoked (null address).
  - *EVM*: Ownership renounced or restricted; no unverified upgradeable proxy with open admin.
- **Liquidity Lock/Burn**: 100% of LP tokens burned (sent to dead address) or locked in recognized lockers (Streamflow, Unicrypt, Team.Finance).
- **Holder Distribution**: Top 10 non-LP/burn wallets must hold $<25\%$ of total supply. Any single wallet holding $>15\%$ is an immediate red flag.

### Dimension 2: Tradeable Momentum Setup (Offense)
- **The Sweet-Spot Window**:
  - *Avoid 0–5 Minutes*: Sniper-dominated zone with extreme slippage and MEV bot dumps.
  - *Target 20m–48h*: Post-sniper purge, initial dump absorbed, higher lows established.
- **Buyer Dominance (The 65/35 Rule)**:
  - Buyer count and volume must account for $\ge 65\%$ of transaction flow.
  - Presence of consistent medium-sized buys ($0.5–2 SOL$ / $200–$1,000) absorbing small panic sells ($0.05–0.2 SOL$).
- **Turnover Velocity**:
  - Healthy 24h Volume to Liquidity ratio is **$1.5\times$ to $5\times$**.
  - Relative Volume (RVOL) accelerating on 5m and 1h intervals.

### Dimension 3: Exitability (Can You Take Profit?)
- **Absolute Liquidity Floor**: Minimum **$30,000 to $50,000 USD** in the pool. Pools with $< \$10\text{k}$ liquidity suffer massive 30%+ slippage on modest exit sizes.
- **Liquidity-to-FDV Cushion**:
  $$\text{Liq / FDV Ratio} \ge 8\% - 15\%$$
  A $1M FDV token with only $15k liquidity is a fragile glass house—one medium sell triggers a death spiral.
- **Sell Tape Reality**: Real, unhindered sell orders must be actively crossing the block.

---

## ⚡ 3. The 2–5 Minute Institutional Due Diligence Checklist

When a token surfaces on the radar, run this mechanical checklist:

```
[ Step 1: DEXScreener Rapid Filter ] (30 seconds)
  ├── 1. Check exact mint address (reject lookalike tickers).
  ├── 2. Verify Liquidity ($30k+) and Volume/Liquidity Ratio (< 10x).
  └── 3. Check Buys vs Sells (is it ≥ 65% buys? Are there actual sells?).

[ Step 2: Automated Scanner Dual-Pass ] (30 seconds)
  ├── Solana: Open RugCheck.xyz ➔ Confirm Mint & Freeze revoked, LP burned.
  └── EVM: Open Honeypot.is + GoPlus ➔ Confirm real sell tax and no blacklist.

[ Step 3: Holder & Cluster Verification ] (45 seconds)
  ├── Solscan / Basescan ➔ Check top holder balances & deployer history.
  └── Bubblemaps ➔ Confirm no 10-wallet insider cluster funded from one source.

[ Step 4: Social & Narrative Confirmation ] (30 seconds)
  ├── Search ticker on X ➔ Are real humans talking, or only bots?
  └── TG / Narrative Check ➔ Does it align with today's hot meta (AI, meme, viral news)?
```

---

## 🎯 4. Mechanical Execution & Risk Management Rules

> **"Position sizing and exit discipline separate traders who screenshot PnL from traders who keep it."**

### 1. Position Sizing
- Never risk more than **0.5% to 2.0%** of your total portfolio on any single trade ticket.
- Assume any micro-cap token can go to zero in minutes.

### 2. The 2x De-Risk Ladder (The "Free Roll")
- **At +100% (2x)**: Sell exactly **50% of your position**.
  - *Result*: You have retrieved 100% of your original investment. Your downside on the trade is now **$0.00**.
- **At +200% to +400% (3x–5x)**: Sell another **25%**.
- **Remaining 25% (Moon Bag)**: Ride with a trailing stop-loss (e.g., exit if price drops below 15-minute EMA or breaks previous higher low).

### 3. Time Stops & Invalidation Rules
- **The 45-Minute Stalled Rule**: If you enter a momentum setup and the price chops sideways with fading volume for 45 minutes, **cut the trade at market**. Smart money has moved to the next token.
- **The -15% Hard Stop**: If price drops 15% below your entry support level, exit immediately. Never turn an intraday momentum scalp into an involuntary long-term hold.

---

## 🚨 5. Red-Flag & Trap Catalog

| Red Flag | Diagnostic Indicator | Action |
| :--- | :--- | :--- |
| **Wash Trading** | $\text{Vol}/\text{Liq} > 10\times$ (e.g. $2M Vol on $40k Liq) | **WALK AWAY**. Volume is faked by market-making bots. |
| **Zero-Sell Trap** | $>25$ buys with $0$ sells in transaction feed | **HARD STOP**. Classic honeypot or transfer-freeze. |
| **Sniper Poison** | Token age $< 5$ minutes with $+2,000\%$ green candle | **DO NOT BUY**. Early snipers are waiting for your exit liquidity. |
| **Insider Bundle** | Bubblemaps reveals 8 of top 10 wallets funded simultaneously | **WALK AWAY**. Coordinated dump incoming. |
| **Thin Liquidity Trap** | $\text{Liq} < \$15\text{k}$ with FDV $> \$300\text{k}$ | **DO NOT BUY**. High slippage; unable to exit cleanly. |
| **Active Mint Authority** | RugCheck / GoPlus indicates mint is active | **HARD STOP**. Owner can dilute pool to zero. |

---

## 🧪 6. The Projection Lab: Skill-Building & Continuous Learning

The **Projection Lab** tracks real-time trade simulations to validate whether our momentum analysis rules hold true over 24-hour cycles:

### Tracking Rules
1. **Entry Snapshot**: Record exact Entry Price, Time, Liquidity, and 3D Scores.
2. **Outcome Classification**:
   - **PASSED**: Token reaches the **2x De-Risk Target (+100%)** within the 24h window.
   - **FAILED**: Token hits the **-15% Invalidation Stop** or drops to zero.
   - **TRACKING**: Trade is active within the 24h observation period.
3. **Post-Trade Post-Mortem Log**:
   - *Why did a PASSED token succeed?* (e.g., strong narrative alignment, organic buyer accumulation, held floor).
   - *Why did a FAILED token dump?* (e.g., wash trading detected, insider bundle dumped, volume faded after 30m).

---

## 🔄 7. Rulebook Changelog & Evolution

*This living document is updated as new market dynamics, scam patterns, and alpha frameworks are discovered.*

- **v1.0.0 (Sep 2026)**: Initialized Master Rulebook with 3D Evaluation Matrix, Institutional 2-Minute Checklist, 2x De-Risk Ladder, and Wash-Trading Heuristics.
