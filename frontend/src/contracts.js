// 合约与链网络配置
export const CONFIG = {
  chainId: 31337,
  chainIdHex: "0x7a69",
  chainName: "Anvil Local",
  rpcUrl: "http://127.0.0.1:8545",
  backendApiUrl: "http://localhost:3001",
  calledTokenAddress: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
  tokenAddress: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
  myPermitTokenAddress: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
  tokenBankAddress: "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512",
  deployerAddress: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
};

// CalledToken / MyPermitToken ABI (包含标准 ERC20、ERC1363 回调与 EIP-2612 Permit)
export const CALLED_TOKEN_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 value) returns (bool)",
  "function transfer(address to, uint256 value) returns (bool)",
  "function transferAndCall(address to, uint256 amount) returns (bool)",
  "function transferAndCall(address to, uint256 amount, bytes data) returns (bool)",
  "function nonces(address owner) view returns (uint256)",
  "function DOMAIN_SEPARATOR() view returns (bytes32)",
  "function permit(address owner, address spender, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s)",
  "event Transfer(address indexed from, address indexed to, uint256 value)",
  "event Approval(address indexed owner, address indexed spender, uint256 value)",
];

// TokenBank ABI (支持传统 deposit、回调 tokensReceived 以及 EIP-2612 permitDeposit)
export const TOKEN_BANK_ABI = [
  "function token() view returns (address)",
  "function balances(address user) view returns (uint256)",
  "function getBalance(address user) view returns (uint256)",
  "function deposit(uint256 amount) external",
  "function permitDeposit(uint256 amount, uint256 deadline, uint8 v, bytes32 r, bytes32 s) external",
  "function permitDeposit(address owner, uint256 amount, uint256 deadline, uint8 v, bytes32 r, bytes32 s) external",
  "function withdraw(uint256 amount) external",
  "function tokensReceived(address from, uint256 amount, bytes data) external returns (bool)",
  "function tokensReceived(address from, uint256 amount) external returns (bool)",
  "function onTokensReceived(address from, uint256 amount, bytes data) external returns (bool)",
  "event Deposit(address indexed user, uint256 amount)",
  "event Withdraw(address indexed user, uint256 amount)",
];
