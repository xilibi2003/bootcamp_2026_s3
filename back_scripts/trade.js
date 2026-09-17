import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  publicClient,
  createWallet,
  config,
  parseTokenAmount,
  formatTokenAmount,
} from "./client.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 加载 ABI
const nftMarketAbi = JSON.parse(fs.readFileSync(path.join(__dirname, "abi", "NFTMarket.json"), "utf-8"));
const calledTokenAbi = JSON.parse(fs.readFileSync(path.join(__dirname, "abi", "CalledToken.json"), "utf-8"));
const myErc721Abi = JSON.parse(fs.readFileSync(path.join(__dirname, "abi", "MyERC721.json"), "utf-8"));

// 简单的延时函数
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  console.log("========================================================");
  console.log("🛒 开始执行 NFT 铸造、上架与购买流程 (模拟测试脚本)");
  console.log("========================================================");

  // 1. 初始化卖家与买家钱包
  const sellerWallet = createWallet(config.sellerPrivateKey);
  const buyerWallet = createWallet(config.buyerPrivateKey);

  const sellerAddress = sellerWallet.account.address;
  const buyerAddress = buyerWallet.account.address;

  console.log(`👤 卖家地址: ${sellerAddress}`);
  console.log(`👤 买家地址: ${buyerAddress}`);
  console.log(`📑 市场合约: ${config.contractAddress}`);
  console.log(`🪙 支付代币: ${config.calledTokenAddress}`);
  console.log(`🎨 NFT 合约: ${config.nftContractAddress}`);
  console.log("--------------------------------------------------------\n");

  // 上架价格：50 代币
  const listPrice = parseTokenAmount("50");
  const tokenURI = "ipfs://bafkreidztoogyu7uccbgm2vx7mhp5m3n25qwy4jnp7cep7ckos23g4lk7a";

  // ==========================================
  // 步骤 1: 卖家铸造 NFT
  // ==========================================
  console.log("🎨 [步骤 1/4] 卖家正在铸造 NFT...");
  const mintTxHash = await sellerWallet.writeContract({
    address: config.nftContractAddress,
    abi: myErc721Abi,
    functionName: "mint",
    args: [sellerAddress, tokenURI],
  });
  console.log(`   ⏳ 铸造交易已提交: ${mintTxHash}`);
  const mintReceipt = await publicClient.waitForTransactionReceipt({ hash: mintTxHash });

  // 从 Transfer 事件日志中解析出 tokenId (Transfer(address,address,uint256))
  // ERC721 Transfer topic: Transfer(from, to, tokenId)
  let tokenId = 1n;
  for (const log of mintReceipt.logs) {
    if (log.topics && log.topics.length === 4) {
      tokenId = BigInt(log.topics[3]);
      break;
    }
  }
  console.log(`   ✅ 铸造成功！新 NFT Token ID: #${tokenId.toString()}`);
  console.log(`   🧱 包含在区块: #${mintReceipt.blockNumber}\n`);

  // ==========================================
  // 步骤 2: 卖家授权并上架 NFT 到 NFTMarket
  // ==========================================
  console.log(`🔐 [步骤 2/4] 卖家授权 NFT #${tokenId} 给市场合约...`);
  const approveNftTx = await sellerWallet.writeContract({
    address: config.nftContractAddress,
    abi: myErc721Abi,
    functionName: "approve",
    args: [config.contractAddress, tokenId],
  });
  await publicClient.waitForTransactionReceipt({ hash: approveNftTx });
  console.log(`   ✅ NFT 授权成功！`);

  console.log(`📢 卖家正在上架 NFT #${tokenId}，定价 ${formatTokenAmount(listPrice)} 代币...`);
  const listTxHash = await sellerWallet.writeContract({
    address: config.contractAddress,
    abi: nftMarketAbi,
    functionName: "list",
    args: [tokenId, listPrice],
  });
  console.log(`   ⏳ 上架交易已提交: ${listTxHash}`);
  const listReceipt = await publicClient.waitForTransactionReceipt({ hash: listTxHash });
  console.log(`   🎉 NFT 上架成功！触发 NFTListed 事件 (区块 #${listReceipt.blockNumber})`);
  console.log("   👉 此时如果正在运行 index.js 监听器，应已打印出【NFT 上架事件】日志！\n");

  // 等待 3 秒便于用户在监听终端观察上架日志
  console.log("⏳ 等待 3 秒以观察上架事件，随后执行购买...");
  await sleep(3000);

  // ==========================================
  // 步骤 3: 确保买家拥有足够的代币
  // ==========================================
  console.log(`💰 [步骤 3/4] 检查买家支付代币余额...`);
  const buyerBalance = await publicClient.readContract({
    address: config.calledTokenAddress,
    abi: calledTokenAbi,
    functionName: "balanceOf",
    args: [buyerAddress],
  });

  if (buyerBalance < listPrice) {
    const fundAmount = parseTokenAmount("200");
    console.log(`   💸 买家代币余额不足 (${formatTokenAmount(buyerBalance)})，卖家向买家转账 200 代币...`);
    const transferTokenTx = await sellerWallet.writeContract({
      address: config.calledTokenAddress,
      abi: calledTokenAbi,
      functionName: "transfer",
      args: [buyerAddress, fundAmount],
    });
    await publicClient.waitForTransactionReceipt({ hash: transferTokenTx });
    console.log(`   ✅ 买家已收到代币，当前余额充足！\n`);
  } else {
    console.log(`   ✅ 买家代币余额充足 (${formatTokenAmount(buyerBalance)} 代币)\n`);
  }

  // ==========================================
  // 步骤 4: 买家购买 NFT (通过传统 approve + buyNFT)
  // ==========================================
  console.log(`🛒 [步骤 4/4] 买家授权代币并购买 NFT #${tokenId}...`);
  const approveTokenTx = await buyerWallet.writeContract({
    address: config.calledTokenAddress,
    abi: calledTokenAbi,
    functionName: "approve",
    args: [config.contractAddress, listPrice],
  });
  await publicClient.waitForTransactionReceipt({ hash: approveTokenTx });
  console.log(`   ✅ 买家代币授权完成！`);

  console.log(`   💳 买家发起购买 (buyNFT)...`);
  const buyTxHash = await buyerWallet.writeContract({
    address: config.contractAddress,
    abi: nftMarketAbi,
    functionName: "buyNFT",
    args: [tokenId, listPrice],
  });
  console.log(`   ⏳ 购买交易已提交: ${buyTxHash}`);
  const buyReceipt = await publicClient.waitForTransactionReceipt({ hash: buyTxHash });
  console.log(`   🎉 NFT 购买成功！触发 NFTSold 事件 (区块 #${buyReceipt.blockNumber})`);
  console.log("   👉 此时如果正在运行 index.js 监听器，应已打印出【NFT 成交事件】日志！\n");

  // 验证归属
  const newOwner = await publicClient.readContract({
    address: config.nftContractAddress,
    abi: myErc721Abi,
    functionName: "ownerOf",
    args: [tokenId],
  });

  console.log("========================================================");
  console.log(`🏆 流程全部执行完毕！`);
  console.log(`🏷️  Token ID #${tokenId} 的最终拥有者: ${newOwner}`);
  console.log(`✨ 是否为买家: ${newOwner.toLowerCase() === buyerAddress.toLowerCase() ? "是 (购买验证通过)" : "否"}`);
  console.log("========================================================");
}

main().catch((error) => {
  console.error("❌ 执行交易流程失败:", error);
  process.exit(1);
});
