import React, { useState, useEffect } from 'react';

const UserRegistration = ({ contracts, account, isCorrectNetwork }) => {
  const [isRegistered, setIsRegistered] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [referrerAddress, setReferrerAddress] = useState('');

  useEffect(() => {
    if (contracts && account && isCorrectNetwork) {
      checkRegistration();

      // Check for referrer in URL params
      const urlParams = new URLSearchParams(window.location.search);
      const ref = urlParams.get('ref');
      if (ref && ref !== account) {
        setReferrerAddress(ref);
      }
    }
  }, [contracts, account, isCorrectNetwork]);

  const checkRegistration = async () => {
    if (!contracts || !account) return;

    setIsLoading(true);
    try {
      const registered = await contracts.referralNetwork.isRegistered(account);
      setIsRegistered(registered);
    } catch (error) {
      console.error('Error checking registration:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegister = async () => {
    if (!contracts || !account) return;

    setIsRegistering(true);
    try {
      // Address(0) if no referrer
      const referrer = referrerAddress || '0x0000000000000000000000000000000000000000';

      const tx = await contracts.referralNetwork.registerNewUser(account, referrer);
      await tx.wait();

      setIsRegistered(true);
      alert('Successfully registered in the network! You can now buy mining power.');
    } catch (error) {
      console.error('Error registering:', error);
      alert(`Error: ${error.message || 'Registration failed'}`);
    } finally {
      setIsRegistering(false);
    }
  };

  if (!account || !isCorrectNetwork) {
    return null;
  }

  if (isLoading) {
    return (
      <div className="card mb-4 sm:mb-6">
        <div className="bg-blue-50 border border-blue-300 rounded-lg p-3">
          <p className="text-sm text-blue-700">⏳ Checking registration status...</p>
        </div>
      </div>
    );
  }

  if (isRegistered) {
    return null; // Don't show anything if already registered
  }

  return (
    <div className="card mb-4 sm:mb-6">
      <h2 className="card-title">📝 Network Registration Required</h2>

      <div className="bg-yellow-50 border border-yellow-300 rounded-lg p-3 sm:p-4 mb-4">
        <p className="text-sm sm:text-base text-yellow-800 mb-2">
          ⚠️ You need to register in the network before you can participate in mining.
        </p>
        <p className="text-xs sm:text-sm text-yellow-700">
          This is a one-time registration. Once registered, you can buy mining power and build your network.
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Referrer Address (Optional)
          </label>
          <input
            type="text"
            value={referrerAddress}
            onChange={(e) => setReferrerAddress(e.target.value)}
            placeholder="0x... (leave empty if you don't have a referrer)"
            className="input-field"
            disabled={isRegistering}
          />
          <p className="text-xs text-gray-500 mt-1">
            If you were invited by someone, enter their address here. Otherwise, leave empty.
          </p>
        </div>

        <button
          onClick={handleRegister}
          disabled={isRegistering}
          className="btn-primary w-full"
        >
          {isRegistering ? 'Registering...' : 'Register in Network'}
        </button>
      </div>
    </div>
  );
};

export default UserRegistration;
