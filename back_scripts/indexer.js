import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import cors from "cors";
import { isAddress } from "viem";
import { publicClient, config, activeChain, formatTokenAmount } from "./client.js";
import { dbInstance } from "./db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 读取 CalledToken ABI
const abiPath = path.join(__dirname, "abi", "CalledToken.json");
const calledTokenAbi = JSON.parse(fs.readFileSync(abiPath, "utf-8"));

// 简单的区块时间戳缓存
const blockTimeCache = new Map();

async function getBlockTimestamp(blockNumber) {
  if (!blockNumber) return Math.floor(Date.now() / 1000);
  const blockNumBig = BigInt(blockNumber);
  if (blockTimeCache.has(blockNumBig.toString())) {
    return blockTimeCache.get(blockNumBig.toString());
  }

  try {
    const block = await publicClient.getBlock({ blockNumber: blockNumBig });
    const ts = Number(block.timestamp);
    blockTimeCache.set(blockNumBig.toString(), ts);
    // 简单控制缓存大小
    if (blockTimeCache.size > 2000) {
      const firstKey = blockTimeCache.keys().next().value;
      blockTimeCache.delete(firstKey);
    }
    return ts;
  } catch {
    return Math.floor(Date.now() / 1000);
  }
}

/**
 * 解析并格式化 Transfer 事件日志
 */
export async function parseTransferLog(log) {
  const { args, blockNumber, blockHash, transactionHash, logIndex, address } = log;
  const from = args.from;
  const to = args.to;
  const amount = args.value;
  const amountFormatted = formatTokenAmount(amount, config.tokenDecimals);
  const timestamp = await getBlockTimestamp(blockNumber);

  return {
    tokenAddress: address || config.calledTokenAddress,
    blockNumber: Number(blockNumber),
    blockHash: blockHash || "",
    transactionHash,
    logIndex: Number(logIndex ?? 0),
    from,
    to,
    amount: amount.toString(),
    amountFormatted,
    timestamp,
  };
}

/**
 * 历史区块补齐同步
 */
export async function syncHistoricalLogs() {
  console.log("🔄 开始检查历史区块 Transfer 事件...");

  let currentBlock;
  try {
    currentBlock = await publicClient.getBlockNumber();
    console.log(`🧱 当前区块链最新高度: #${currentBlock}`);
  } catch (err) {
    console.warn(`⚠️ 无法获取当前链上区块，跳过历史追块: ${err.message}`);
    return;
  }

  const SYNC_KEY = `last_synced_block_${config.calledTokenAddress.toLowerCase()}`;
  const savedLastBlock = await dbInstance.getSyncState(SYNC_KEY);

  let fromBlock = savedLastBlock ? BigInt(savedLastBlock) + 1n : config.startBlock;
  if (fromBlock > currentBlock) {
    console.log(`✅ 历史数据已是最新 (已同步至 #${savedLastBlock})`);
    return;
  }

  console.log(`📦 从区块 #${fromBlock} 追块同步至 #${currentBlock}...`);

  const BATCH_SIZE = 5n;
  let totalNew = 0;

  while (fromBlock <= currentBlock) {
    const toBlock = fromBlock + BATCH_SIZE - 1n > currentBlock ? currentBlock : fromBlock + BATCH_SIZE - 1n;
    try {
      const logs = await publicClient.getContractEvents({
        address: config.calledTokenAddress,
        abi: calledTokenAbi,
        eventName: "Transfer",
        fromBlock,
        toBlock,
      });

      if (logs.length > 0) {
        const records = [];
        for (const log of logs) {
          const record = await parseTransferLog(log);
          records.push(record);
        }
        const inserted = await dbInstance.insertTransfers(records);
        totalNew += inserted;
        console.log(`  ➕ 区块 #${fromBlock} ~ #${toBlock}: 抓取到 ${logs.length} 条转账，新增入库 ${inserted} 条`);
      }

      await dbInstance.setSyncState(SYNC_KEY, toBlock.toString());
    } catch (err) {
      console.error(`❌ 同步区块 #${fromBlock} ~ #${toBlock} 失败:`, err.message);
      break;
    }

    fromBlock = toBlock + 1n;
  }

  console.log(`🎉 历史同步完成！共计新增索引 ${totalNew} 笔转账记录。\n`);
}

/**
 * 启动实时事件监听
 */
export function startEventListener() {
  console.log(`👀 正在监听 CalledToken (${config.calledTokenAddress}) Transfer 转账事件...`);

  const SYNC_KEY = `last_synced_block_${config.calledTokenAddress.toLowerCase()}`;

  const unwatch = publicClient.watchContractEvent({
    address: config.calledTokenAddress,
    abi: calledTokenAbi,
    eventName: "Transfer",
    onLogs: async (logs) => {
      for (const log of logs) {
        try {
          const record = await parseTransferLog(log);
          const result = await dbInstance.insertTransfer(record);

          console.log("\n========================================================");
          console.log(`💸 [新转账事件入库] ${result.inserted ? "✅ 成功" : "ℹ️ 已存在跳过"}`);
          console.log(`🧱 区块高度: ${record.blockNumber}`);
          console.log(`🔗 交易哈希: ${record.transactionHash}`);
          console.log(`📤 发送地址: ${record.from}`);
          console.log(`📥 接收地址: ${record.to}`);
          console.log(`💰 转账金额: ${record.amountFormatted} 代币 (原始值: ${record.amount})`);
          console.log("========================================================\n");

          if (record.blockNumber) {
            await dbInstance.setSyncState(SYNC_KEY, record.blockNumber.toString());
          }
        } catch (err) {
          console.error("❌ 处理 Transfer 日志异常:", err);
        }
      }
    },
    onError: (error) => {
      console.error("❌ [Transfer 监听器异常]:", error.message || error);
    },
  });

  return unwatch;
}

/**
 * 创建 Express RESTful API 应用
 */
export function createApiApp(db = dbInstance) {
  const app = express();

  app.use(cors());
  app.use(express.json());

  // 1. 获取指定地址的转账记录 (Restful 核心接口)
  // 支持 query: direction=all|in|out, page=1, limit=20
  app.get("/api/transfers/:address", async (req, res) => {
    try {
      const { address } = req.params;
      const { direction = "all", page = 1, limit = 20 } = req.query;

      if (!address || !isAddress(address)) {
        return res.status(400).json({
          success: false,
          error: "Invalid Ethereum address format",
        });
      }

      const validDirections = ["all", "in", "out", "to", "from"];
      if (!validDirections.includes(direction.toLowerCase())) {
        return res.status(400).json({
          success: false,
          error: "Invalid direction query param. Allowed values: all, in, out",
        });
      }

      const result = await db.getTransfersByAddress(address, {
        direction: direction.toLowerCase(),
        page: parseInt(page, 10) || 1,
        limit: parseInt(limit, 10) || 20,
      });

      return res.json({
        success: true,
        address: address.toLowerCase(),
        direction: direction.toLowerCase(),
        pagination: {
          page: result.page,
          limit: result.limit,
          total: result.total,
          totalPages: result.totalPages,
        },
        data: result.list,
      });
    } catch (err) {
      console.error("API /api/transfers/:address 异常:", err);
      return res.status(500).json({
        success: false,
        error: "Internal server error",
        message: err.message,
      });
    }
  });

  // 2. 获取全局最近转账记录
  app.get("/api/transfers", async (req, res) => {
    try {
      const { page = 1, limit = 20 } = req.query;
      const result = await db.getAllTransfers({
        tokenAddress: config.calledTokenAddress,
        page: parseInt(page, 10) || 1,
        limit: parseInt(limit, 10) || 20,
      });

      return res.json({
        success: true,
        pagination: {
          page: result.page,
          limit: result.limit,
          total: result.total,
          totalPages: result.totalPages,
        },
        data: result.list,
      });
    } catch (err) {
      return res.status(500).json({
        success: false,
        error: err.message,
      });
    }
  });

  // 3. 索引服务状态
  app.get("/api/status", async (req, res) => {
    try {
      let currentChainBlock = null;
      try {
        currentChainBlock = Number(await publicClient.getBlockNumber());
      } catch {
        // RPC 可能未启动
      }

      const SYNC_KEY = `last_synced_block_${config.calledTokenAddress.toLowerCase()}`;
      const lastSyncedBlock = await db.getSyncState(SYNC_KEY);
      const stats = await db.getStats();

      return res.json({
        success: true,
        service: "CalledToken Transfer Indexer",
        network: {
          chainId: activeChain.id,
          chainName: activeChain.name,
          rpcUrl: config.rpcUrl,
          currentBlock: currentChainBlock,
        },
        token: {
          address: config.calledTokenAddress,
          decimals: config.tokenDecimals,
        },
        sync: {
          lastSyncedBlock: lastSyncedBlock ? Number(lastSyncedBlock) : null,
          totalIndexedTransfers: stats.totalTransfers,
          minBlock: stats.minBlock,
          maxBlock: stats.maxBlock,
        },
      });
    } catch (err) {
      return res.status(500).json({
        success: false,
        error: err.message,
      });
    }
  });

  // 4. 健康检查
  app.get("/health", (req, res) => {
    res.json({ status: "ok", timestamp: Date.now() });
  });

  return app;
}

/**
 * 主启动函数
 */
export async function startServer() {
  console.log("========================================================");
  console.log("🚀 启动 CalledToken 转账索引与 Restful API 服务");
  console.log("========================================================");
  console.log(`🌐 网络:       ${activeChain.name} (ChainID: ${activeChain.id})`);
  console.log(`🪙 目标代币:   ${config.calledTokenAddress}`);
  console.log(`🔌 节点 RPC:   ${config.rpcUrl}`);
  console.log(`📂 SQLite:     ${config.dbPath}`);
  console.log(`🚀 API 端口:   ${config.port}`);
  console.log("--------------------------------------------------------");

  // 1. 初始化数据库
  await dbInstance.init(config.dbPath);
  console.log("✅ SQLite 数据库就绪");

  // 2. 同步历史日志
  await syncHistoricalLogs();

  // 3. 启动实时监听
  const unwatch = startEventListener();

  // 4. 启动 Restful HTTP API 服务
  const app = createApiApp(dbInstance);
  const server = app.listen(config.port, () => {
    console.log(`\n📡 RESTful API 接口已就绪: http://localhost:${config.port}`);
    console.log(`👉 查询地址转账: GET http://localhost:${config.port}/api/transfers/:address`);
    console.log(`👉 查询服务状态: GET http://localhost:${config.port}/api/status`);
    console.log(`👉 健康检查接口: GET http://localhost:${config.port}/health\n`);
    console.log("按下 Ctrl+C 退出服务...\n");
  });

  // 优雅停机
  const cleanup = async () => {
    console.log("\n🛑 正在停止索引与 API 服务...");
    if (typeof unwatch === "function") unwatch();
    server.close();
    await dbInstance.close();
    console.log("👋 服务已安全关闭。");
    process.exit(0);
  };

  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);

  return { server, unwatch, app };
}

// 如果直接运行此脚本则启动服务
const isMain = process.argv[1] && (
  process.argv[1].endsWith("indexer.js") ||
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))
);

if (isMain) {
  startServer().catch((err) => {
    console.error("❌ 服务启动失败:", err);
    process.exit(1);
  });
}
