// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title ZpmReferralNetwork
 * @notice Contrato imutável que gerencia exclusivamente a estrutura de rede de afiliação.
 *         - Cada nó pode ter no máximo cinco afiliados diretos (total, incluindo inativos).
 *         - Novos usuários são alocados diretamente ao indicador original se houver espaço,
 *           ou derramados (spillover) via BFS para o primeiro nó com menos de cinco afiliados.
 *         - A atividade do usuário (ativo/inativo) NÃO afeta a alocação de novos afiliados.
 *         - Fallbacks recebem apenas usuários sem indicador válido ou com rede saturada.
 *         - Registro só é permitido via contrato econômico após ação econômica real.
 * 
 * ⚠️ LIMITAÇÃO DE PROFUNDIDADE BFS:
 * A busca em largura (BFS) utiliza fila fixa de 256 slots para controle de custo gas.
 * Isso limita a busca a aproximadamente 3 níveis de profundidade (1 + 5 + 25 + 125 = 156 nós).
 * Após 256 nós explorados, a busca para silenciosamente para evitar estouro de gas.
 * Esta limitação é intencional para manter custos previsíveis em redes grandes.
 * Recomenda-se monitorar saturação dos fallbacks e expandir rede organicamente.
 */
contract ZpmReferralNetwork {
    // === PARÂMETROS FIXOS ===
    uint256 public constant MAXIMUM_DIRECT_REFERRALS_PER_NODE = 5;

    // === ENDEREÇOS DE CONTROLE ===
    address public immutable owner;
    address public economyContractAddress;

    // === ENDEREÇOS DE FALLBACK PARA REDE ÓRFÃ ===
    address public fallbackAddressOne;
    address public fallbackAddressTwo;
    uint256 private fallbackRoundRobinCounter;

    // === MAPEAMENTOS DE REDE ===
    mapping(address => address) public referrerOf;
    mapping(address => address[]) public referralsOf;
    mapping(address => bool) public isUserRegistered;
    uint256 public totalRegisteredUsers;

    // === EVENTOS ===
    event UserSuccessfullyRegistered(
        address indexed newUser,
        address indexed originalReferrer,
        address indexed assignedUpline
    );
    event FallbackUplineAssigned(
        address indexed newUser,
        address indexed fallbackUpline
    );
    event EconomyContractUpdated(address indexed newEconomyContract);
    event FallbackAddressesConfigured(
        address indexed firstFallbackAddress,
        address indexed secondFallbackAddress
    );

    // === MODIFICADOR DE SEGURANÇA ===
    modifier onlyOwner() {
        require(msg.sender == owner, "ZPM_REFERRAL_NETWORK: CALLER_IS_NOT_OWNER");
        _;
    }

    modifier onlyEconomyContract() {
        require(msg.sender == economyContractAddress, "ZPM_REFERRAL_NETWORK: ONLY_ECONOMY_CONTRACT_ALLOWED");
        _;
    }

    /**
     * @dev Construtor do contrato.
     * @param _owner Endereço do proprietário responsável pela integração inicial.
     */
    constructor(address _owner) {
        require(_owner != address(0), "ZPM_REFERRAL_NETWORK: OWNER_ADDRESS_CANNOT_BE_ZERO");
        owner = _owner;
    }

    /**
     * @dev Configura os dois endereços de fallback para rede órfã.
     *      Estes endereços receberão usuários que não puderem ser alocados na rede principal.
     *      Só pode ser configurado uma vez pelo proprietário.
     * @param _firstFallbackAddress Primeiro endereço de fallback.
     * @param _secondFallbackAddress Segundo endereço de fallback.
     */
    function configureFallbackAddresses(
        address _firstFallbackAddress,
        address _secondFallbackAddress
    ) external onlyOwner {
        require(_firstFallbackAddress != address(0), "ZPM_REFERRAL_NETWORK: FIRST_FALLBACK_ADDRESS_CANNOT_BE_ZERO");
        require(_secondFallbackAddress != address(0), "ZPM_REFERRAL_NETWORK: SECOND_FALLBACK_ADDRESS_CANNOT_BE_ZERO");
        require(_firstFallbackAddress != _secondFallbackAddress, "ZPM_REFERRAL_NETWORK: FALLBACK_ADDRESSES_MUST_BE_DIFFERENT");
        require(fallbackAddressOne == address(0), "ZPM_REFERRAL_NETWORK: FALLBACK_ADDRESSES_ALREADY_CONFIGURED");
        fallbackAddressOne = _firstFallbackAddress;
        fallbackAddressTwo = _secondFallbackAddress;
        emit FallbackAddressesConfigured(_firstFallbackAddress, _secondFallbackAddress);
    }

    /**
     * @dev Atualiza o endereço do contrato econômico.
     * @param _economyContract Novo endereço do contrato econômico.
     */
    function setEconomyContractAddress(address _economyContract) external onlyOwner {
        require(_economyContract != address(0), "ZPM_REFERRAL_NETWORK: ECONOMY_CONTRACT_CANNOT_BE_ZERO");
        economyContractAddress = _economyContract;
        emit EconomyContractUpdated(_economyContract);
    }

    /**
     * @dev Registra um novo usuário na rede, mas APENAS quando chamado pelo contrato econômico.
     *      Este é o único ponto de entrada para registro na rede.
     * @param newUser Endereço do novo usuário.
     * @param originalReferrer Endereço do indicador original fornecido na compra.
     */
    function registerUserFromEconomy(address newUser, address originalReferrer) external onlyEconomyContract {
        require(newUser != address(0), "NEW_USER_CANNOT_BE_ZERO");
        require(!isUserRegistered[newUser], "USER_ALREADY_REGISTERED");

        isUserRegistered[newUser] = true;
        totalRegisteredUsers += 1;

        address finalAssignedUpline = address(0);

        // Caso especial: Conta Raiz (originalReferrer == 0x0)
        if (originalReferrer == address(0)) {
            // Permite que a Conta Principal se registre como raiz
            // Nenhum upline é atribuído
            finalAssignedUpline = address(0);
        }
        // Caso normal: tenta alocar sob um referrer válido
        else if (isUserRegistered[originalReferrer]) {
            finalAssignedUpline = _findFirstEligibleNodeForSpillover(originalReferrer);
        }

        // Se não encontrou upline (exceto raiz), usa fallback com BFS aprimorado
        if (finalAssignedUpline == address(0) && originalReferrer != address(0)) {
            finalAssignedUpline = _getFallbackUplineForOrphanUser();
            if (finalAssignedUpline != address(0)) {
                emit FallbackUplineAssigned(newUser, finalAssignedUpline);
            }
        }

        if (finalAssignedUpline != address(0)) {
            referrerOf[newUser] = finalAssignedUpline;
            referralsOf[finalAssignedUpline].push(newUser);
        }

        emit UserSuccessfullyRegistered(newUser, originalReferrer, finalAssignedUpline);
    }

    /**
     * @dev Função interna que implementa o derramamento via busca em largura (BFS).
     *      Procura o primeiro nó na rede descendente do root que tenha menos de cinco afiliados diretos.
     * 
     * ⚠️ LIMITAÇÃO: Fila fixa de 256 slots (aprox. 3 níveis de profundidade com 5 filhos/nó).
     * Após 256 nós explorados, a busca para silenciosamente para evitar estouro de gas.
     * Esta limitação é intencional para manter custos previsíveis em redes grandes.
     */
    function _findFirstEligibleNodeForSpillover(address rootReferrer) internal view returns (address) {
        if (referralsOf[rootReferrer].length < MAXIMUM_DIRECT_REFERRALS_PER_NODE) {
            return rootReferrer;
        }

        address[256] memory breadthFirstSearchQueue; // ⚠️ Fila fixa de 256 slots para controle de gas
        uint256 queueHeadIndex = 0;
        uint256 queueTailIndex = 0;

        address[] storage directChildrenOfRoot = referralsOf[rootReferrer];
        for (uint256 i = 0; i < directChildrenOfRoot.length && queueTailIndex < 256; i++) {
            breadthFirstSearchQueue[queueTailIndex] = directChildrenOfRoot[i];
            queueTailIndex += 1;
        }

        while (queueHeadIndex < queueTailIndex) {
            address currentNode = breadthFirstSearchQueue[queueHeadIndex];
            queueHeadIndex += 1;

            if (referralsOf[currentNode].length < MAXIMUM_DIRECT_REFERRALS_PER_NODE) {
                return currentNode;
            }

            address[] storage childrenOfCurrentNode = referralsOf[currentNode];
            for (uint256 i = 0; i < childrenOfCurrentNode.length && queueTailIndex < 256; i++) {
                breadthFirstSearchQueue[queueTailIndex] = childrenOfCurrentNode[i];
                queueTailIndex += 1;
            }
        }

        return address(0); // Retorna 0x0 se não encontrar nó elegível dentro do limite de 256 nós
    }

    /**
     * @dev Retorna o próximo upline de fallback disponível.
     *      Primeiro tenta alocação direta nos fallbacks (round-robin).
     *      Se ambos estiverem saturados diretamente, executa BFS nas subárvores dos fallbacks.
     * 
     * ⚠️ LIMITAÇÃO: BFS nas subárvores respeita o limite de 256 nós por fallback.
     * Se ambas subárvores estiverem saturadas além do limite, retorna address(0).
     * Esta situação é rara e indica rede extremamente grande (>150 usuários por fallback).
     */
    function _getFallbackUplineForOrphanUser() internal returns (address) {
        if (fallbackAddressOne == address(0)) {
            return address(0);
        }

        // Tentativa 1: Alocação direta nos fallbacks (round-robin)
        address directCandidate = _tryDirectFallbackAllocation();
        if (directCandidate != address(0)) {
            return directCandidate;
        }

        // Tentativa 2: BFS na subárvore do fallbackOne
        address bfsCandidate = _findFirstEligibleNodeForSpillover(fallbackAddressOne);
        if (bfsCandidate != address(0)) {
            return bfsCandidate;
        }

        // Tentativa 3: BFS na subárvore do fallbackTwo
        bfsCandidate = _findFirstEligibleNodeForSpillover(fallbackAddressTwo);
        return bfsCandidate; // Retorna address(0) se não encontrar em nenhum fallback
    }

    /**
     * @dev Tenta alocação direta nos fallbacks com round-robin.
     * @return Endereço do fallback com espaço, ou address(0) se ambos saturados diretamente.
     */
    function _tryDirectFallbackAllocation() internal returns (address) {
        if (fallbackRoundRobinCounter == 0) {
            // Prioridade: fallbackOne → fallbackTwo
            if (referralsOf[fallbackAddressOne].length < MAXIMUM_DIRECT_REFERRALS_PER_NODE) {
                fallbackRoundRobinCounter = 1;
                return fallbackAddressOne;
            }
            if (referralsOf[fallbackAddressTwo].length < MAXIMUM_DIRECT_REFERRALS_PER_NODE) {
                fallbackRoundRobinCounter = 1;
                return fallbackAddressTwo;
            }
        } else {
            // Prioridade: fallbackTwo → fallbackOne
            if (referralsOf[fallbackAddressTwo].length < MAXIMUM_DIRECT_REFERRALS_PER_NODE) {
                fallbackRoundRobinCounter = 0;
                return fallbackAddressTwo;
            }
            if (referralsOf[fallbackAddressOne].length < MAXIMUM_DIRECT_REFERRALS_PER_NODE) {
                fallbackRoundRobinCounter = 0;
                return fallbackAddressOne;
            }
        }
        return address(0); // Ambos saturados diretamente
    }

    // === FUNÇÕES PÚBLICAS DE CONSULTA (SEM ALTERAÇÃO) ===

    function getDirectUpline(address user) external view returns (address) {
        return referrerOf[user];
    }

    function getDirectReferralsList(address user) external view returns (address[] memory) {
        return referralsOf[user];
    }

    function getTotalDirectReferralsCount(address user) external view returns (uint256) {
        return referralsOf[user].length;
    }

    function isRegistered(address user) external view returns (bool) {
        return isUserRegistered[user];
    }

    function getTotalUsersCount() external view returns (uint256) {
        return totalRegisteredUsers;
    }
}