// js/chain/network.js
import { showMessage } from '../core/notifier.js';
export const CHAIN_CONFIG = {
  chainId: "0x61",
  chainName: "BSC Testnet",
  nativeCurrency: { name: "BNB", symbol: "BNB", decimals: 18 },
  rpcUrls: ["https://data-seed-prebsc-1-s1.binance.org:8545/"],
  blockExplorerUrls: ["https://testnet.bscscan.com"]
};
export async function ensureBSCTestnet() {
  try {
    const current = await window.ethereum.request({ method: "eth_chainId" });
    if (current === CHAIN_CONFIG.chainId) return true;
    try {
      await window.ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: CHAIN_CONFIG.chainId }] });
      return true;
    } catch (err) {
      if (err?.code === 4902) {
        await window.ethereum.request({ method: "wallet_addEthereumChain", params: [CHAIN_CONFIG] });
        await window.ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: CHAIN_CONFIG.chainId }] });
        return true;
      }
      throw err;
    }
  } catch (err) {
    console.error("[ensureBSCTestnet]", err);
    showMessage("Erro ao conectar à BSC Testnet. Abra no navegador do MetaMask e aceite a rede 97.", true);
    return false;
  }
}
