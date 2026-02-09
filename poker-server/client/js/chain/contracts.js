// js/chain/contracts.js
import { state, emit, setSelectedTable } from '../core/state.js';
import { fetchStatus } from '../server/api.js';
import { FACTORY_ABI, ERC20_ABI, TABLE_ABI, CASHIER_ABI } from './abi.js';
import { ensureBSCTestnet } from './network.js';
import { showMessage } from '../core/notifier.js';

export async function connectWallet(){
  try{
    if (!window.ethereum) {
      showMessage(/Android|iPhone/i.test(navigator.userAgent) ? "📱 Abra no navegador do MetaMask." : "🦊 Instale o MetaMask.", true);
      return false;
    }
    state.provider = new window.ethers.BrowserProvider(window.ethereum);
    const [account] = await state.provider.send("eth_requestAccounts", []);
    state.signer = await state.provider.getSigner();
    state.wallet = account;
    if(!await ensureBSCTestnet()) throw new Error("Falha ao mudar para BSC Testnet");
    await loadContracts();
    state.isConnected = true;
    showMessage(`Wallet conectada: ${account.slice(0,6)}...${account.slice(-4)}`);
    emit('wallet:changed', account);
    window.ethereum.on('accountsChanged', () => { disconnectWallet(); location.reload(); });
    window.ethereum.on('chainChanged', () => location.reload());
    return true;
  }catch(e){
    console.error("[connectWallet]", e);
    showMessage("Erro ao conectar wallet: " + (e?.message || e), true);
    disconnectWallet();
    return false;
  }
}

export function disconnectWallet(){
  state.provider = null; state.signer = null; state.wallet = null; state.isConnected = false;
  state.contracts = { chips:null, table:null, cashier:null, factory:null };
  emit('wallet:disconnected');
  showMessage("Wallet desconectada.");
}

export async function loadContracts(){
  if (!state.provider) throw new Error("Provider não inicializado");
  const status = await fetchStatus();
  const chipsAddr   = status?.contracts?.casinoChips;
  const cashierAddr = status?.contracts?.cashier;
  const factoryAddr = status?.contracts?.factory;
  if (!chipsAddr || !cashierAddr || !factoryAddr) throw new Error("Endereços de contratos ausentes no servidor.");
  const signer = await state.provider.getSigner();
  state.contracts.chips   = new window.ethers.Contract(chipsAddr,   ERC20_ABI,  signer);
  state.contracts.cashier = new window.ethers.Contract(cashierAddr, CASHIER_ABI, signer);
  state.contracts.factory = new window.ethers.Contract(factoryAddr, FACTORY_ABI, signer);
  // sem mesa padrão — só define ao escolher no lobby
  emit('contracts:ready', { chipsAddr, cashierAddr, factoryAddr });
  showMessage("Contratos carregados!");
}

export async function resolveTableAddress(idText){
  if(!state.contracts.factory) throw new Error("Factory não carregada");
  const addr = await state.contracts.factory.getTable(idText);
  if (!addr || addr === window.ethers.ZeroAddress) throw new Error("Mesa não encontrada na Factory");
  return addr;
}

export async function setActiveTableById(idText){
  const addr = await resolveTableAddress(idText);
  const signer = await state.provider.getSigner();
  state.contracts.table = new window.ethers.Contract(addr, TABLE_ABI, signer);
  setSelectedTable({ idText, address: addr, name: idText });
  emit('table:connected', { idText, addr });
  return addr;
}

export async function setActiveTableByAddress(address, name){
  const signer = await state.provider.getSigner();
  state.contracts.table = new window.ethers.Contract(address, TABLE_ABI, signer);
  setSelectedTable({ idText: name || null, address, name: name || null });
  emit('table:connected', { idText: name, addr: address });
  return address;
}
