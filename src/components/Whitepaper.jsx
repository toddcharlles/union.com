import React from 'react';

const Whitepaper = ({ onClose }) => {
  return (
    <div className="fixed inset-0 z-[100] bg-gray-900 overflow-y-auto">
      {/* Header */}
      <div className="bg-gray-800 border-b border-gray-700 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-xl font-bold text-white">UNION (ZOD) Whitepaper</h1>
          <button
            onClick={onClose}
            className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
          >
            Back
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="bg-white rounded-xl shadow-xl p-6 sm:p-10">

          {/* Title */}
          <div className="text-center mb-10">
            <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-2">
              Whitepaper: UNION (ZOD)
            </h1>
            <p className="text-lg text-gray-600">
              Sustainable and Anti-Drop Crypto Ecosystem
            </p>
          </div>

          {/* Section 1 */}
          <section className="mb-10">
            <h2 className="text-2xl font-bold text-gray-800 mb-4 border-b-2 border-blue-500 pb-2">
              1. Introduction
            </h2>
            <p className="text-gray-700 mb-4 leading-relaxed">
              Welcome to UNION (ZOD), a crypto ecosystem designed to protect investors from
              the brutal drops that plague the traditional market. Inspired by the idea that "no unit
              should continue to exist if its backing has been removed", ZOD was created to promote constant
              appreciation, sustainability, and fair wealth distribution.
            </p>
            <p className="text-gray-700 mb-4 leading-relaxed">
              Deployed on the blockchain, ZOD transforms sales into
              growth opportunities, encouraging the community to grow together.
            </p>
            <p className="text-gray-700 leading-relaxed">
              UNION (ZOD) is not just a token - it's a self-sufficient system where each user is responsible
              for token issuance and liquidity injection, eliminating dependence on central administrators.
            </p>
          </section>

          {/* Section 2 */}
          <section className="mb-10">
            <h2 className="text-2xl font-bold text-gray-800 mb-4 border-b-2 border-red-500 pb-2">
              2. The Problem in the Current Crypto Market
            </h2>
            <ul className="space-y-3">
              <li className="flex items-start gap-3">
                <span className="text-red-500 mt-1">•</span>
                <span className="text-gray-700">Drastic drops and dumps caused by traditional AMMs that ignore total supply.</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-red-500 mt-1">•</span>
                <span className="text-gray-700">Lack of real backing and token value dilution.</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-red-500 mt-1">•</span>
                <span className="text-gray-700">Wealth concentration at the top of referral networks.</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-red-500 mt-1">•</span>
                <span className="text-gray-700">Dependence on administrators and risk of manipulation.</span>
              </li>
            </ul>
            <p className="text-gray-700 mt-4 leading-relaxed">
              The result is losses for common investors. UNION (ZOD) solves this with stability,
              automatic burning, and fair redistribution.
            </p>
          </section>

          {/* Section 3 */}
          <section className="mb-10">
            <h2 className="text-2xl font-bold text-gray-800 mb-4 border-b-2 border-green-500 pb-2">
              3. The Solution: UNION (ZOD) Ecosystem
            </h2>
            <p className="text-gray-700 mb-6 leading-relaxed">
              UNION (ZOD) is an integrated system of smart contracts where each sale strengthens the token
              and growth is community-driven.
            </p>

            {/* Subsection 3.1 */}
            <div className="bg-blue-50 rounded-lg p-5 mb-4 border border-blue-200">
              <h3 className="text-lg font-bold text-blue-800 mb-3">3.1 On-Chain Pool as Collective Vault</h3>
              <ul className="space-y-2 text-gray-700">
                <li>• Price based on total USDT divided by circulating supply.</li>
                <li>• Guaranteed sale at any time.</li>
                <li>• 15% sale fee with immediate burning.</li>
              </ul>
            </div>

            {/* Subsection 3.2 */}
            <div className="bg-purple-50 rounded-lg p-5 mb-4 border border-purple-200">
              <h3 className="text-lg font-bold text-purple-800 mb-3">3.2 Self-Sufficient Issuance and Mining</h3>
              <ul className="space-y-2 text-gray-700">
                <li>• Mining via direct USDT injection.</li>
                <li>• 7-day mining cycles.</li>
                <li>• 30-day network license (25 USDT - 100% to liquidity).</li>
              </ul>
            </div>

            {/* Subsection 3.3 */}
            <div className="bg-green-50 rounded-lg p-5 mb-4 border border-green-200">
              <h3 className="text-lg font-bold text-green-800 mb-3">3.3 Limited Unilevel Referral Network</h3>
              <ul className="space-y-2 text-gray-700">
                <li>• Up to 5 direct affiliates per node.</li>
                <li>• Automatic BFS spillover.</li>
                <li>• Progressive redistribution of earnings.</li>
              </ul>
            </div>

            {/* Subsection 3.4 */}
            <div className="bg-amber-50 rounded-lg p-5 border border-amber-200">
              <h3 className="text-lg font-bold text-amber-800 mb-3">3.4 Redistribution and Tax on Earnings</h3>
              <ul className="space-y-2 text-gray-700">
                <li>• Progressive monthly tax from 0.5% to 4%.</li>
                <li>• Redistribution to the active base.</li>
                <li>• Clear time windows for registration and claim.</li>
              </ul>
            </div>
          </section>

          {/* Section 4 */}
          <section className="mb-10">
            <h2 className="text-2xl font-bold text-gray-800 mb-4 border-b-2 border-purple-500 pb-2">
              4. ZOD Tokenomics
            </h2>
            <div className="bg-gray-50 rounded-lg p-5 border border-gray-200">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-500">Name</p>
                  <p className="font-semibold text-gray-800">Zodplay (ZOD)</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">ZOD Contract</p>
                  <p className="font-mono text-xs text-gray-800 break-all">0xeD0e0d988DA8C70250671c3b03dCF7249142a045</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Referral Network</p>
                  <p className="font-mono text-xs text-gray-800 break-all">0x8B6d1c9aCcA0879543673C2cf16F316312B9fDC9</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Economy</p>
                  <p className="font-mono text-xs text-gray-800 break-all">0xA9e1f23da4A25Bd566398b6c3cFeDE63b56eeE44</p>
                </div>
              </div>
              <div className="mt-4 pt-4 border-t border-gray-200">
                <p className="text-gray-700 mb-2"><strong>Automatic burning</strong> on sales.</p>
                <p className="text-gray-700"><strong>Distribution:</strong> 80% users, 10% affiliates, 10% protocol.</p>
              </div>
            </div>
          </section>

          {/* Section 5 */}
          <section className="mb-10">
            <h2 className="text-2xl font-bold text-gray-800 mb-4 border-b-2 border-teal-500 pb-2">
              5. Benefits and Sustainability
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-teal-50 rounded-lg p-4 border border-teal-200">
                <p className="font-semibold text-teal-800">Anti-drop by design</p>
              </div>
              <div className="bg-teal-50 rounded-lg p-4 border border-teal-200">
                <p className="font-semibold text-teal-800">Base inclusion</p>
              </div>
              <div className="bg-teal-50 rounded-lg p-4 border border-teal-200">
                <p className="font-semibold text-teal-800">Total self-sufficiency</p>
              </div>
              <div className="bg-teal-50 rounded-lg p-4 border border-teal-200">
                <p className="font-semibold text-teal-800">Security and scalability</p>
              </div>
            </div>
          </section>

          {/* Section 6 */}
          <section className="mb-10">
            <h2 className="text-2xl font-bold text-gray-800 mb-4 border-b-2 border-indigo-500 pb-2">
              6. Roadmap
            </h2>
            <div className="space-y-4">
              <div className="flex items-start gap-4">
                <div className="bg-indigo-500 text-white rounded-full w-8 h-8 flex items-center justify-center font-bold shrink-0">1</div>
                <div>
                  <p className="font-semibold text-gray-800">Phase 1: Deployment and launch</p>
                  <p className="text-sm text-green-600">Completed</p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <div className="bg-indigo-500 text-white rounded-full w-8 h-8 flex items-center justify-center font-bold shrink-0">2</div>
                <div>
                  <p className="font-semibold text-gray-800">Phase 2: Full validation of economic system</p>
                  <p className="text-sm text-blue-600">In progress</p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <div className="bg-indigo-500 text-white rounded-full w-8 h-8 flex items-center justify-center font-bold shrink-0">3</div>
                <div>
                  <p className="font-semibold text-gray-800">Phase 3: Complete ecosystem renunciation</p>
                  <p className="text-sm text-gray-500">Future</p>
                </div>
              </div>
            </div>
            <div className="mt-4 bg-green-100 border border-green-300 rounded-lg p-3">
              <p className="text-sm text-green-800">
                <strong>Note:</strong> Liquidity pool already renounced.
              </p>
            </div>
          </section>

          {/* Section 7 */}
          <section className="mb-6">
            <h2 className="text-2xl font-bold text-gray-800 mb-4 border-b-2 border-gray-500 pb-2">
              7. Conclusion
            </h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              UNION ZOD is an ideology transformed into code. A system where sales strengthen, the
              base is nourished and growth is collective.
            </p>
            <div className="text-center mt-8 p-6 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-xl">
              <p className="text-white font-bold text-lg">UNION Zod Team</p>
              <p className="text-white text-opacity-80 text-sm mt-1">
                Building a fairer market, one burn at a time
              </p>
            </div>
          </section>

        </div>
      </div>
    </div>
  );
};

export default Whitepaper;
