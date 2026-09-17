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
  legitCount: 0
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
  mChecklistContainer: document.getElementById('mChecklistContainer'),
  mBreakdownTableBody: document.getElementById('mBreakdownTableBody'),
  mDexLink: document.getElementById('mDexLink'),
  mCopyAddrBtn: document.getElementById('mCopyAddrBtn'),

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
  legitEmptyState: document.getElementById('legitEmptyState')
};

// ==========================================================================
// Initialization
// ==========================================================================
document.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();
  renderSkeletons(8);
  connectSSE(state.chain);
  fetchLegitTokens();
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

  const buys = token.txns24h?.buys || 0;
  const sells = token.txns24h?.sells || 0;
  const liqWarning = (token.liquidityUsd < 50000) ? `<span class="liq-warn">&lt;$50k floor</span>` : '';

  const shortAddr = formatAddress(token.baseToken?.address || token.pairAddress);

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
          </div>
        </div>
      </td>
      <td class="th-num">
        <span class="mono-val">$${token.priceUsd}</span>
      </td>
      <td class="th-num">
        <span class="${gainClass}">${gainSign}${gain.toFixed(2)}%</span>
      </td>
      <td class="th-num">
        <span class="mono-val">$${formatCompact(token.volume24h)}</span>
      </td>
      <td class="th-num">
        <span class="mono-val">$${formatCompact(token.liquidityUsd)}</span>
        ${liqWarning}
      </td>
      <td class="th-num">
        <span class="mono-val">${formatCompact(buys)} / ${formatCompact(sells)}</span>
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
        <span class="badge-pill ${badgeClass}">${badge}</span>
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
