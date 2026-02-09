<<<<<<< HEAD
# finalzpm
=======
# ZPM Mining System - Frontend

Interface web para interação com o sistema de mineração ZPM na Binance Smart Chain.

## 🚀 Funcionalidades

### 💰 USDT Faucet
- Obter USDT de teste (até 40,000 USDT por endereço)
- Visualizar saldo atual
- Verificar quanto ainda pode ser obtido

### 🪙 Token Info (ZOD)
- Visualizar saldo de ZOD
- Ver época atual e taxa de transação
- Acompanhar porcentagem minerada
- Status do floor price (piso)
- Informações de supply total e cap

### 🔄 Pool Swap
- Vender ZOD por USDT
- Ver preço do floor
- Calcular cotação antes de vender
- Visualizar taxas de venda (15%)
- Aprovar e executar swaps

### ⛏️ Mining Power System
- Comprar poder de mineração com USDT
- Sistema de referências multi-nível (6 níveis)
- Claim de tokens minerados
- Compra de licença (30 dias)
- Visualizar estatísticas de mineração:
  - Taxa de mineração (ZOD/segundo)
  - Saldo minerável
  - Tokens pendentes para claim
  - Total minerado
- Gestão de referências:
  - Link de referência pessoal
  - Visualizar referências diretas
  - Bônus pendentes

## 📋 Pré-requisitos

- Node.js (v16 ou superior)
- MetaMask instalado no navegador
- Conexão com Binance Smart Chain (BSC)

## 🛠️ Instalação

```bash
# Instalar dependências
npm install

# Iniciar servidor de desenvolvimento
npm run dev

# Build para produção
npm run build
```

## 🔧 Configuração

Os endereços dos contratos estão configurados em `src/config.js`:

```javascript
export const CONTRACTS = {
  USDT: '0xf39E77bA61f2685F000577Ae2365b35a3E3F1ABF',    // MockUSDT18
  ZOD: '0x7E83019D97B63578D9A67c6a50cE7e0b009c1BD5',     // RoundMiningToken
  POOL: '0xf9ED9Bd254d1838A2534b74aFd21D92BfD10df72',    // ZpmOnchainPool
  MINING: '0x19CA5ECD715CF3274A3af3D1f6323ff39cE6E7A2'   // ZpmMintPowerFinal
};
```

### Configuração de Rede

A aplicação está configurada para a Binance Smart Chain (BSC):
- Chain ID: 56
- RPC URL: https://bsc-dataseed1.binance.org
- Explorador: https://bscscan.com

Para alterar a rede, edite `CHAIN_CONFIG` em `src/config.js`.

## 📱 Como Usar

### 1. Conectar Carteira

1. Clique em "Connect MetaMask"
2. Aprove a conexão no MetaMask
3. Verifique se está na rede BSC (a aplicação pedirá para trocar se necessário)

### 2. Obter USDT de Teste

1. Na seção "USDT Faucet"
2. Digite a quantidade desejada (máx: 40,000)
3. Clique em "Mint USDT"
4. Confirme a transação no MetaMask

### 3. Comprar Poder de Mineração

1. Na seção "Mining Power System"
2. Digite a quantidade de USDT para investir
3. (Opcional) Insira o endereço do referenciador
4. Clique em "Approve USDT" (primeira vez)
5. Clique em "Buy Power"
6. Confirme a transação

### 4. Claim de Tokens

1. Aguarde acumular tokens (visualize em "Pending Claim")
2. Clique em "Claim ZOD"
3. Confirme a transação
4. Tokens ZOD serão enviados para sua carteira

### 5. Vender ZOD por USDT

1. Na seção "Pool Swap"
2. Digite a quantidade de ZOD
3. Visualize a cotação (valor bruto, taxa, valor líquido)
4. Clique em "Approve ZOD" (primeira vez)
5. Clique em "Sell ZOD"
6. Confirme a transação

### 6. Sistema de Referências

- Copie seu link de referência na seção "Referral System"
- Compartilhe com amigos
- Ganhe bônus quando eles comprarem poder de mineração
- Acompanhe suas referências diretas (ativas/total)

## 🏗️ Estrutura do Projeto

```
frontend/
├── src/
│   ├── components/          # Componentes React
│   │   ├── WalletConnect.jsx
│   │   ├── USDTFaucet.jsx
│   │   ├── TokenInfo.jsx
│   │   ├── PoolSwap.jsx
│   │   └── MiningPower.jsx
│   ├── hooks/              # Custom hooks
│   │   ├── useWallet.js    # Hook de conexão de carteira
│   │   └── useContracts.js # Hook de contratos
│   ├── config.js           # Configurações e ABIs
│   ├── App.jsx             # Componente principal
│   └── index.css           # Estilos globais (Tailwind)
├── package.json
└── vite.config.js
```

## 🎨 Tecnologias Utilizadas

- **React** - Biblioteca UI
- **Vite** - Build tool e dev server
- **Ethers.js v5** - Interação com blockchain
- **Tailwind CSS** - Estilização
- **MetaMask** - Wallet provider

## 📊 Fluxo de Mineração

1. **Investimento**: Usuário compra poder de mineração com USDT
2. **Distribuição**:
   - 80% → Saldo minerável do usuário
   - 10% → Boost de mineração para referenciadores (6 níveis)
   - 10% → Liquidez imediata para o pool
3. **Mineração**: Tokens são gerados automaticamente ao longo do tempo
4. **Claim**: Usuário reivindica tokens acumulados
5. **Liquidez**: 5% adicional vai para o pool no momento do claim

## 🔐 Segurança

- Sempre verifique os endereços dos contratos antes de aprovar transações
- Nunca compartilhe sua seed phrase ou chave privada
- Use valores de teste pequenos primeiro para garantir que tudo funciona
- Verifique as transações no BSCScan antes de confirmar

## 🐛 Troubleshooting

### MetaMask não conecta
- Recarregue a página
- Desconecte e reconecte a carteira
- Limpe o cache do navegador

### Transação falha
- Verifique se tem saldo suficiente para gas
- Verifique se aprovou os tokens antes de transferir
- Aumente o gas limit se necessário

### Preço não atualiza
- A interface atualiza a cada 10-15 segundos automaticamente
- Recarregue a página se necessário

## 📄 Licença

MIT

## 🤝 Contribuindo

Pull requests são bem-vindos! Para mudanças maiores, abra uma issue primeiro para discutir o que você gostaria de mudar.

---

**Nota**: Este é um projeto de demonstração. Use por sua conta e risco.
>>>>>>> 996df9c (Initial commit)
