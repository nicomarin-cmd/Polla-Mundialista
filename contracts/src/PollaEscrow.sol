// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title PollaEscrow
 * @notice Custodia stablecoins (USDC/USDT/cUSD en Celo) por polla.
 *         El operador (EOA de la plataforma) distribuye a ganadores o cancela y reembolsa.
 *
 * Flujo normal:
 *   1. Usuario: token.approve(escrow, monto) → escrow.deposit(pollId, token, monto)
 *   2. Cierre:  operador llama distribute(pollId, winners, bps)
 *
 * Flujo cancelación:
 *   1. operador llama cancel(pollId)
 *   2. operador llama refundFor(pollId, wallet) por cada participante
 *      (o usuario llama refund(pollId) por su cuenta)
 *
 * pollId = keccak256(UTF-8 de la UUID de Supabase)
 */
contract PollaEscrow is ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant FEE_BPS = 500;   // 5%
    uint256 public constant BPS     = 10_000;

    address public operator;
    address public feeTreasury;

    struct PollData {
        address token;
        uint256 total;
        bool    distributed;
        bool    cancelled;
    }

    mapping(bytes32 => PollData)                        public polls;
    mapping(bytes32 => mapping(address => uint256))     public balances;

    // ── Events ────────────────────────────────────────────────────────────────
    event Deposited(bytes32 indexed pollId, address indexed user, uint256 amount);
    event Distributed(bytes32 indexed pollId, address[] winners, uint256[] amounts, uint256 fee);
    event Cancelled(bytes32 indexed pollId);
    event Refunded(bytes32 indexed pollId, address indexed user, uint256 amount);
    event OperatorChanged(address indexed prev, address indexed next);
    event TreasuryChanged(address indexed prev, address indexed next);

    modifier onlyOperator() {
        require(msg.sender == operator, "Only operator");
        _;
    }

    constructor(address _operator, address _feeTreasury) {
        require(_operator    != address(0), "Zero operator");
        require(_feeTreasury != address(0), "Zero treasury");
        operator    = _operator;
        feeTreasury = _feeTreasury;
    }

    // ── Core ──────────────────────────────────────────────────────────────────

    /**
     * @notice Depositar stablecoins en el escrow para una polla.
     *         Requiere approve previo del token ERC-20.
     */
    function deposit(bytes32 pollId, address token, uint256 amount)
        external
        nonReentrant
    {
        require(amount > 0, "Amount = 0");
        PollData storage poll = polls[pollId];
        require(!poll.distributed && !poll.cancelled, "Poll ended");

        if (poll.token == address(0)) {
            poll.token = token;
        } else {
            require(poll.token == token, "Token mismatch");
        }

        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        balances[pollId][msg.sender] += amount;
        poll.total += amount;

        emit Deposited(pollId, msg.sender, amount);
    }

    /**
     * @notice Distribuir el bote a los ganadores. Solo el operador.
     * @param winners     Addresses de ganadores en orden de puesto (puede ser address(0) si no hay wallet)
     * @param winnerBps   Porcentaje de cada ganador en BPS sobre el premio neto. Debe sumar 10 000.
     *
     * La fee (5%) + shares de winners sin wallet van al feeTreasury.
     */
    function distribute(
        bytes32         pollId,
        address[] calldata winners,
        uint256[] calldata winnerBps
    )
        external
        onlyOperator
        nonReentrant
    {
        require(winners.length > 0 && winners.length == winnerBps.length, "Bad args");
        PollData storage poll = polls[pollId];
        require(!poll.distributed && !poll.cancelled, "Poll ended");
        require(poll.total > 0, "Empty poll");

        poll.distributed = true;

        uint256 fee   = (poll.total * FEE_BPS) / BPS;
        uint256 prize = poll.total - fee;

        uint256[] memory amounts = new uint256[](winners.length);
        uint256 totalSent = 0;

        for (uint256 i = 0; i < winners.length; i++) {
            uint256 amt = (prize * winnerBps[i]) / BPS;
            amounts[i] = amt;
            if (amt > 0 && winners[i] != address(0)) {
                IERC20(poll.token).safeTransfer(winners[i], amt);
                totalSent += amt;
            }
        }

        // Fee + rounding dust + shares de ganadores sin wallet → treasury
        uint256 toTreasury = poll.total - totalSent;
        if (toTreasury > 0) {
            IERC20(poll.token).safeTransfer(feeTreasury, toTreasury);
        }

        emit Distributed(pollId, winners, amounts, fee);
    }

    /**
     * @notice Cancelar una polla. Solo el operador.
     *         Después llamar refundFor() por cada participante.
     */
    function cancel(bytes32 pollId) external onlyOperator {
        PollData storage poll = polls[pollId];
        require(!poll.distributed && !poll.cancelled, "Poll ended");
        poll.cancelled = true;
        emit Cancelled(pollId);
    }

    /**
     * @notice El operador reembolsa a un usuario tras cancelación.
     */
    function refundFor(bytes32 pollId, address user)
        external
        onlyOperator
        nonReentrant
    {
        PollData storage poll = polls[pollId];
        require(poll.cancelled, "Not cancelled");
        uint256 amount = balances[pollId][user];
        if (amount == 0) return;
        balances[pollId][user] = 0;
        poll.total -= amount;
        IERC20(poll.token).safeTransfer(user, amount);
        emit Refunded(pollId, user, amount);
    }

    /**
     * @notice Auto-reembolso por el propio usuario tras cancelación.
     */
    function refund(bytes32 pollId) external nonReentrant {
        PollData storage poll = polls[pollId];
        require(poll.cancelled, "Not cancelled");
        uint256 amount = balances[pollId][msg.sender];
        require(amount > 0, "Nothing to refund");
        balances[pollId][msg.sender] = 0;
        poll.total -= amount;
        IERC20(poll.token).safeTransfer(msg.sender, amount);
        emit Refunded(pollId, msg.sender, amount);
    }

    // ── Views ─────────────────────────────────────────────────────────────────

    function getBalance(bytes32 pollId, address user) external view returns (uint256) {
        return balances[pollId][user];
    }

    function getPoll(bytes32 pollId)
        external
        view
        returns (address token, uint256 total, bool distributed, bool cancelled)
    {
        PollData storage p = polls[pollId];
        return (p.token, p.total, p.distributed, p.cancelled);
    }

    // ── Admin ─────────────────────────────────────────────────────────────────

    function setOperator(address _operator) external onlyOperator {
        require(_operator != address(0), "Zero address");
        emit OperatorChanged(operator, _operator);
        operator = _operator;
    }

    function setFeeTreasury(address _feeTreasury) external onlyOperator {
        require(_feeTreasury != address(0), "Zero address");
        emit TreasuryChanged(feeTreasury, _feeTreasury);
        feeTreasury = _feeTreasury;
    }
}
