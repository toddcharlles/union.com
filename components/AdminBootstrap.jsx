import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { formatEther, parseEther, CONTRACTS } from '../config';

const AdminBootstrap = ({ contracts, account, isCorrectNetwork }) => {
  const [mintAmount, setMintAmount] = useState('100000');
  const [mintTo, setMintTo] = useState('');
  const [isMinting, setIsMinting] = useState(false);
  const [hasRole, setHasRole] = useState(false);
  const [hasAdminRole, setHasAdminRole] = useState(false);
  const [txHash, setTxHash] = useState('');
  const [zodSupply, setZodSupply] = useState('0');
  const [grantAddress, setGrantAddress] = useState('');
  const [isGranting, setIsGranting] = useState(false);

  useEffect(() => {
    if (contracts && account && isCorrectNetwork) {
      checkRole();
      loadSupply();
    }
  }, [contracts, account, isCorrectNetwork]);

  const checkRole = async () => {
    try {
      // MINTER_ROLE = keccak256("MINTER_ROLE")
      const MINTER_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("MINTER_ROLE"));
      const DEFAULT_ADMIN_ROLE = await contracts.zod.DEFAULT_ADMIN_ROLE();

      const [hasMinter, hasAdmin] = await Promise.all([
        contracts.zod.hasRole(MINTER_ROLE, account),
        contracts.zod.hasRole(DEFAULT_ADMIN_ROLE, account)
      ]);

      setHasRole(hasMinter);
      setHasAdminRole(hasAdmin);
    } catch (error) {
      console.error('Error checking role:', error);
    }
  };

  const loadSupply = async () => {
    try {
      const supply = await contracts.zod.totalSupply();
      setZodSupply(formatEther(supply.toString()));
    } catch (error) {
      console.error('Error loading supply:', error);
    }
  };

  const handleMint = async () => {
    if (!contracts || !mintAmount || !mintTo) return;

    setIsMinting(true);
    setTxHash('');

    try {
      const amountWei = parseEther(mintAmount);
      const tx = await contracts.zod.mint(mintTo, amountWei);

      setTxHash(tx.hash);

      await tx.wait();

      await loadSupply();

      alert(`Successfully minted ${mintAmount} ZOD to ${mintTo}!`);
      setMintAmount('');
    } catch (error) {
      console.error('Error minting ZOD:', error);
      alert(`Error: ${error.message || 'Mint failed'}`);
    } finally {
      setIsMinting(false);
    }
  };

  const handleGrantRole = async () => {
    if (!contracts || !grantAddress) return;

    setIsGranting(true);
    setTxHash('');

    try {
      const MINTER_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("MINTER_ROLE"));
      const tx = await contracts.zod.grantRole(MINTER_ROLE, grantAddress);

      setTxHash(tx.hash);

      await tx.wait();

      await checkRole();

      alert(`Successfully granted MINTER_ROLE to ${grantAddress}!`);
      setGrantAddress('');
    } catch (error) {
      console.error('Error granting role:', error);
      alert(`Error: ${error.message || 'Grant role failed'}`);
    } finally {
      setIsGranting(false);
    }
  };

  if (!account || !isCorrectNetwork) {
    return null;
  }

  // Show if user has either MINTER_ROLE or ADMIN_ROLE
  if (!hasRole && !hasAdminRole) {
    return null;
  }

  return (
    <div className="card mb-6 border-4 border-purple-500">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-2xl">🔧</span>
        <h2 className="text-2xl font-bold text-purple-800">Admin Bootstrap</h2>
      </div>

      <div className="bg-purple-50 border border-purple-300 rounded-lg p-4 mb-4">
        <p className="text-sm text-purple-800 font-semibold mb-2">
          ⚠️ Admin Functions
        </p>
        <div className="text-xs text-gray-700 space-y-1">
          {hasAdminRole && <p>✅ You have DEFAULT_ADMIN_ROLE (can grant roles)</p>}
          {hasRole && <p>✅ You have MINTER_ROLE (can mint tokens)</p>}
          {!hasRole && hasAdminRole && <p>⚠️ Grant yourself MINTER_ROLE first to mint tokens</p>}
        </div>
      </div>

      {/* Grant Role Section - Only for Admin */}
      {hasAdminRole && (
        <div className="bg-blue-50 border-2 border-blue-400 rounded-lg p-4 mb-6">
          <h3 className="text-lg font-bold text-gray-800 mb-3">🔑 Grant MINTER_ROLE</h3>
          <p className="text-xs text-gray-600 mb-3">
            Grant MINTER_ROLE to an address to allow it to mint ZOD tokens
          </p>

          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Address to Grant Role
              </label>
              <input
                type="text"
                value={grantAddress}
                onChange={(e) => setGrantAddress(e.target.value)}
                placeholder="0x..."
                className="input-field"
                disabled={isGranting}
              />
              <button
                onClick={() => setGrantAddress(account)}
                className="text-xs bg-indigo-200 hover:bg-indigo-300 px-3 py-1 rounded mt-2"
              >
                Use My Address
              </button>
            </div>

            <button
              onClick={handleGrantRole}
              disabled={isGranting || !grantAddress}
              className="btn-primary w-full"
            >
              {isGranting ? 'Granting...' : '🔑 Grant MINTER_ROLE'}
            </button>
          </div>
        </div>
      )}

      <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-lg p-4 mb-4">
        <p className="text-sm text-gray-600 mb-1">Current ZOD Total Supply</p>
        <p className="text-3xl font-bold text-purple-600">{zodSupply} ZOD</p>
        {Number(zodSupply) === 0 && (
          <p className="text-xs text-red-600 mt-1">⚠️ No supply yet - mint initial tokens!</p>
        )}
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Amount to Mint
          </label>
          <input
            type="number"
            value={mintAmount}
            onChange={(e) => setMintAmount(e.target.value)}
            placeholder="Enter amount (e.g. 100000)"
            className="input-field"
            disabled={isMinting}
          />
          <p className="text-xs text-gray-500 mt-1">
            Recommended: 100,000 ZOD for initial bootstrap
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Mint To Address
          </label>
          <input
            type="text"
            value={mintTo}
            onChange={(e) => setMintTo(e.target.value)}
            placeholder="0x... (your address or pool address)"
            className="input-field"
            disabled={isMinting}
          />
          <div className="flex gap-2 mt-2">
            <button
              onClick={() => setMintTo(account)}
              className="text-xs bg-gray-200 hover:bg-gray-300 px-3 py-1 rounded"
            >
              Use My Address
            </button>
            <button
              onClick={() => setMintTo(CONTRACTS.POOL)}
              className="text-xs bg-blue-200 hover:bg-blue-300 px-3 py-1 rounded"
            >
              Use Pool Address
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            💡 Tip: Mint to your address, then add liquidity to pool
          </p>
        </div>

        <button
          onClick={handleMint}
          disabled={isMinting || !mintAmount || !mintTo}
          className="btn-primary w-full"
        >
          {isMinting ? 'Minting...' : '🔨 Mint ZOD Tokens'}
        </button>

        {txHash && (
          <div className="bg-blue-50 border border-blue-200 rounded p-3">
            <p className="text-sm text-gray-700">
              Transaction Hash:{' '}
              <a
                href={`https://bscscan.com/tx/${txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline font-mono text-xs"
              >
                {txHash.slice(0, 10)}...{txHash.slice(-8)}
              </a>
            </p>
          </div>
        )}
      </div>

      <div className="mt-4 bg-yellow-50 border border-yellow-300 rounded p-3">
        <p className="text-xs text-gray-700">
          <strong>Bootstrap Steps:</strong>
        </p>
        <ol className="text-xs text-gray-700 mt-2 space-y-1 list-decimal list-inside">
          <li>Mint initial ZOD tokens (e.g. 100,000 ZOD) to your address</li>
          <li>Add USDT liquidity to the pool (in the Pool section)</li>
          <li>Now the floor price will be calculated (USDT / ZOD supply)</li>
          <li>Users can now buy mining power!</li>
        </ol>
      </div>
    </div>
  );
};

export default AdminBootstrap;
