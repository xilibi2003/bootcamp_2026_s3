import fs from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { publicClient, config, activeChain, formatTokenAmount } from "./client.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 读取 NFTMarket ABI
const abiPath = path.join(__dirname, "abi", "NFTMarket.json");
const nftMarketAbi = JSON.parse(fs.readFileSync(abiPath, "utf-8"));

function getTimestamp() {
  return new Date().toLocaleString();
}

/**
 * 处理 NFTListed (上架) 事件日志
 * @param {import('viem').Log} log
 */
function handleNFTListed(log) {
  const { args, blockNumber, transactionHash } = log;
  const seller = args.seller;
  const tokenId = args.tokenId?.toString();
  const priceRaw = args.price;
  const priceFormatted = formatTokenAmount(priceRaw);

  console.log("\n========================================================");
  console.log(`📢 [NFT 上架事件] - NFTListed`);
  console.log(`⏰ 时间:     ${getTimestamp()}`);
  console.log(`🧱 区块高度: ${blockNumber}`);
  console.log(`🔗 交易哈希: ${transactionHash}`);
  console.log(`🏷️  Token ID: #${tokenId}`);
  console.log(`👤 卖家地址: ${seller}`);
  console.log(`💰 上架价格: ${priceFormatted} 代币 (原始值: ${priceRaw?.toString()})`);
  console.log("========================================================\n");
}

/**
 * 处理 NFTSold (买卖成交) 事件日志
 * @param {import('viem').Log} log
 */
function handleNFTSold(log) {
  const { args, blockNumber, transactionHash } = log;
  const buyer = args.buyer;
  const seller = args.seller;
  const tokenId = args.tokenId?.toString();
  const priceRaw = args.price;
  const priceFormatted = formatTokenAmount(priceRaw);

  console.log("\n========================================================");
  console.log(`🎉 [NFT 成交事件] - NFTSold`);
  console.log(`⏰ 时间:     ${getTimestamp()}`);
  console.log(`🧱 区块高度: ${blockNumber}`);
  console.log(`🔗 交易哈希: ${transactionHash}`);
  console.log(`🏷️  Token ID: #${tokenId}`);
  console.log(`👤 买家地址: ${buyer}`);
  console.log(`👤 卖家地址: ${seller}`);
  console.log(`💰 成交价格: ${priceFormatted} 代币 (原始值: ${priceRaw?.toString()})`);
  console.log("========================================================\n");
}

/**
 * 处理 NFTDelisted (下架) 事件日志（扩展功能）
 * @param {import('viem').Log} log
 */
function handleNFTDelisted(log) {
  const { args, blockNumber, transactionHash } = log;
  const seller = args.seller;
  const tokenId = args.tokenId?.toString();

  console.log("\n--------------------------------------------------------");
  console.log(`ℹ️ [NFT 下架事件] - NFTDelisted`);
  console.log(`⏰ 时间:     ${getTimestamp()}`);
  console.log(`🧱 区块高度: ${blockNumber}`);
  console.log(`🔗 交易哈希: ${transactionHash}`);
  console.log(`🏷️  Token ID: #${tokenId}`);
  console.log(`👤 卖家地址: ${seller}`);
  console.log("--------------------------------------------------------\n");
}

async function startListener() {
  console.log("========================================================");
  console.log("🚀 启动 NFTMarket 合约事件监听服务 (Powered by Viem)");
  console.log("========================================================");
  console.log(`🌐 监听网络:    ${activeChain.name} (ChainID: ${activeChain.id})`);
  console.log(`🔌 RPC 节点:    ${config.rpcUrl}`);
  console.log(`📑 目标合约:    ${config.contractAddress}`);
  console.log(`⏱️ 轮询间隔:    ${config.pollingInterval} ms`);
  console.log("--------------------------------------------------------");

  // 验证与 RPC 的连通性
  try {
    const currentBlock = await publicClient.getBlockNumber();
    console.log(`✅ 成功连接到节点，当前区块高度: #${currentBlock}`);
  } catch (err) {
    console.warn(`⚠️ 无法获取当前区块高度（若本地链未启动可先忽略）: ${err.message}`);
  }

  console.log("👀 正在监听以下事件:");
  console.log("   - NFTListed (上架)");
  console.log("   - NFTSold   (买卖成交)");
  console.log("   - NFTDelisted (下架)");
  console.log("按下 Ctrl+C 退出监听...\n");

  // 1. 监听 NFTListed 事件
  const unwatchListed = publicClient.watchContractEvent({
    address: config.contractAddress,
    abi: nftMarketAbi,
    eventName: "NFTListed",
    onLogs: (logs) => {
      for (const log of logs) {
        handleNFTListed(log);
      }
    },
    onError: (error) => {
      console.error(`❌ [NFTListed 监听异常]:`, error.message || error);
    },
  });

  // 2. 监听 NFTSold 事件
  const unwatchSold = publicClient.watchContractEvent({
    address: config.contractAddress,
    abi: nftMarketAbi,
    eventName: "NFTSold",
    onLogs: (logs) => {
      for (const log of logs) {
        handleNFTSold(log);
      }
    },
    onError: (error) => {
      console.error(`❌ [NFTSold 监听异常]:`, error.message || error);
    },
  });

  // 3. 监听 NFTDelisted 事件
  const unwatchDelisted = publicClient.watchContractEvent({
    address: config.contractAddress,
    abi: nftMarketAbi,
    eventName: "NFTDelisted",
    onLogs: (logs) => {
      for (const log of logs) {
        handleNFTDelisted(log);
      }
    },
    onError: (error) => {
      console.error(`❌ [NFTDelisted 监听异常]:`, error.message || error);
    },
  });

  // 优雅退出
  const cleanup = () => {
    console.log("\n🛑 收到退出信号，正在停止监听...");
    unwatchListed();
    unwatchSold();
    unwatchDelisted();
    console.log("👋 已安全退出。");
    process.exit(0);
  };

  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);
}

startListener().catch((err) => {
  console.error("❌ 启动监听服务失败:", err);
  process.exit(1);
});
