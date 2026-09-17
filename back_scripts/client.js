import { createPublicClient, createWalletClient, http, webSocket, formatUnits, parseUnits } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import * as chains from "viem/chains";
import dotenv from "dotenv";

dotenv.config();

export const config = {
  rpcUrl: process.env.RPC_URL || "http://127.0.0.1:8545",
  chainId: Number(process.env.CHAIN_ID) || 31337,
  contractAddress: process.env.NFT_MARKET_ADDRESS || "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0",
  calledTokenAddress: process.env.CALLED_TOKEN_ADDRESS || "0x5FbDB2315678afecb367f032d93F642f64180aa3",
  nftContractAddress: process.env.NFT_CONTRACT_ADDRESS || "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512",
  pollingInterval: Number(process.env.POLLING_INTERVAL) || 2000,
  tokenDecimals: Number(process.env.TOKEN_DECIMALS) || 18,
  sellerPrivateKey: process.env.SELLER_PRIVATE_KEY || "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
  buyerPrivateKey: process.env.BUYER_PRIVATE_KEY || "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
};

// 自动匹配已知链，若无匹配则根据 chainId 创建自定义链配置
function resolveChain(chainId) {
  for (const chain of Object.values(chains)) {
    if (chain?.id === chainId) {
      return chain;
    }
  }

  // 默认 fallback（如本地 anvil 链）
  return {
    id: chainId,
    name: `CustomChain-${chainId}`,
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: {
      default: { http: [config.rpcUrl] },
      public: { http: [config.rpcUrl] },
    },
  };
}

export const activeChain = resolveChain(config.chainId);

// 根据 RPC URL scheme 自动选择 http 还是 websocket 传输协议
export const transport = config.rpcUrl.startsWith("ws://") || config.rpcUrl.startsWith("wss://")
  ? webSocket(config.rpcUrl)
  : http(config.rpcUrl);

export const publicClient = createPublicClient({
  chain: activeChain,
  transport,
  pollingInterval: config.pollingInterval,
});

/**
 * 根据私钥创建 WalletClient
 * @param {`0x${string}`} privateKey
 */
export function createWallet(privateKey) {
  const account = privateKeyToAccount(privateKey);
  return createWalletClient({
    account,
    chain: activeChain,
    transport,
  });
}

/**
 * 格式化代币金额显示
 * @param {bigint|number|string} amount
 * @param {number} decimals
 * @returns {string}
 */
export function formatTokenAmount(amount, decimals = config.tokenDecimals) {
  try {
    return formatUnits(BigInt(amount), decimals);
  } catch {
    return amount.toString();
  }
}

/**
 * 将人可读数量转为带精度的 BigInt
 * @param {string} amount
 * @param {number} decimals
 * @returns {bigint}
 */
export function parseTokenAmount(amount, decimals = config.tokenDecimals) {
  return parseUnits(amount, decimals);
}
