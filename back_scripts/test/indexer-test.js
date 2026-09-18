import http from "node:http";
import TransferDatabase from "../db.js";
import { createApiApp } from "../indexer.js";

function assert(condition, message) {
  if (!condition) {
    throw new Error(`❌ 断言失败: ${message}`);
  }
}

async function fetchJson(url) {
  return new Promise((resolve, reject) => {
    http
      .get(url, (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(data) });
          } catch {
            resolve({ status: res.statusCode, raw: data });
          }
        });
      })
      .on("error", reject);
  });
}

async function runTests() {
  console.log("========================================================");
  console.log("🧪 开始测试 CalledToken 转账索引与 RESTful API 服务");
  console.log("========================================================");

  // 1. 初始化内存数据库进行独立测试
  console.log("\n1️⃣  [测试] 初始化 SQLite 内存数据库...");
  const testDb = new TransferDatabase();
  await testDb.init(":memory:");
  console.log("   ✅ SQLite 内存数据库初始化成功");

  // 2. 测试插入数据与防重复性
  console.log("\n2️⃣  [测试] 插入 ERC20 Transfer 转账记录与防重验证...");
  const sampleTransfer1 = {
    tokenAddress: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
    blockNumber: 100,
    blockHash: "0xblock100",
    transactionHash: "0xtx001",
    logIndex: 0,
    from: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
    to: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
    amount: "50000000000000000000",
    amountFormatted: "50",
    timestamp: 1710000000,
  };

  const sampleTransfer2 = {
    tokenAddress: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
    blockNumber: 101,
    blockHash: "0xblock101",
    transactionHash: "0xtx002",
    logIndex: 0,
    from: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
    to: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
    amount: "20000000000000000000",
    amountFormatted: "20",
    timestamp: 1710000010,
  };

  const res1 = await testDb.insertTransfer(sampleTransfer1);
  assert(res1.inserted === true, "第一笔记录应插入成功");

  // 插入重复记录 (tx001, logIndex: 0)
  const resDuplicate = await testDb.insertTransfer(sampleTransfer1);
  assert(resDuplicate.inserted === false, "相同 (txHash, logIndex) 应该被忽略插入");

  const res2 = await testDb.insertTransfer(sampleTransfer2);
  assert(res2.inserted === true, "第二笔记录应插入成功");
  console.log("   ✅ 插入与唯一性防重校验通过");

  // 3. 测试数据库按地址查询 (大小写兼容与出入账方向)
  console.log("\n3️⃣  [测试] 验证数据库按地址与出入账方向查询...");
  const addrA = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
  const addrB = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";

  // 查询 addrB (作为 receiver 收到 50，作为 sender 转出 20)
  const allB = await testDb.getTransfersByAddress(addrB, { direction: "all" });
  assert(allB.total === 2, `addrB 应有 2 条记录 (实际: ${allB.total})`);

  const inB = await testDb.getTransfersByAddress(addrB, { direction: "in" });
  assert(inB.total === 1 && inB.list[0].amountFormatted === "50", "addrB 入账应为 1 笔 50 代币");

  const outB = await testDb.getTransfersByAddress(addrB, { direction: "out" });
  assert(outB.total === 1 && outB.list[0].amountFormatted === "20", "addrB 出账应为 1 笔 20 代币");

  console.log("   ✅ 数据库地址与方向过滤逻辑验证通过");

  // 4. 启动 Express 测试服务器并测试 RESTful API
  console.log("\n4️⃣  [测试] 启动 Express API 并验证 HTTP 接口...");
  const app = createApiApp(testDb);
  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s)); // 随机端口
  });
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;
  console.log(`   🔌 测试服务器已在端口 ${port} 启动`);

  try {
    // 4.1 健康检查接口
    const healthRes = await fetchJson(`${baseUrl}/health`);
    assert(healthRes.status === 200 && healthRes.body.status === "ok", "健康检查接口应返回 ok");
    console.log("   ✅ GET /health 验证通过");

    // 4.2 状态接口
    const statusRes = await fetchJson(`${baseUrl}/api/status`);
    assert(statusRes.status === 200 && statusRes.body.success === true, "状态接口应返回 success: true");
    assert(statusRes.body.sync.totalIndexedTransfers === 2, "状态接口返回总转账数应为 2");
    console.log("   ✅ GET /api/status 验证通过");

    // 4.3 RESTful 转账查询接口 (有效地址)
    const transferRes = await fetchJson(`${baseUrl}/api/transfers/${addrB}`);
    assert(transferRes.status === 200 && transferRes.body.success === true, "查询接口应返回 200");
    assert(transferRes.body.pagination.total === 2, "查询结果条数应为 2");
    assert(transferRes.body.data.length === 2, "数据列表长度应为 2");
    console.log("   ✅ GET /api/transfers/:address 验证通过");

    // 4.4 RESTful 筛选 direction=in
    const transferInRes = await fetchJson(`${baseUrl}/api/transfers/${addrB}?direction=in`);
    assert(transferInRes.body.pagination.total === 1, "入账条数应为 1");
    assert(transferInRes.body.data[0].to.toLowerCase() === addrB.toLowerCase(), "接收方地址应匹配");
    console.log("   ✅ GET /api/transfers/:address?direction=in 验证通过");

    // 4.5 RESTful 无效地址格式错误处理
    const invalidRes = await fetchJson(`${baseUrl}/api/transfers/invalid-address`);
    assert(invalidRes.status === 400 && invalidRes.body.success === false, "无效地址应返回 400");
    console.log("   ✅ 无效地址 400 校验通过");

    // 4.6 全局转账列表接口
    const allTransfersRes = await fetchJson(`${baseUrl}/api/transfers`);
    assert(allTransfersRes.status === 200 && allTransfersRes.body.data.length === 2, "全局转账接口应返回 2 条");
    console.log("   ✅ GET /api/transfers 验证通过");
  } finally {
    server.close();
    await testDb.close();
  }

  console.log("\n========================================================");
  console.log("🎉 全部测试用例执行完成，所有功能验证通过！");
  console.log("========================================================\n");
}

runTests().catch((err) => {
  console.error("❌ 测试运行失败:", err);
  process.exit(1);
});
