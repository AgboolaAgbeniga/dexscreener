/**
 * Centralised Chain Configurations
 */
const SUPPORTED_CHAINS = {
  solana: {
    id: 'solana',
    name: 'Solana',
    symbol: 'SOL',
    icon: '🟣',
    securityProvider: 'rugcheck',
    rugcheckBaseUrl: 'https://api.rugcheck.xyz/v1',
    dexscreenerQuery: 'solana',
    explorerTokenUrl: 'https://solscan.io/token/'
  },
  base: {
    id: 'base',
    name: 'Base',
    symbol: 'ETH',
    icon: '🔵',
    securityProvider: 'goplus',
    goPlusChainId: '8453',
    dexscreenerQuery: 'base',
    explorerTokenUrl: 'https://basescan.org/token/'
  },
  ethereum: {
    id: 'ethereum',
    name: 'Ethereum',
    symbol: 'ETH',
    icon: '🔷',
    securityProvider: 'goplus',
    goPlusChainId: '1',
    dexscreenerQuery: 'ethereum',
    explorerTokenUrl: 'https://etherscan.io/token/'
  },
  bsc: {
    id: 'bsc',
    name: 'BNB Smart Chain',
    symbol: 'BNB',
    icon: '🟡',
    securityProvider: 'goplus',
    goPlusChainId: '56',
    dexscreenerQuery: 'bsc',
    explorerTokenUrl: 'https://bscscan.com/token/'
  }
};

function getChain(chainId) {
  if (!chainId) return SUPPORTED_CHAINS.solana;
  const key = String(chainId).toLowerCase();
  return SUPPORTED_CHAINS[key] || null;
}

module.exports = {
  SUPPORTED_CHAINS,
  getChain
};
