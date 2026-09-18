/**
 * DEXINSPECTOR - Client Application Controller
 * Manages Server-Sent Events (SSE), chain switching, table filtering,
 * metrics computing, and deep-scan drawer telemetry.
 */

// Application State
const state = {
  chain: 'solana',
  filter: 'all',
  minGain: 0,
  tokens: [],
  sseSource: null,
  reconnectTimer: null,
  retryCountdown: 10,
  
  // Legit Vault State
  legitTokens: [],
  legitChain: 'all',
  legitSort: 'priceChange24h',
  legitCount: 0,

  // 3D Analysis & Projection Lab State
  currentTokenForAnalysis: null,
  currentAnalysis: null,
  watchTokens: [],
  watchChain: 'all',
  watchStatus: 'all',
  watchCount: 0,

  // Real-time price tracking cache
  priceCache: new Map()
};

// DOM Elements
const elements = {
  sseBadge: document.getElementById('sseBadge'),
  sseLabel: document.getElementById('sseLabel'),
  manualRefreshBtn: document.getElementById('manualRefreshBtn'),
  chainTabs: document.getElementById('chainTabs'),
  filterPills: document.getElementById('filterPills'),
  minGainSelect: document.getElementById('minGainSelect'),
  gainersTableBody: document.getElementById('gainersTableBody'),
  emptyState: document.getElementById('emptyState'),
  errorBanner: document.getElementById('errorBanner'),
  errorMessage: document.getElementById('errorMessage'),
  errorCountdown: document.getElementById('errorCountdown'),
  
  // Metrics
  metricTotal: document.getElementById('metricTotal'),
  metricSafe: document.getElementById('metricSafe'),
  metricTraps: document.getElementById('metricTraps'),
  metricAvgGain: document.getElementById('metricAvgGain'),

  // Quick Scan
  quickScanForm: document.getElementById('quickScanForm'),
  scanAddressInput: document.getElementById('scanAddressInput'),
  scanSubmitBtn: document.getElementById('scanSubmitBtn'),
  scanBtnSpinner: document.getElementById('scanBtnSpinner'),

  // Modal
  inspectModalOverlay: document.getElementById('inspectModalOverlay'),
  mCloseBtn: document.getElementById('mCloseBtn'),
  mTokenSymbol: document.getElementById('mTokenSymbol'),
  mTokenName: document.getElementById('mTokenName'),
  mChainBadge: document.getElementById('mChainBadge'),
  mTokenAddress: document.getElementById('mTokenAddress'),
  mScoreValue: document.getElementById('mScoreValue'),
  mScoreCircle: document.getElementById('mScoreCircle'),
  mBadgeLarge: document.getElementById('mBadgeLarge'),
  mVerdictTitle: document.getElementById('mVerdictTitle'),
  mVerdictDesc: document.getElementById('mVerdictDesc'),
  mPriceUsd: document.getElementById('mPriceUsd'),
  mGain24: document.getElementById('mGain24'),
  mLiquidity: document.getElementById('mLiquidity'),
  mFdv: document.getElementById('mFdv'),
  mVolume: document.getElementById('mVolume'),
  mTxns: document.getElementById('mTxns'),
  mLaunchedAt: document.getElementById('mLaunchedAt'),
  mSurgeFromCreation: document.getElementById('mSurgeFromCreation'),
  mTurnover: document.getElementById('mTurnover'),
  mChecklistContainer: document.getElementById('mChecklistContainer'),
  mBreakdownTableBody: document.getElementById('mBreakdownTableBody'),
  mCrossCheckDock: document.getElementById('mCrossCheckDock'),
  mDexLink: document.getElementById('mDexLink'),
  mCopyAddrBtn: document.getElementById('mCopyAddrBtn'),
  mAnalyzeGrowthBtn: document.getElementById('mAnalyzeGrowthBtn'),

  // Legit Vault Elements
  openLegitModalBtn: document.getElementById('openLegitModalBtn'),
  navLegitBadge: document.getElementById('navLegitBadge'),
  metricCardLegit: document.getElementById('metricCardLegit'),
  metricLegitCount: document.getElementById('metricLegitCount'),
  legitModalOverlay: document.getElementById('legitModalOverlay'),
  legitCloseBtn: document.getElementById('legitCloseBtn'),
  legitChainFilter: document.getElementById('legitChainFilter'),
  legitSortFilter: document.getElementById('legitSortFilter'),
  legitRefreshBtn: document.getElementById('legitRefreshBtn'),
  legitTableBody: document.getElementById('legitTableBody'),
  legitEmptyState: document.getElementById('legitEmptyState'),

  // 3D Analysis Modal Elements
  analysisModalOverlay: document.getElementById('analysisModalOverlay'),
  anaCloseBtn: document.getElementById('anaCloseBtn'),
  anaTokenSymbol: document.getElementById('anaTokenSymbol'),
  anaTokenName: document.getElementById('anaTokenName'),
  anaChainBadge: document.getElementById('anaChainBadge'),
  anaTokenAddress: document.getElementById('anaTokenAddress'),
  anaGradeBanner: document.getElementById('anaGradeBanner'),
  anaGradeBadge: document.getElementById('anaGradeBadge'),
  anaVerdictHeadline: document.getElementById('anaVerdictHeadline'),
  anaVerdictSummary: document.getElementById('anaVerdictSummary'),
  anaLegScore: document.getElementById('anaLegScore'),
  anaMomScore: document.getElementById('anaMomScore'),
  anaExitScore: document.getElementById('anaExitScore'),
  anaPlanEntry: document.getElementById('anaPlanEntry'),
  anaPlan2x: document.getElementById('anaPlan2x'),
  anaPlanStop: document.getElementById('anaPlanStop'),
  anaPillarBreakdown: document.getElementById('anaPillarBreakdown'),
  anaTrackBtn: document.getElementById('anaTrackBtn'),

  // Projection Lab Elements
  openWatchLabBtn: document.getElementById('openWatchLabBtn'),
  navWatchBadge: document.getElementById('navWatchBadge'),
  watchLabModalOverlay: document.getElementById('watchLabModalOverlay'),
  watchLabCloseBtn: document.getElementById('watchLabCloseBtn'),
  labTotalTracked: document.getElementById('labTotalTracked'),
  labWinRate: document.getElementById('labWinRate'),
  labAvgPnl: document.getElementById('labAvgPnl'),
  watchChainFilter: document.getElementById('watchChainFilter'),
  watchStatusFilter: document.getElementById('watchStatusFilter'),
  watchRefreshBtn: document.getElementById('watchRefreshBtn'),
  watchLabTableBody: document.getElementById('watchLabTableBody'),
  watchLabEmptyState: document.getElementById('watchLabEmptyState')
};

// ==========================================================================
// Initialization
// ==========================================================================
document.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();
  renderSkeletons(8);
  connectSSE(state.chain);
  fetchLegitTokens();
  fetchWatchTokens();
});

// ==========================================================================
// SSE Stream Management
// ==========================================================================
function connectSSE(chain) {
  if (state.sseSource) {
    state.sseSource.close();
    state.sseSource = null;
  }

  setSSEStatus('connecting', 'CONNECTING...');
  hideErrorBanner();

  const url = `/api/stream?chain=${encodeURIComponent(chain)}`;
  const source = new EventSource(url);
  state.sseSource = source;

  source.addEventListener('connected', () => {
    setSSEStatus('safe', 'LIVE FEED');
  });

  source.addEventListener('snapshot', (e) => {
    try {
      const data = JSON.parse(e.data);
      if (data.tokens) {
        state.tokens = data.tokens;
        updateMetrics(state.tokens);
        renderTable();
        // Update legit vault count on fresh data arrival
        fetchLegitTokens(false);
      }
    } catch (err) {
      console.error('Snapshot parsing error:', err);
    }
  });

  source.addEventListener('gainers_update', (e) => {
    try {
      const data = JSON.parse(e.data);
      if (data.tokens) {
        state.tokens = data.tokens;
        updateMetrics(state.tokens);
        renderTable();
        fetchLegitTokens(false);
      }
    } catch (err) {
      console.error('Update parsing error:', err);
    }
  });

  source.addEventListener('stream_error', (e) => {
    try {
      const err = JSON.parse(e.data);
      showErrorBanner(err.error || 'Upstream stream encountered an error.');
    } catch {}
  });

  source.onerror = () => {
    setSSEStatus('error', 'DISCONNECTED');
    source.close();
    state.sseSource = null;
    startReconnectTimer();
  };
}

function setSSEStatus(type, label) {
  elements.sseBadge.className = `sse-status-badge ${type}`;
  elements.sseLabel.textContent = label;
}

function flashLiveBadge() {
  elements.sseBadge.style.transform = 'scale(1.08)';
  setTimeout(() => {
    elements.sseBadge.style.transform = 'scale(1)';
  }, 300);
}

function startReconnectTimer() {
  state.retryCountdown = 10;
  showErrorBanner('Stream connection lost. Re-establishing link...');

  if (state.reconnectTimer) clearInterval(state.reconnectTimer);
  state.reconnectTimer = setInterval(() => {
    state.retryCountdown--;
    if (elements.errorCountdown) {
      elements.errorCountdown.textContent = `Retrying in ${state.retryCountdown}s...`;
    }
    if (state.retryCountdown <= 0) {
      clearInterval(state.reconnectTimer);
      connectSSE(state.chain);
    }
  }, 1000);
}

function showErrorBanner(msg) {
  elements.errorMessage.textContent = msg;
  elements.errorBanner.classList.remove('hidden');
}

function hideErrorBanner() {
  elements.errorBanner.classList.add('hidden');
  if (state.reconnectTimer) {
    clearInterval(state.reconnectTimer);
    state.reconnectTimer = null;
  }
}

// ==========================================================================
// UI Rendering & Data Processing
// ==========================================================================
function updateUI() {
  updateMetrics(state.tokens);
  renderTable();
}

function updateMetrics(tokens) {
  if (!tokens || tokens.length === 0) {
    elements.metricTotal.textContent = '0';
    elements.metricSafe.textContent = '0';
    elements.metricTraps.textContent = '0';
    elements.metricAvgGain.textContent = '0%';
    return;
  }

  const total = tokens.length;
  const safeCount = tokens.filter((t) => (t.security?.score || 0) >= 80).length;
  const trapCount = tokens.filter((t) => (t.security?.score || 0) < 50).length;
  
  const topGain = Math.max(...tokens.map((t) => t.priceChange24h || 0), 0);

  elements.metricTotal.textContent = total;
  elements.metricSafe.textContent = `${safeCount} (${Math.round((safeCount / total) * 100)}%)`;
  elements.metricTraps.textContent = `${trapCount} (${Math.round((trapCount / total) * 100)}%)`;
  elements.metricAvgGain.textContent = `+${formatNumber(topGain)}%`;
}

function renderTable() {
  const filtered = filterTokens(state.tokens);

  if (filtered.length === 0) {
    elements.gainersTableBody.innerHTML = '';
    elements.emptyState.classList.remove('hidden');
    return;
  }

  elements.emptyState.classList.add('hidden');
  elements.gainersTableBody.innerHTML = filtered.map((token) => createTableRow(token)).join('');
  attachRowEventListeners();
}

function filterTokens(tokens) {
  return tokens.filter((t) => {
    const score = t.security?.score ?? 50;
    const gain = t.priceChange24h || 0;

    if (gain < state.minGain) return false;

    if (state.filter === 'safe') return score >= 80;
    if (state.filter === 'caution') return score >= 50 && score < 80;
    if (state.filter === 'trap') return score < 50;
    return true;
  });
}

function createTableRow(token) {
  const sec = token.security || {};
  const score = sec.score ?? 50;
  const badge = sec.badge || 'CAUTION';
  
  let scoreClass = 'score-caution';
  let badgeClass = 'badge-caution';
  if (score >= 80) {
    scoreClass = 'score-safe';
    badgeClass = 'badge-safe';
  } else if (score < 50) {
    scoreClass = 'score-trap';
    badgeClass = 'badge-trap';
  }

  const gain = token.priceChange24h || 0;
  const gainClass = gain >= 0 ? 'gain-pill' : 'gain-pill negative';
  const gainSign = gain >= 0 ? '+' : '';

  // Real-time price change detection for tick flash
  const addr = token.baseToken?.address || token.pairAddress || '';
  const currentPrice = parseFloat(token.priceUsd) || 0;
  let flashClass = '';
  if (addr && state.priceCache.has(addr)) {
    const prev = state.priceCache.get(addr);
    if (currentPrice > prev) {
      flashClass = 'price-flash-up';
    } else if (currentPrice < prev) {
      flashClass = 'price-flash-down';
    }
  }
  if (addr && currentPrice > 0) {
    state.priceCache.set(addr, currentPrice);
  }

  // Volume Pressure Bar calculations
  const buys = token.txns24h?.buys || 0;
  const sells = token.txns24h?.sells || 0;
  const totalTxns = buys + sells;
  const buyPct = totalTxns > 0 ? Math.round((buys / totalTxns) * 100) : 50;
  const sellPct = totalTxns > 0 ? (100 - buyPct) : 50;

  const liqWarning = (token.liquidityUsd < 50000) ? `<span class="liq-warn">&lt;$50k floor</span>` : '';

  const shortAddr = formatAddress(token.baseToken?.address || token.pairAddress);

  // Inception & Launch telemetry
  const ageFormatted = token.launch?.ageFormatted;
  const estMultiplier = token.launch?.estMultiplier;
  const estGain = token.launch?.estGainFromCreation;
  const isMegaSurge = (parseFloat(estMultiplier) || 0) >= 10;

  const launchMarkup = (ageFormatted || estMultiplier) ? `
    <div class="token-launch-row">
      ${ageFormatted ? `
        <span class="token-age-badge" title="Pair created on DEX: ${ageFormatted}">
          <svg viewBox="0 0 24 24" width="9" height="9" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
          ${ageFormatted}
        </span>
      ` : ''}
      ${estMultiplier ? `
        <span class="token-surge-pill ${isMegaSurge ? 'mega-surge' : ''}" title="Estimated surge from inception: +${estGain ? estGain.toLocaleString() : 0}% (${estMultiplier})">
          ⚡ ${estMultiplier} from launch
        </span>
      ` : ''}
    </div>
  ` : '';

  // Turnover ratio & wash trading detector
  const turnoverRatio = token.turnover?.ratio || 0;
  const isWash = token.turnover?.isWashRisk;
  const turnoverMarkup = turnoverRatio > 0 ? `
    <span class="turnover-pill ${isWash ? 'wash-risk' : 'normal'}" title="${isWash ? 'WARNING: 24h Volume is ' + turnoverRatio + 'x liquidity! High likelihood of coordinated wash-trading.' : 'Turnover: 24h Volume / Liquidity'}">
      ${isWash ? `⚠️ ${turnoverRatio}x Wash Risk` : `${turnoverRatio}x vol/liq`}
    </span>
  ` : '';

  // Zero-sell honeypot heuristic alert
  const isZeroSell = token.heuristics?.isZeroSellTrap;
  const zeroSellMarkup = isZeroSell ? `
    <span class="zero-sell-alert" title="EXTREME RISK: Zero sells recorded despite ${buys} buys. Classic honeypot signature!">
      🚨 0 Sells Trap
    </span>
  ` : '';

  return `
    <tr data-token-addr="${escapeHtml(token.baseToken?.address || '')}">
      <td>
        <div class="td-token-cell">
          <span class="token-dex-badge">${escapeHtml(token.dexId || 'dex')}</span>
          <div class="token-meta">
            <div class="token-symbol-row">
              <span class="token-symbol">${escapeHtml(token.baseToken?.symbol || 'UNKNOWN')}</span>
              <span class="token-pair-quote">/${escapeHtml(token.quoteToken?.symbol || 'USD')}</span>
            </div>
            <div class="token-name-row">
              <span title="${escapeHtml(token.baseToken?.name || '')}">${escapeHtml(token.baseToken?.name || '')}</span>
              <button class="copy-mini-btn" data-copy="${escapeHtml(token.baseToken?.address || '')}" title="Copy Address">
                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                </svg>
              </button>
            </div>
            ${launchMarkup}
          </div>
        </div>
      </td>
      <td class="th-num">
        <span class="mono-val ${flashClass}">$${token.priceUsd}</span>
      </td>
      <td class="th-num">
        <span class="${gainClass}">${gainSign}${gain.toFixed(2)}%</span>
      </td>
      <td class="th-num">
        <span class="mono-val">$${formatCompact(token.volume24h)}</span>
        ${turnoverMarkup}
      </td>
      <td class="th-num">
        <span class="mono-val">$${formatCompact(token.liquidityUsd)}</span>
        ${liqWarning}
      </td>
      <td class="th-num">
        <div class="pressure-wrap" title="24h Txns: ${buys.toLocaleString()} Buys (${buyPct}%) / ${sells.toLocaleString()} Sells (${sellPct}%)">
          <div class="pressure-meta">
            <span class="pressure-buy">${formatCompact(buys)}</span>
            <span class="pressure-ratio">${buyPct}% B</span>
            <span class="pressure-sell">${formatCompact(sells)}</span>
          </div>
          <div class="pressure-bar">
            <div class="pressure-fill-buy" style="width: ${buyPct}%"></div>
            <div class="pressure-fill-sell" style="width: ${sellPct}%"></div>
          </div>
        </div>
        ${zeroSellMarkup}
      </td>
      <td class="th-score">
        <div class="score-cell-wrap">
          <span class="score-num ${scoreClass}">${score}</span>
          <div class="score-mini-bar">
            <div class="score-fill ${scoreClass}" style="width: ${score}%"></div>
          </div>
        </div>
      </td>
      <td class="th-badge">
        <span class="badge-pill ${badgeClass}">
          <span class="badge-dot"></span>
          <span>${badge}</span>
        </span>
      </td>
      <td class="th-action">
        <button class="btn-inspect" data-inspect-addr="${escapeHtml(token.baseToken?.address || '')}">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
          <span>Inspect</span>
        </button>
      </td>
    </tr>
  `;
}

function renderSkeletons(count = 6) {
  const rows = [];
  for (let i = 0; i < count; i++) {
    rows.push(`
      <tr class="skeleton-row">
        <td><div class="skeleton-shimmer" style="width: 140px;"></div></td>
        <td><div class="skeleton-shimmer" style="width: 70px; margin-left: auto;"></div></td>
        <td><div class="skeleton-shimmer" style="width: 65px; margin-left: auto;"></div></td>
        <td><div class="skeleton-shimmer" style="width: 80px; margin-left: auto;"></div></td>
        <td><div class="skeleton-shimmer" style="width: 75px; margin-left: auto;"></div></td>
        <td><div class="skeleton-shimmer" style="width: 80px; margin-left: auto;"></div></td>
        <td><div class="skeleton-shimmer" style="width: 90px; margin: 0 auto;"></div></td>
        <td><div class="skeleton-shimmer" style="width: 60px; margin: 0 auto;"></div></td>
        <td><div class="skeleton-shimmer" style="width: 75px; margin: 0 auto;"></div></td>
      </tr>
    `);
  }
  elements.gainersTableBody.innerHTML = rows.join('');
}

// ==========================================================================
// Event Listeners & Interaction Handlers
// ==========================================================================
function setupEventListeners() {
  // Chain switching tabs
  elements.chainTabs.addEventListener('click', (e) => {
    const tab = e.target.closest('.chain-tab');
    if (!tab) return;
    const selectedChain = tab.dataset.chain;
    if (selectedChain === state.chain) return;

    document.querySelectorAll('.chain-tab').forEach((t) => t.classList.remove('active'));
    tab.classList.add('active');

    state.chain = selectedChain;
    state.tokens = [];
    state.priceCache.clear();
    renderSkeletons(6);
    connectSSE(state.chain);
  });

  // Filter Pills (All / Safe / Caution / Trap)
  elements.filterPills.addEventListener('click', (e) => {
    const pill = e.target.closest('.filter-pill');
    if (!pill) return;
    document.querySelectorAll('.filter-pill').forEach((p) => p.classList.remove('active'));
    pill.classList.add('active');
    state.filter = pill.dataset.filter;
    renderTable();
  });

  // Min Gain selector
  elements.minGainSelect.addEventListener('change', (e) => {
    state.minGain = parseFloat(e.target.value) || 0;
    renderTable();
  });

  // Manual Refresh
  elements.manualRefreshBtn.addEventListener('click', () => {
    state.priceCache.clear();
    renderSkeletons(4);
    connectSSE(state.chain);
  });

  // Quick Address Deep Scan Form
  elements.quickScanForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const addr = elements.scanAddressInput.value.trim();
    if (!addr) return;

    elements.scanBtnSpinner.style.display = 'block';
    elements.scanSubmitBtn.disabled = true;

    try {
      const res = await fetch(`/api/scan?chain=${encodeURIComponent(state.chain)}&address=${encodeURIComponent(addr)}`);
      const data = await res.json();

      if (!res.ok || !data.success) {
        alert(data.error || 'Token address not found on current chain.');
        return;
      }

      openInspectModal(data.token);
    } catch (err) {
      alert(`Scan failed: ${err.message}`);
    } finally {
      elements.scanBtnSpinner.style.display = 'none';
      elements.scanSubmitBtn.disabled = false;
    }
  });

  // Modal Close
  elements.mCloseBtn.addEventListener('click', closeInspectModal);
  elements.inspectModalOverlay.addEventListener('click', (e) => {
    if (e.target === elements.inspectModalOverlay) closeInspectModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeInspectModal();
  });

  // Copy Contract Address
  elements.mCopyAddrBtn.addEventListener('click', () => {
    const addr = elements.mTokenAddress.textContent;
    navigator.clipboard.writeText(addr).then(() => {
      const originalText = elements.mCopyAddrBtn.textContent;
      elements.mCopyAddrBtn.textContent = 'Copied!';
      setTimeout(() => {
        elements.mCopyAddrBtn.textContent = originalText;
      }, 1500);
    });
  });

  // Legit Vault Modal Controls
  if (elements.openLegitModalBtn) {
    elements.openLegitModalBtn.addEventListener('click', openLegitModal);
  }
  if (elements.metricCardLegit) {
    elements.metricCardLegit.addEventListener('click', openLegitModal);
  }
  if (elements.legitCloseBtn) {
    elements.legitCloseBtn.addEventListener('click', closeLegitModal);
  }
  if (elements.legitModalOverlay) {
    elements.legitModalOverlay.addEventListener('click', (e) => {
      if (e.target === elements.legitModalOverlay) closeLegitModal();
    });
  }
  if (elements.legitChainFilter) {
    elements.legitChainFilter.addEventListener('change', (e) => {
      state.legitChain = e.target.value;
      fetchLegitTokens(true);
    });
  }
  if (elements.legitSortFilter) {
    elements.legitSortFilter.addEventListener('change', (e) => {
      state.legitSort = e.target.value;
      fetchLegitTokens(true);
    });
  }
  if (elements.legitRefreshBtn) {
    elements.legitRefreshBtn.addEventListener('click', () => {
      fetchLegitTokens(true);
    });
  }

  // 3D Growth Analysis Modal Controls
  if (elements.mAnalyzeGrowthBtn) {
    elements.mAnalyzeGrowthBtn.addEventListener('click', () => {
      if (state.currentTokenForAnalysis) {
        openAnalysisModal(state.currentTokenForAnalysis);
      }
    });
  }
  if (elements.anaCloseBtn) {
    elements.anaCloseBtn.addEventListener('click', closeAnalysisModal);
  }
  if (elements.analysisModalOverlay) {
    elements.analysisModalOverlay.addEventListener('click', (e) => {
      if (e.target === elements.analysisModalOverlay) closeAnalysisModal();
    });
  }
  if (elements.anaTrackBtn) {
    elements.anaTrackBtn.addEventListener('click', trackCurrentToken);
  }

  // Projection Lab Controls
  if (elements.openWatchLabBtn) {
    elements.openWatchLabBtn.addEventListener('click', openWatchLab);
  }
  if (elements.watchLabCloseBtn) {
    elements.watchLabCloseBtn.addEventListener('click', closeWatchLab);
  }
  if (elements.watchLabModalOverlay) {
    elements.watchLabModalOverlay.addEventListener('click', (e) => {
      if (e.target === elements.watchLabModalOverlay) closeWatchLab();
    });
  }
  if (elements.watchChainFilter) {
    elements.watchChainFilter.addEventListener('change', (e) => {
      state.watchChain = e.target.value;
      fetchWatchTokens(true);
    });
  }
  if (elements.watchStatusFilter) {
    elements.watchStatusFilter.addEventListener('change', (e) => {
      state.watchStatus = e.target.value;
      fetchWatchTokens(true);
    });
  }
  if (elements.watchRefreshBtn) {
    elements.watchRefreshBtn.addEventListener('click', () => {
      fetchWatchTokens(true);
    });
  }
}

function attachRowEventListeners() {
  // Inspect button click in table rows
  document.querySelectorAll('[data-inspect-addr]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const addr = btn.dataset.inspectAddr;
      const token = state.tokens.find((t) => (t.baseToken?.address || '').toLowerCase() === addr.toLowerCase());
      if (token) openInspectModal(token);
    });
  });

  // Mini copy address button in table rows
  document.querySelectorAll('[data-copy]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const addr = btn.dataset.copy;
      navigator.clipboard.writeText(addr);
      btn.style.color = '#10b981';
      setTimeout(() => {
        btn.style.color = '';
      }, 1000);
    });
  });
}

// ==========================================================================
// Inspection Drawer / Modal Display
// ==========================================================================
function openInspectModal(token) {
  state.currentTokenForAnalysis = token;
  const sec = token.security || {};
  const score = sec.score ?? 50;
  const badge = sec.badge || 'CAUTION';
  const breakdown = sec.scoreBreakdown || {};
  const secDetails = sec.details || {};

  // Headers
  elements.mTokenSymbol.textContent = token.baseToken?.symbol || 'UNKNOWN';
  elements.mTokenName.textContent = token.baseToken?.name || '';
  elements.mChainBadge.textContent = (token.chainId || state.chain).toUpperCase();
  elements.mTokenAddress.textContent = token.baseToken?.address || token.pairAddress;

  // Score Number & Circle Stroke
  elements.mScoreValue.textContent = score;
  const circleOffset = 264 - (264 * (score / 100));
  elements.mScoreCircle.style.strokeDashoffset = circleOffset;

  let strokeColor = '#10b981';
  let badgeStyle = 'badge-safe';
  let verdictTitle = 'High Safety Confidence';
  let verdictDesc = 'Contract verified: no honeypot mechanics, healthy liquidity floor, and safe authorities.';

  if (score < 50) {
    strokeColor = '#ef4444';
    badgeStyle = 'badge-trap';
    verdictTitle = 'Severe Trap Hazards Detected';
    verdictDesc = 'Extreme risk of capital loss: honeypot indicators, active mint permissions, or freeze capability.';
  } else if (score < 80) {
    strokeColor = '#f59e0b';
    badgeStyle = 'badge-caution';
    verdictTitle = 'Moderate Risk Flags Surfaced';
    verdictDesc = 'Caution advised: elevated transaction taxes, concentrated top wallets, or low liquidity/FDV ratio.';
  }

  elements.mScoreCircle.style.stroke = strokeColor;
  elements.mBadgeLarge.className = `score-badge-large ${badgeStyle}`;
  elements.mBadgeLarge.textContent = badge;
  elements.mVerdictTitle.textContent = verdictTitle;
  elements.mVerdictDesc.textContent = verdictDesc;

  // Market stats
  elements.mPriceUsd.textContent = `$${token.priceUsd}`;
  elements.mGain24.textContent = `${token.priceChange24h >= 0 ? '+' : ''}${token.priceChange24h}%`;
  elements.mLiquidity.textContent = `$${formatNumber(token.liquidityUsd)}`;
  elements.mFdv.textContent = `$${formatNumber(token.fdv)}`;
  elements.mVolume.textContent = `$${formatNumber(token.volume24h)}`;
  elements.mTxns.textContent = `${formatNumber(token.txns24h?.buys || 0)} / ${formatNumber(token.txns24h?.sells || 0)}`;

  // Launch and Turnover telemetry
  if (elements.mLaunchedAt) {
    elements.mLaunchedAt.textContent = token.launch?.ageFormatted ? token.launch.ageFormatted : 'Seasoned';
  }
  if (elements.mSurgeFromCreation) {
    elements.mSurgeFromCreation.textContent = token.launch?.estMultiplier 
      ? `⚡ ${token.launch.estMultiplier} (+${(token.launch.estGainFromCreation || 0).toLocaleString()}%)`
      : 'N/A';
  }
  if (elements.mTurnover) {
    const tRatio = token.turnover?.ratio || 0;
    const isWash = token.turnover?.isWashRisk;
    elements.mTurnover.textContent = tRatio > 0 
      ? `${tRatio}x ${isWash ? '⚠️ (WASH RISK)' : '(Organic)'}`
      : '--';
    elements.mTurnover.className = isWash ? 'mstat-val text-red' : 'mstat-val';
  }

  // Populate Trader's Due Diligence Cross-Check Dock
  if (elements.mCrossCheckDock) {
    const chain = (token.chainId || state.chain).toLowerCase();
    const mintAddr = token.baseToken?.address || token.pairAddress;
    let dockHtml = '';

    if (chain === 'solana') {
      dockHtml = `
        <a href="https://rugcheck.xyz/tokens/${mintAddr}" target="_blank" rel="noopener noreferrer" class="dock-btn btn-rugcheck" title="Inspect Mint/Freeze Authorities & LP Lock on RugCheck">
          <span class="dock-icon">🛡️</span>
          <span>RugCheck Report</span>
        </a>
        <a href="https://bubblemaps.io/solana/token/${mintAddr}" target="_blank" rel="noopener noreferrer" class="dock-btn btn-bubble" title="Inspect Insider Wallet Clusters on Bubblemaps">
          <span class="dock-icon">🫧</span>
          <span>Bubblemaps Cluster</span>
        </a>
        <a href="https://solscan.io/token/${mintAddr}" target="_blank" rel="noopener noreferrer" class="dock-btn btn-explorer" title="View On-chain Token Contract & Holders on Solscan">
          <span class="dock-icon">🔎</span>
          <span>Solscan Explorer</span>
        </a>
        <a href="${token.url || `https://dexscreener.com/solana/${token.pairAddress}`}" target="_blank" rel="noopener noreferrer" class="dock-btn" title="View Live Chart on DEXScreener">
          <span class="dock-icon">📈</span>
          <span>Live Chart</span>
        </a>
      `;
    } else {
      const explorerUrl = chain === 'base' ? `https://basescan.org/token/${mintAddr}` :
                         (chain === 'bsc' ? `https://bscscan.com/token/${mintAddr}` : `https://etherscan.io/token/${mintAddr}`);
      const explorerName = chain === 'base' ? 'Basescan' : (chain === 'bsc' ? 'BscScan' : 'Etherscan');
      const chainId = chain === 'base' ? '8453' : (chain === 'bsc' ? '56' : '1');

      dockHtml = `
        <a href="https://honeypot.is/?address=${mintAddr}" target="_blank" rel="noopener noreferrer" class="dock-btn btn-honeypot" title="Simulate Buy & Sell execution on Honeypot.is">
          <span class="dock-icon">🍯</span>
          <span>Honeypot.is Test</span>
        </a>
        <a href="https://gopluslabs.io/token-security/${chainId}/${mintAddr}" target="_blank" rel="noopener noreferrer" class="dock-btn btn-rugcheck" title="Full Contract Permission Audit on GoPlus">
          <span class="dock-icon">🛡️</span>
          <span>GoPlus Audit</span>
        </a>
        <a href="https://bubblemaps.io/eth/token/${mintAddr}" target="_blank" rel="noopener noreferrer" class="dock-btn btn-bubble" title="Inspect Insider Clustering on Bubblemaps">
          <span class="dock-icon">🫧</span>
          <span>Bubblemaps Cluster</span>
        </a>
        <a href="${explorerUrl}" target="_blank" rel="noopener noreferrer" class="dock-btn btn-explorer" title="Inspect On-chain Contract & Top Holders">
          <span class="dock-icon">🔎</span>
          <span>${explorerName}</span>
        </a>
      `;
    }
    elements.mCrossCheckDock.innerHTML = dockHtml;
  }

  // Checklist Items
  elements.mChecklistContainer.innerHTML = buildChecklistCards(token, secDetails, sec);

  // Breakdown Table
  elements.mBreakdownTableBody.innerHTML = buildBreakdownRows(breakdown);

  // DEXScreener external link
  elements.mDexLink.href = token.url || `https://dexscreener.com/${token.chainId}/${token.pairAddress}`;

  // Show modal
  elements.inspectModalOverlay.classList.remove('hidden');
}

function closeInspectModal() {
  elements.inspectModalOverlay.classList.add('hidden');
}

// ==========================================================================
// Legit Coins Vault Management
// ==========================================================================
async function fetchLegitTokens(renderTableOnFetch = false) {
  try {
    const url = `/api/legit?chain=${encodeURIComponent(state.legitChain)}&sortBy=${encodeURIComponent(state.legitSort)}`;
    const res = await fetch(url);
    if (!res.ok) return;

    const data = await res.json();
    if (data.success) {
      state.legitTokens = data.tokens || [];
      state.legitCount = data.total ?? state.legitTokens.length;

      if (elements.navLegitBadge) {
        elements.navLegitBadge.textContent = state.legitCount;
      }
      if (elements.metricLegitCount) {
        elements.metricLegitCount.textContent = state.legitCount;
      }

      if (renderTableOnFetch || !elements.legitModalOverlay.classList.contains('hidden')) {
        renderLegitTable();
      }
    }
  } catch (err) {
    console.warn('[Legit Vault] Fetch error:', err.message);
  }
}

function openLegitModal() {
  elements.legitModalOverlay.classList.remove('hidden');
  fetchLegitTokens(true);
}

function closeLegitModal() {
  elements.legitModalOverlay.classList.add('hidden');
}

function renderLegitTable() {
  if (!elements.legitTableBody) return;

  const tokens = state.legitTokens;
  if (!tokens || tokens.length === 0) {
    elements.legitTableBody.innerHTML = '';
    elements.legitEmptyState.classList.remove('hidden');
    return;
  }

  elements.legitEmptyState.classList.add('hidden');

  elements.legitTableBody.innerHTML = tokens.map((token) => {
    const priceUsd = token.priceUsd ? Number(token.priceUsd).toFixed(4) : '0.00';
    const gain = Number(token.priceChange24h) || 0;
    const gainSign = gain >= 0 ? '+' : '';
    const gainClass = gain >= 0 ? 'gain-pill' : 'gain-pill negative';
    const score = token.score ?? 80;
    const scoreClass = score >= 80 ? 'score-safe' : 'score-caution';
    const createdDate = token.createdAt ? new Date(token.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--';

    return `
      <tr data-legit-addr="${escapeHtml(token.pairAddress)}">
        <td>
          <div class="td-token-cell">
            <span class="token-dex-badge">${escapeHtml(token.chainId || 'solana')}</span>
            <div class="token-meta">
              <div class="token-symbol-row">
                <span class="token-symbol">${escapeHtml(token.symbol || 'UNKNOWN')}</span>
              </div>
              <div class="token-name-row">
                <span>${escapeHtml(token.name || '')}</span>
              </div>
            </div>
          </div>
        </td>
        <td class="th-num">
          <span class="mono-val">$${priceUsd}</span>
        </td>
        <td class="th-num">
          <span class="${gainClass}">${gainSign}${gain.toFixed(2)}%</span>
        </td>
        <td class="th-num">
          <span class="mono-val">$${formatCompact(token.liquidityUsd)}</span>
        </td>
        <td class="th-score">
          <div class="score-cell-wrap">
            <span class="score-num ${scoreClass}">${score}</span>
          </div>
        </td>
        <td class="th-badge">
          <span class="badge-pill badge-safe">${escapeHtml(token.badge || 'SAFE')}</span>
        </td>
        <td class="th-num">
          <span class="mono-val" style="font-size: 0.8rem; color: var(--text-muted);">${createdDate}</span>
        </td>
        <td class="th-action">
          <div class="legit-actions-wrap">
            <button class="btn-table-action" data-scan-legit="${escapeHtml(token.tokenAddress || token.pairAddress)}" data-chain="${escapeHtml(token.chainId || 'solana')}" title="Run Live Security Scan">
              <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
              Scan
            </button>
            ${token.url ? `
              <a href="${escapeHtml(token.url)}" target="_blank" rel="noopener noreferrer" class="btn-table-action" title="Open DEXScreener">
                DEX
              </a>
            ` : ''}
            <button class="btn-table-action btn-table-delete" data-delete-legit="${escapeHtml(token.pairAddress)}" title="Remove from Vault">
              &times;
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  // Attach Vault row actions
  document.querySelectorAll('[data-scan-legit]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const addr = btn.dataset.scanLegit;
      const chain = btn.dataset.chain || state.chain;
      closeLegitModal();
      elements.scanAddressInput.value = addr;
      // Trigger deep scan
      try {
        const res = await fetch(`/api/scan?chain=${encodeURIComponent(chain)}&address=${encodeURIComponent(addr)}`);
        const data = await res.json();
        if (data.success && data.token) {
          openInspectModal(data.token);
        }
      } catch (e) {
        console.error('Scan error:', e);
      }
    });
  });

  document.querySelectorAll('[data-delete-legit]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const addr = btn.dataset.deleteLegit;
      try {
        const res = await fetch(`/api/legit/${encodeURIComponent(addr)}`, { method: 'DELETE' });
        const data = await res.json();
        if (data.success) {
          fetchLegitTokens(true);
        }
      } catch (e) {
        console.error('Delete error:', e);
      }
    });
  });
}

function buildChecklistCards(token, details, sec) {
  const items = [
    {
      title: 'Honeypot Simulation',
      pass: !details.isHoneypot,
      severity: details.isHoneypot ? 'danger' : 'pass',
      statusText: details.isHoneypot ? 'FAIL (Honeypot)' : 'PASS (Tradable)',
      desc: details.isHoneypot
        ? 'Contract blocks sell transactions or restricts selling entire balances.'
        : 'Sell simulation executed successfully without restrictive hooks.'
    },
    {
      title: 'Mint Authority Revoked',
      pass: !details.hasMintAuthority,
      severity: details.hasMintAuthority ? 'danger' : 'pass',
      statusText: details.hasMintAuthority ? 'FAIL (Active Mint)' : 'PASS (Revoked)',
      desc: details.hasMintAuthority
        ? 'Owner or deployer retains authority to mint infinite new tokens.'
        : 'Mint authority is revoked. Supply cannot be arbitrarily diluted.'
    },
    {
      title: 'Freeze Authority Revoked / Unpausable',
      pass: !details.hasFreezeAuthority,
      severity: details.hasFreezeAuthority ? 'danger' : 'pass',
      statusText: details.hasFreezeAuthority ? 'FAIL (Can Freeze)' : 'PASS (Unpausable)',
      desc: details.hasFreezeAuthority
        ? 'Contract contains pausable trading or balance freezing functions.'
        : 'No balance freezing or transfer suspension functions present.'
    },
    {
      title: 'Liquidity Floor ($50,000 USD)',
      pass: (token.liquidityUsd >= 50000),
      severity: (token.liquidityUsd < 50000) ? 'warn' : 'pass',
      statusText: (token.liquidityUsd >= 50000) ? 'PASS' : 'WARN (Low Liq)',
      desc: `Current pool liquidity is $${formatNumber(token.liquidityUsd)} (minimum safe floor: $50,000).`
    },
    {
      title: 'Transaction Taxes (≤10% Limit)',
      pass: (details.buyTax <= 10 && details.sellTax <= 10),
      severity: (details.buyTax > 10 || details.sellTax > 10) ? 'danger' : ((details.buyTax > 5 || details.sellTax > 5) ? 'warn' : 'pass'),
      statusText: `Buy ${details.buyTax || 0}% / Sell ${details.sellTax || 0}%`,
      desc: (details.buyTax > 10 || details.sellTax > 10)
        ? 'High taxes detected! Trader faces severe exit fees.'
        : 'Transaction taxes are within acceptable limits.'
    },
    {
      title: 'Top 10 Holder Concentration (≤40%)',
      pass: (details.topHolderPct <= 40),
      severity: (details.topHolderPct > 40) ? 'warn' : 'pass',
      statusText: `${details.topHolderPct || 0}% Held`,
      desc: (details.topHolderPct > 40)
        ? 'Top 10 wallets control high proportion of circulating supply. Dump risk.'
        : 'Holder distribution shows healthy decentralization.'
    }
  ];

  return items.map((item) => `
    <div class="checklist-item">
      <div class="checklist-icon">${item.pass ? '✅' : (item.severity === 'danger' ? '❌' : '⚠️')}</div>
      <div class="checklist-content">
        <div class="checklist-title-row">
          <span class="checklist-title">${item.title}</span>
          <span class="checklist-status-badge status-${item.severity}">${item.statusText}</span>
        </div>
        <p class="checklist-desc">${item.desc}</p>
      </div>
    </div>
  `).join('');
}

function buildBreakdownRows(b) {
  const rules = [
    { name: 'Honeypot Trap Check', weight: 30, penalty: b.honeypot || 0 },
    { name: 'Mint Authority Check', weight: 20, penalty: b.mintAuthority || 0 },
    { name: 'Freeze Authority Check', weight: 15, penalty: b.freezeAuthority || 0 },
    { name: 'Low Liquidity / Ratio', weight: 15, penalty: b.lowLiquidity || 0 },
    { name: 'Excessive Buy/Sell Tax', weight: 10, penalty: b.highTax || 0 },
    { name: 'Whale Holder Concentration', weight: 10, penalty: b.holderConcentration || 0 },
    { name: 'Txn Dynamics (Sell Dump)', weight: 5, penalty: b.transactionDynamics || 0 }
  ];

  return rules.map((r) => {
    const isClean = r.penalty === 0;
    return `
      <tr>
        <td style="color: var(--text-main);">${r.name}</td>
        <td>${r.weight} pts</td>
        <td style="color: ${isClean ? 'var(--text-muted)' : '#ef4444'}; font-weight: 700;">
          ${isClean ? '0' : `-${r.penalty}`}
        </td>
        <td style="color: ${isClean ? '#10b981' : '#ef4444'}; font-weight: 600;">
          ${isClean ? 'CLEAN' : 'DEDUCTED'}
        </td>
      </tr>
    `;
  }).join('');
}

// ==========================================================================
// Formatting Helpers
// ==========================================================================
function formatCompact(num) {
  if (!num || isNaN(num)) return '0';
  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1
  }).format(num);
}

function formatNumber(num) {
  if (!num || isNaN(num)) return '0';
  return new Intl.NumberFormat('en-US').format(num);
}

function formatAddress(addr) {
  if (!addr) return '';
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ==========================================================================
// 3D Growth Analysis & Setup Engine
// ==========================================================================
async function openAnalysisModal(token) {
  if (!token) return;
  state.currentTokenForAnalysis = token;

  // Set basic identity
  elements.anaTokenSymbol.textContent = token.baseToken?.symbol || 'UNKNOWN';
  elements.anaTokenName.textContent = token.baseToken?.name || '';
  elements.anaChainBadge.textContent = (token.chainId || state.chain).toUpperCase();
  elements.anaTokenAddress.textContent = token.baseToken?.address || token.pairAddress;

  // Reset to loading state
  elements.anaGradeBadge.textContent = '...';
  elements.anaGradeBadge.className = 'grade-badge grade-B';
  elements.anaVerdictHeadline.textContent = 'Calculating 3D Momentum & Exitability Matrix...';
  elements.anaVerdictSummary.textContent = 'Evaluating defense legitimacy, buyer orderflow absorption, and liquidity pool depth.';
  elements.anaLegScore.textContent = '--';
  elements.anaMomScore.textContent = '--';
  elements.anaExitScore.textContent = '--';
  elements.anaPlanEntry.textContent = `$${token.priceUsd || '0.00'}`;
  elements.anaPlan2x.textContent = '...';
  elements.anaPlanStop.textContent = '...';
  elements.anaPillarBreakdown.innerHTML = '<div style="padding: 1rem; color: var(--text-muted); text-align: center;">Running 3D analysis heuristics...</div>';

  // Check if token is already in watch lab
  const isAlreadyTracked = state.watchTokens.some((t) => t.pairAddress === token.pairAddress);
  if (isAlreadyTracked) {
    elements.anaTrackBtn.innerHTML = `
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="20 6 9 17 4 12"></polyline>
      </svg>
      <span>Already in Projection Lab</span>
    `;
    elements.anaTrackBtn.disabled = true;
  } else {
    elements.anaTrackBtn.innerHTML = `
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M12 5v14M5 12h14"></path>
      </svg>
      <span>+ Track in Projection Lab</span>
    `;
    elements.anaTrackBtn.disabled = false;
  }

  // Open modal
  elements.analysisModalOverlay.classList.remove('hidden');

  try {
    const res = await fetch('/api/analysis', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token })
    });

    const data = await res.json();
    if (!data.success || !data.analysis) {
      throw new Error(data.error || 'Failed to analyze token');
    }

    const a = data.analysis;
    state.currentAnalysis = a;

    // Grade banner
    const gradeLetter = a.grade ? a.grade[0] : 'B';
    elements.anaGradeBadge.textContent = a.grade || 'B';
    elements.anaGradeBadge.className = `grade-badge grade-${gradeLetter}`;
    elements.anaVerdictHeadline.textContent = a.verdict?.headline || 'Analysis Complete';
    elements.anaVerdictSummary.textContent = a.verdict?.summary || '';

    // Tri-scores
    elements.anaLegScore.textContent = `${a.dimensions.legitimacy.score}/100`;
    elements.anaMomScore.textContent = `${a.dimensions.momentum.score}/100`;
    elements.anaExitScore.textContent = `${a.dimensions.exitability.score}/100`;

    // Mechanical Trade Plan
    const p = a.tradePlan || {};
    elements.anaPlanEntry.textContent = `$${p.entryPriceUsd !== undefined ? p.entryPriceUsd : token.priceUsd}`;
    elements.anaPlan2x.textContent = `$${p.deRiskPriceTarget !== undefined ? p.deRiskPriceTarget : '0.00'}`;
    elements.anaPlanStop.textContent = `$${p.invalidationStopPrice !== undefined ? p.invalidationStopPrice : '0.00'}`;

    // Render 3 Pillars Factor Breakdown
    elements.anaPillarBreakdown.innerHTML = renderPillarBreakdown(a);

  } catch (err) {
    console.error('Analysis error:', err);
    elements.anaVerdictHeadline.textContent = 'Analysis Encountered an Error';
    elements.anaVerdictSummary.textContent = err.message;
  }
}

function closeAnalysisModal() {
  elements.analysisModalOverlay.classList.add('hidden');
}

function renderPillarBreakdown(a) {
  const leg = a.dimensions.legitimacy;
  const mom = a.dimensions.momentum;
  const exit = a.dimensions.exitability;

  return `
    <div class="pillar-section">
      <div class="pillar-header">
        <span class="pillar-header-title">🛡️ Pillar 1: Contract Legitimacy (35% Weight)</span>
        <span class="pillar-header-score text-green">${leg.score}/100</span>
      </div>
      <div class="pillar-items-list">
        <div class="pillar-item-row">
          <span class="pillar-item-label">Honeypot / Sell Execution</span>
          <span class="pillar-item-badge ${leg.details?.isHoneypot ? 'status-danger' : 'status-pass'}">
            ${leg.details?.isHoneypot ? 'FAIL (Honeypot)' : 'PASS (Tradable)'}
          </span>
        </div>
        <div class="pillar-item-row">
          <span class="pillar-item-label">Mint Authority Revocation</span>
          <span class="pillar-item-badge ${leg.details?.hasMintAuthority ? 'status-danger' : 'status-pass'}">
            ${leg.details?.hasMintAuthority ? 'FAIL (Active Mint)' : 'PASS (Revoked)'}
          </span>
        </div>
        <div class="pillar-item-row">
          <span class="pillar-item-label">Freeze / Pause Authority</span>
          <span class="pillar-item-badge ${leg.details?.hasFreezeAuthority ? 'status-danger' : 'status-pass'}">
            ${leg.details?.hasFreezeAuthority ? 'FAIL (Can Freeze)' : 'PASS (Unpausable)'}
          </span>
        </div>
      </div>
    </div>

    <div class="pillar-section">
      <div class="pillar-header">
        <span class="pillar-header-title">🚀 Pillar 2: Tradeable Momentum Setup (40% Weight)</span>
        <span class="pillar-header-score text-green">${mom.score}/100</span>
      </div>
      <div class="pillar-items-list">
        <div class="pillar-item-row">
          <span class="pillar-item-label">Buyer Orderflow Share</span>
          <span class="pillar-item-badge ${(mom.details?.buyTxnPct || 0) >= 60 ? 'status-pass' : 'status-warn'}">
            ${mom.details?.buyTxnPct || 0}% Buys
          </span>
        </div>
        <div class="pillar-item-row">
          <span class="pillar-item-label">Volume Turnover Ratio</span>
          <span class="pillar-item-badge ${mom.details?.isWashRisk ? 'status-danger' : 'status-pass'}">
            ${mom.details?.turnoverRatio || 0}x ${mom.details?.isWashRisk ? '(Wash Risk)' : '(Healthy)'}
          </span>
        </div>
        <div class="pillar-item-row">
          <span class="pillar-item-label">Inception Age Sweet Spot</span>
          <span class="pillar-item-badge ${(mom.details?.pairAgeMinutes || 0) <= 180 ? 'status-pass' : 'status-warn'}">
            ${mom.details?.pairAgeMinutes !== null ? `${mom.details.pairAgeMinutes}m old` : 'Seasoned'}
          </span>
        </div>
      </div>
    </div>

    <div class="pillar-section">
      <div class="pillar-header">
        <span class="pillar-header-title">🚪 Pillar 3: Exitability &amp; Slippage Depth (25% Weight)</span>
        <span class="pillar-header-score text-action">${exit.score}/100</span>
      </div>
      <div class="pillar-items-list">
        <div class="pillar-item-row">
          <span class="pillar-item-label">Pool Liquidity Depth</span>
          <span class="pillar-item-badge ${(exit.details?.liquidityUsd || 0) >= 50000 ? 'status-pass' : 'status-warn'}">
            $${formatCompact(exit.details?.liquidityUsd || 0)}
          </span>
        </div>
        <div class="pillar-item-row">
          <span class="pillar-item-label">Sell Tax Deduction</span>
          <span class="pillar-item-badge ${(exit.details?.sellTax || 0) <= 5 ? 'status-pass' : 'status-danger'}">
            ${exit.details?.sellTax || 0}% Exit Tax
          </span>
        </div>
        <div class="pillar-item-row">
          <span class="pillar-item-label">Top 10 Wallets Concentration</span>
          <span class="pillar-item-badge ${(exit.details?.topHolderPct || 0) <= 40 ? 'status-pass' : 'status-warn'}">
            ${exit.details?.topHolderPct || 0}% Supply
          </span>
        </div>
      </div>
    </div>
  `;
}

// Track button action
async function trackCurrentToken() {
  const token = state.currentTokenForAnalysis;
  const analysis = state.currentAnalysis;
  if (!token || !analysis) return;

  elements.anaTrackBtn.disabled = true;
  elements.anaTrackBtn.innerHTML = `
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
      <circle cx="12" cy="12" r="10" stroke-opacity="0.25"></circle>
      <path d="M12 2a10 10 0 0 1 10 10"></path>
    </svg>
    <span>Tracking in Lab...</span>
  `;

  try {
    const res = await fetch('/api/watch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pairAddress: token.pairAddress,
        tokenAddress: token.baseToken?.address || token.pairAddress,
        symbol: token.baseToken?.symbol || 'UNKNOWN',
        name: token.baseToken?.name || '',
        chainId: token.chainId || state.chain,
        priceUsd: token.priceUsd,
        analysis
      })
    });

    const data = await res.json();
    if (data.success) {
      elements.anaTrackBtn.innerHTML = `
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
        <span>✓ Added to Projection Lab!</span>
      `;
      // Refresh watch tokens list & badges
      await fetchWatchTokens(true);
    } else {
      alert(data.error || 'Failed to track token');
      elements.anaTrackBtn.disabled = false;
      elements.anaTrackBtn.textContent = '+ Track in Projection Lab';
    }
  } catch (err) {
    alert(`Tracking failed: ${err.message}`);
    elements.anaTrackBtn.disabled = false;
    elements.anaTrackBtn.textContent = '+ Track in Projection Lab';
  }
}

// ==========================================================================
// Projection Lab Management
// ==========================================================================
async function fetchWatchTokens(renderTableOnFetch = false) {
  try {
    const url = `/api/watch?chain=${encodeURIComponent(state.watchChain)}&status=${encodeURIComponent(state.watchStatus)}`;
    const res = await fetch(url);
    if (!res.ok) return;

    const data = await res.json();
    if (data.success) {
      state.watchTokens = data.tokens || [];
      state.watchCount = data.total ?? state.watchTokens.length;

      if (elements.navWatchBadge) {
        elements.navWatchBadge.textContent = state.watchCount;
      }

      // Compute Projection Lab metrics
      const total = state.watchTokens.length;
      const wins = state.watchTokens.filter((t) => t.outcomeStatus === 'HIT_2X_DERISK').length;
      const winRate = total > 0 ? Math.round((wins / total) * 100) : 0;
      const avgPnl = total > 0 
        ? (state.watchTokens.reduce((acc, t) => acc + (t.pnlPercent || 0), 0) / total).toFixed(1)
        : '0.0';

      if (elements.labTotalTracked) elements.labTotalTracked.textContent = total;
      if (elements.labWinRate) elements.labWinRate.textContent = `${winRate}%`;
      if (elements.labAvgPnl) {
        elements.labAvgPnl.textContent = `${parseFloat(avgPnl) >= 0 ? '+' : ''}${avgPnl}%`;
        elements.labAvgPnl.className = parseFloat(avgPnl) >= 0 ? 'metric-value text-green' : 'metric-value text-red';
      }

      if (renderTableOnFetch || !elements.watchLabModalOverlay.classList.contains('hidden')) {
        renderWatchTable();
      }
    }
  } catch (err) {
    console.warn('[Projection Lab] Fetch error:', err.message);
  }
}

function openWatchLab() {
  elements.watchLabModalOverlay.classList.remove('hidden');
  fetchWatchTokens(true);
}

function closeWatchLab() {
  elements.watchLabModalOverlay.classList.add('hidden');
}

function renderWatchTable() {
  if (!elements.watchLabTableBody) return;

  const tokens = state.watchTokens;
  if (!tokens || tokens.length === 0) {
    elements.watchLabTableBody.innerHTML = '';
    elements.watchLabEmptyState.classList.remove('hidden');
    return;
  }

  elements.watchLabEmptyState.classList.add('hidden');

  elements.watchLabTableBody.innerHTML = tokens.map((token) => {
    const entryPrice = token.entryPriceUsd !== null ? Number(token.entryPriceUsd).toFixed(4) : '0.00';
    const livePrice = token.currentPriceUsd !== null ? Number(token.currentPriceUsd).toFixed(4) : entryPrice;
    const pnl = Number(token.pnlPercent) || 0;
    const pnlSign = pnl >= 0 ? '+' : '';
    const pnlClass = pnl >= 0 ? 'gain-pill' : 'gain-pill negative';

    const grade = token.overallGrade || 'B';
    const gradeLetter = grade[0];

    // Status pill
    let statusMarkup = '';
    if (token.outcomeStatus === 'HIT_2X_DERISK') {
      statusMarkup = `<span class="badge-pill badge-win">🎯 HIT 2X TARGET</span>`;
    } else if (token.outcomeStatus === 'STOPPED_OUT') {
      statusMarkup = `<span class="badge-pill badge-stopped">🛑 STOPPED OUT (-15%)</span>`;
    } else {
      statusMarkup = `<span class="badge-pill badge-tracking">⏱️ TRACKING</span>`;
    }

    const trackedTime = token.trackedAt ? new Date(token.trackedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--';

    return `
      <tr data-watch-addr="${escapeHtml(token.pairAddress)}">
        <td>
          <div class="td-token-cell">
            <span class="token-dex-badge">${escapeHtml(token.chainId || 'solana')}</span>
            <div class="token-meta">
              <div class="token-symbol-row">
                <span class="token-symbol">${escapeHtml(token.symbol || 'UNKNOWN')}</span>
              </div>
              <div class="token-name-row">
                <span>${escapeHtml(token.name || '')}</span>
              </div>
            </div>
          </div>
        </td>
        <td class="th-num">
          <span class="mono-val">$${entryPrice}</span>
        </td>
        <td class="th-num">
          <span class="mono-val" style="color: #ffffff;">$${livePrice}</span>
        </td>
        <td class="th-num">
          <span class="${pnlClass}">${pnlSign}${pnl.toFixed(2)}%</span>
        </td>
        <td class="th-score">
          <span class="badge-pill grade-${gradeLetter}" style="font-size: 0.78rem; font-weight: 800;">
            ${escapeHtml(grade)}
          </span>
        </td>
        <td class="th-badge">
          ${statusMarkup}
        </td>
        <td class="th-num">
          <span class="mono-val" style="font-size: 0.8rem; color: var(--text-muted);">${trackedTime}</span>
        </td>
        <td class="th-action">
          <div class="legit-actions-wrap">
            <button class="btn-table-action" data-scan-watch="${escapeHtml(token.tokenAddress || token.pairAddress)}" data-chain="${escapeHtml(token.chainId || 'solana')}" title="Run Live Security Scan">
              <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
              Scan
            </button>
            <a href="https://dexscreener.com/${escapeHtml(token.chainId || 'solana')}/${escapeHtml(token.pairAddress)}" target="_blank" rel="noopener noreferrer" class="btn-table-action" title="Open DEXScreener">
              DEX
            </a>
            <button class="btn-table-action btn-table-delete" data-delete-watch="${escapeHtml(token.pairAddress)}" title="Remove from Projection Lab">
              &times;
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  // Row event listeners
  document.querySelectorAll('[data-scan-watch]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const addr = btn.dataset.scanWatch;
      const chain = btn.dataset.chain || state.chain;
      closeWatchLab();
      elements.scanAddressInput.value = addr;
      try {
        const res = await fetch(`/api/scan?chain=${encodeURIComponent(chain)}&address=${encodeURIComponent(addr)}`);
        const data = await res.json();
        if (data.success && data.token) {
          openInspectModal(data.token);
        }
      } catch (e) {
        console.error('Scan error:', e);
      }
    });
  });

  document.querySelectorAll('[data-delete-watch]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const addr = btn.dataset.deleteWatch;
      try {
        const res = await fetch(`/api/watch/${encodeURIComponent(addr)}`, { method: 'DELETE' });
        const data = await res.json();
        if (data.success) {
          fetchWatchTokens(true);
        }
      } catch (e) {
        console.error('Delete error:', e);
      }
    });
  });
}

