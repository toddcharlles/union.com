import React from 'react';

const Whitepaper = ({ onClose }) => {
  return (
    <div className="fixed inset-0 z-[100] bg-gray-900 overflow-y-auto">
      {/* Header */}
      <div className="bg-gray-800 border-b border-gray-700 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-xl font-bold text-white">Whitepaper UNION (ZOD)</h1>
          <button
            onClick={onClose}
            className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
          >
            Voltar
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
              Ecossistema Cripto Sustentavel e Anti-Quedas
            </p>
          </div>

          {/* Section 1 */}
          <section className="mb-10">
            <h2 className="text-2xl font-bold text-gray-800 mb-4 border-b-2 border-blue-500 pb-2">
              1. Introducao
            </h2>
            <p className="text-gray-700 mb-4 leading-relaxed">
              Bem-vindo ao UNION (ZOD), um ecossistema cripto projetado para proteger os investidores das
              quedas brutais que assolam o mercado tradicional. Inspirado na ideia de que "nenhuma unidade
              deve continuar a existir se foi retirado o lastro dela", o ZOD foi criado para promover valorizacao
              constante, sustentabilidade e distribuicao justa de riqueza.
            </p>
            <p className="text-gray-700 mb-4 leading-relaxed">
              Deployado na blockchain, o ZOD transforma vendas em
              oportunidades de crescimento, incentivando a comunidade a crescer junta.
            </p>
            <p className="text-gray-700 leading-relaxed">
              O UNION (ZOD) nao e so um token - e um sistema auto-suficiente onde cada usuario e responsavel
              pela emissao de tokens e injecao de liquidez, eliminando a dependencia de administradores centrais.
            </p>
          </section>

          {/* Section 2 */}
          <section className="mb-10">
            <h2 className="text-2xl font-bold text-gray-800 mb-4 border-b-2 border-red-500 pb-2">
              2. O Problema no Mercado Cripto Atual
            </h2>
            <ul className="space-y-3">
              <li className="flex items-start gap-3">
                <span className="text-red-500 mt-1">•</span>
                <span className="text-gray-700">Quedas drasticas e dumps causados por AMMs tradicionais que ignoram o supply total.</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-red-500 mt-1">•</span>
                <span className="text-gray-700">Falta de lastro real e diluicao do valor do token.</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-red-500 mt-1">•</span>
                <span className="text-gray-700">Concentracao de riqueza no topo das redes de referral.</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-red-500 mt-1">•</span>
                <span className="text-gray-700">Dependencia de administradores e risco de manipulacao.</span>
              </li>
            </ul>
            <p className="text-gray-700 mt-4 leading-relaxed">
              O resultado sao perdas para investidores comuns. O UNION (ZOD) resolve isso com estabilidade,
              queima automatica e redistribuicao justa.
            </p>
          </section>

          {/* Section 3 */}
          <section className="mb-10">
            <h2 className="text-2xl font-bold text-gray-800 mb-4 border-b-2 border-green-500 pb-2">
              3. A Solucao: Ecossistema UNION (ZOD)
            </h2>
            <p className="text-gray-700 mb-6 leading-relaxed">
              O UNION (ZOD) e um sistema integrado de contratos inteligentes onde cada venda fortalece o token
              e o crescimento e comunitario.
            </p>

            {/* Subsection 3.1 */}
            <div className="bg-blue-50 rounded-lg p-5 mb-4 border border-blue-200">
              <h3 className="text-lg font-bold text-blue-800 mb-3">3.1 Pool On-Chain como Cofre Coletivo</h3>
              <ul className="space-y-2 text-gray-700">
                <li>• Preco baseado no USDT total dividido pelo supply circulante.</li>
                <li>• Venda garantida a qualquer momento.</li>
                <li>• Taxa de venda de 15% com queima imediata.</li>
              </ul>
            </div>

            {/* Subsection 3.2 */}
            <div className="bg-purple-50 rounded-lg p-5 mb-4 border border-purple-200">
              <h3 className="text-lg font-bold text-purple-800 mb-3">3.2 Emissao e Mineracao Auto-Suficiente</h3>
              <ul className="space-y-2 text-gray-700">
                <li>• Mineracao via injecao direta de USDT.</li>
                <li>• Ciclos de mineracao de 7 dias.</li>
                <li>• Licenca de rede de 30 dias (25 USDT - 100% para liquidez).</li>
              </ul>
            </div>

            {/* Subsection 3.3 */}
            <div className="bg-green-50 rounded-lg p-5 mb-4 border border-green-200">
              <h3 className="text-lg font-bold text-green-800 mb-3">3.3 Rede de Referral Unilevel com Limite</h3>
              <ul className="space-y-2 text-gray-700">
                <li>• Ate 5 afiliados diretos por no.</li>
                <li>• Spillover BFS automatico.</li>
                <li>• Redistribuicao progressiva dos ganhos.</li>
              </ul>
            </div>

            {/* Subsection 3.4 */}
            <div className="bg-amber-50 rounded-lg p-5 border border-amber-200">
              <h3 className="text-lg font-bold text-amber-800 mb-3">3.4 Redistribuicao e Imposto nos Ganhos</h3>
              <ul className="space-y-2 text-gray-700">
                <li>• Imposto mensal progressivo de 0,5% a 4%.</li>
                <li>• Redistribuicao para a base ativa.</li>
                <li>• Janelas temporais claras para registro e claim.</li>
              </ul>
            </div>
          </section>

          {/* Section 4 */}
          <section className="mb-10">
            <h2 className="text-2xl font-bold text-gray-800 mb-4 border-b-2 border-purple-500 pb-2">
              4. Tokenomics do ZOD
            </h2>
            <div className="bg-gray-50 rounded-lg p-5 border border-gray-200">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-500">Nome</p>
                  <p className="font-semibold text-gray-800">Zodplay (ZOD)</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Contrato ZOD</p>
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
                <p className="text-gray-700 mb-2"><strong>Queima automatica</strong> em vendas.</p>
                <p className="text-gray-700"><strong>Distribuicao:</strong> 80% usuarios, 10% afiliados, 10% protocolo.</p>
              </div>
            </div>
          </section>

          {/* Section 5 */}
          <section className="mb-10">
            <h2 className="text-2xl font-bold text-gray-800 mb-4 border-b-2 border-teal-500 pb-2">
              5. Beneficios e Sustentabilidade
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-teal-50 rounded-lg p-4 border border-teal-200">
                <p className="font-semibold text-teal-800">Anti-quedas por design</p>
              </div>
              <div className="bg-teal-50 rounded-lg p-4 border border-teal-200">
                <p className="font-semibold text-teal-800">Inclusao da base</p>
              </div>
              <div className="bg-teal-50 rounded-lg p-4 border border-teal-200">
                <p className="font-semibold text-teal-800">Auto-suficiencia total</p>
              </div>
              <div className="bg-teal-50 rounded-lg p-4 border border-teal-200">
                <p className="font-semibold text-teal-800">Seguranca e escalabilidade</p>
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
                  <p className="font-semibold text-gray-800">Fase 1: Deploy e lancamento</p>
                  <p className="text-sm text-green-600">Concluido</p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <div className="bg-indigo-500 text-white rounded-full w-8 h-8 flex items-center justify-center font-bold shrink-0">2</div>
                <div>
                  <p className="font-semibold text-gray-800">Fase 2: Validacao total do sistema economico</p>
                  <p className="text-sm text-blue-600">Em andamento</p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <div className="bg-indigo-500 text-white rounded-full w-8 h-8 flex items-center justify-center font-bold shrink-0">3</div>
                <div>
                  <p className="font-semibold text-gray-800">Fase 3: Renuncia completa do ecossistema</p>
                  <p className="text-sm text-gray-500">Futuro</p>
                </div>
              </div>
            </div>
            <div className="mt-4 bg-green-100 border border-green-300 rounded-lg p-3">
              <p className="text-sm text-green-800">
                <strong>Obs:</strong> Pool de liquidez ja renunciada.
              </p>
            </div>
          </section>

          {/* Section 7 */}
          <section className="mb-6">
            <h2 className="text-2xl font-bold text-gray-800 mb-4 border-b-2 border-gray-500 pb-2">
              7. Conclusao
            </h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              O UNION ZOD e uma ideologia transformada em codigo. Um sistema onde vendas fortalecem, a
              base e nutrida e o crescimento e coletivo.
            </p>
            <div className="text-center mt-8 p-6 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-xl">
              <p className="text-white font-bold text-lg">Equipe UNION Zod</p>
              <p className="text-white text-opacity-80 text-sm mt-1">
                Construindo um mercado mais justo, uma queima por vez
              </p>
            </div>
          </section>

        </div>
      </div>
    </div>
  );
};

export default Whitepaper;
