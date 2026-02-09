# ZPM Mining System - Frontend

Web interface for interacting with the ZPM mining system on Binance Smart Chain.

## 🚀 Features

### 💰 USDT Faucet
- Get test USDT (up to 40,000 USDT per address)
- View current balance
- Check how much can still be obtained

### 🪙 Token Info (ZOD)
- View ZOD balance
- See current epoch and transaction fee
- Track mined percentage
- Floor price status
- Total supply and cap information

### 🔄 Pool Swap
- Sell ZOD for USDT
- View floor price
- Calculate quote before selling
- View sale fees (15%)
- Approve and execute swaps

### ⛏️ Mining Power System
- Buy mining power with USDT
- Multi-level referral system (6 levels)
- Claim mined tokens
- Purchase license (30 days)
- View mining statistics:
  - Mining rate (ZOD/second)
  - Minable balance
  - Pending tokens to claim
  - Total mined
- Referral management:
  - Personal referral link
  - View direct referrals
  - Pending bonuses

## 📋 Prerequisites

- Node.js (v16 or higher)
- MetaMask installed in browser
- Binance Smart Chain (BSC) connection

## 🛠️ Installation

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build
```

## 🔧 Configuration

Contract addresses are configured in `src/config.js`:

```javascript
export const CONTRACTS = {
  USDT: '0xf39E77bA61f2685F000577Ae2365b35a3E3F1ABF',    // MockUSDT18
  ZOD: '0x7E83019D97B63578D9A67c6a50cE7e0b009c1BD5',     // RoundMiningToken
  POOL: '0xf9ED9Bd254d1838A2534b74aFd21D92BfD10df72',    // ZpmOnchainPool
  MINING: '0x19CA5ECD715CF3274A3af3D1f6323ff39cE6E7A2'   // ZpmMintPowerFinal
};
```

### Network Configuration

The application is configured for Binance Smart Chain (BSC):
- Chain ID: 56
- RPC URL: https://bsc-dataseed1.binance.org
- Explorer: https://bscscan.com

To change the network, edit `CHAIN_CONFIG` in `src/config.js`.

## 📱 How to Use

### 1. Connect Wallet

1. Click "Connect MetaMask"
2. Approve connection in MetaMask
3. Check if you're on BSC network (application will ask to switch if necessary)

### 2. Get Test USDT

1. In the "USDT Faucet" section
2. Enter desired amount (max: 40,000)
3. Click "Mint USDT"
4. Confirm transaction in MetaMask

### 3. Buy Mining Power

1. In the "Mining Power System" section
2. Enter USDT amount to invest
3. (Optional) Enter referrer address
4. Click "Approve USDT" (first time)
5. Click "Buy Power"
6. Confirm transaction

### 4. Claim Tokens

1. Wait to accumulate tokens (view in "Pending Claim")
2. Click "Claim ZOD"
3. Confirm transaction
4. ZOD tokens will be sent to your wallet

### 5. Sell ZOD for USDT

1. In the "Pool Swap" section
2. Enter ZOD amount
3. View quote (gross value, fee, net value)
4. Click "Approve ZOD" (first time)
5. Click "Sell ZOD"
6. Confirm transaction

### 6. Referral System

- Copy your referral link in the "Referral System" section
- Share with friends
- Earn bonuses when they buy mining power
- Track your direct referrals (active/total)

## 🏗️ Project Structure

```
frontend/
├── src/
│   ├── components/          # React components
│   │   ├── WalletConnect.jsx
│   │   ├── USDTFaucet.jsx
│   │   ├── TokenInfo.jsx
│   │   ├── PoolSwap.jsx
│   │   └── MiningPower.jsx
│   ├── hooks/              # Custom hooks
│   │   ├── useWallet.js    # Wallet connection hook
│   │   └── useContracts.js # Contracts hook
│   ├── config.js           # Configuration and ABIs
│   ├── App.jsx             # Main component
│   └── index.css           # Global styles (Tailwind)
├── package.json
└── vite.config.js
```

## 🎨 Technologies Used

- **React** - UI Library
- **Vite** - Build tool and dev server
- **Ethers.js v5** - Blockchain interaction
- **Tailwind CSS** - Styling
- **MetaMask** - Wallet provider

## 📊 Mining Flow

1. **Investment**: User buys mining power with USDT
2. **Distribution**:
   - 80% → User's minable balance
   - 10% → Mining boost for referrers (6 levels)
   - 10% → Immediate liquidity to pool
3. **Mining**: Tokens are automatically generated over time
4. **Claim**: User claims accumulated tokens
5. **Liquidity**: 5% additional goes to pool at claim time

## 🔐 Security

- Always verify contract addresses before approving transactions
- Never share your seed phrase or private key
- Use small test values first to ensure everything works
- Check transactions on BSCScan before confirming

## 🐛 Troubleshooting

### MetaMask won't connect
- Reload the page
- Disconnect and reconnect wallet
- Clear browser cache

### Transaction fails
- Check if you have enough balance for gas
- Verify you approved tokens before transferring
- Increase gas limit if necessary

### Price doesn't update
- Interface updates every 10-15 seconds automatically
- Reload page if necessary

## 📄 License

MIT

## 🤝 Contributing

Pull requests are welcome! For major changes, please open an issue first to discuss what you would like to change.

---

**Note**: This is a demonstration project. Use at your own risk.
