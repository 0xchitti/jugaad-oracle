// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title JugaadOracle
 * @notice AI Verification Oracle — evaluates agent-to-agent work delivery
 * @dev Stores verification requests and verdicts onchain on Celo
 */
contract JugaadOracle is Ownable {

    enum VerdictStatus { Pending, Pass, Fail }

    struct VerificationRequest {
        address requester;
        bytes32 taskHash;       // keccak256(task description)
        bytes32 deliveryHash;   // keccak256(delivery content)
        uint256 timestamp;
        VerdictStatus status;
        uint8 qualityScore;     // 0-100
        string reasoningCid;    // IPFS CID of detailed reasoning
    }

    uint256 public requestCount;
    uint256 public verificationFee;
    address public oracleOperator;

    // Self Protocol: operator identity attestation
    bool public operatorVerified;
    bytes32 public operatorAttestationId;

    mapping(uint256 => VerificationRequest) public requests;
    mapping(address => uint256[]) public requesterHistory;

    event VerificationRequested(
        uint256 indexed requestId,
        address indexed requester,
        bytes32 taskHash,
        bytes32 deliveryHash
    );

    event VerdictPosted(
        uint256 indexed requestId,
        VerdictStatus status,
        uint8 qualityScore,
        string reasoningCid
    );

    event OperatorVerified(bytes32 attestationId);
    event FeeUpdated(uint256 newFee);

    modifier onlyOperator() {
        require(msg.sender == oracleOperator, "Not oracle operator");
        _;
    }

    constructor(address _operator, uint256 _fee) Ownable(msg.sender) {
        oracleOperator = _operator;
        verificationFee = _fee;
    }

    /**
     * @notice Submit a verification request
     * @param taskHash Hash of the task description
     * @param deliveryHash Hash of the delivery content
     */
    function requestVerification(
        bytes32 taskHash,
        bytes32 deliveryHash
    ) external payable returns (uint256 requestId) {
        require(msg.value >= verificationFee, "Insufficient fee");

        requestId = requestCount++;
        requests[requestId] = VerificationRequest({
            requester: msg.sender,
            taskHash: taskHash,
            deliveryHash: deliveryHash,
            timestamp: block.timestamp,
            status: VerdictStatus.Pending,
            qualityScore: 0,
            reasoningCid: ""
        });

        requesterHistory[msg.sender].push(requestId);

        emit VerificationRequested(requestId, msg.sender, taskHash, deliveryHash);

        // Refund excess
        if (msg.value > verificationFee) {
            (bool ok, ) = payable(msg.sender).call{value: msg.value - verificationFee}("");
            require(ok, "Refund failed");
        }
    }

    /**
     * @notice Post a verdict for a verification request (operator only)
     * @param requestId The request to resolve
     * @param pass Whether the delivery passed verification
     * @param qualityScore Quality score 0-100
     * @param reasoningCid IPFS CID of detailed reasoning
     */
    function postVerdict(
        uint256 requestId,
        bool pass,
        uint8 qualityScore,
        string calldata reasoningCid
    ) external onlyOperator {
        VerificationRequest storage req = requests[requestId];
        require(req.timestamp > 0, "Request does not exist");
        require(req.status == VerdictStatus.Pending, "Already resolved");
        require(qualityScore <= 100, "Score must be 0-100");

        req.status = pass ? VerdictStatus.Pass : VerdictStatus.Fail;
        req.qualityScore = qualityScore;
        req.reasoningCid = reasoningCid;

        emit VerdictPosted(requestId, req.status, qualityScore, reasoningCid);
    }

    /**
     * @notice Set operator identity attestation from Self Protocol
     */
    function setOperatorAttestation(bytes32 _attestationId) external onlyOperator {
        operatorAttestationId = _attestationId;
        operatorVerified = true;
        emit OperatorVerified(_attestationId);
    }

    /**
     * @notice Get verdict for a request (for escrow contracts to read)
     */
    function getVerdict(uint256 requestId) external view returns (
        VerdictStatus status,
        uint8 qualityScore,
        string memory reasoningCid
    ) {
        VerificationRequest storage req = requests[requestId];
        return (req.status, req.qualityScore, req.reasoningCid);
    }

    /**
     * @notice Check if a request passed verification
     */
    function isPassed(uint256 requestId) external view returns (bool) {
        return requests[requestId].status == VerdictStatus.Pass;
    }

    function updateFee(uint256 _newFee) external onlyOwner {
        verificationFee = _newFee;
        emit FeeUpdated(_newFee);
    }

    function updateOperator(address _newOperator) external onlyOwner {
        oracleOperator = _newOperator;
    }

    function withdraw() external onlyOwner {
        (bool ok, ) = payable(owner()).call{value: address(this).balance}("");
        require(ok, "Withdraw failed");
    }

    function getRequesterHistory(address requester) external view returns (uint256[] memory) {
        return requesterHistory[requester];
    }
}
