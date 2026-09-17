# NFTMarket 合约事件监听器与交易模拟 (Viem)

基于 **Viem** 构建的 Node.js 链上事件监听与交易模拟程序，用于实时捕获并美化打印 `NFTMarket` 合约的买卖事件：
- **`NFTListed`**：NFT 上架信息（包含卖家地址、Token ID、上架价格）
- **`NFTSold`**：NFT 购买成交记录（包含买家地址、卖家地址、Token ID、成交价格）
- **`NFTDelisted`**：NFT 取消上架记录

---

## 目录结构

```text
back_scripts/
├── abi/
│   ├── NFTMarket.json      # NFTMarket 合约 ABI
│   ├── CalledToken.json    # CalledToken 支付代币 ABI
│   └── MyERC721.json       # MyERC721 NFT 合约 ABI
├── test/
│   └── mock-event-test.js  # ABI 与事件解析测试用例
├── .env                    # 当前生效的环境变量配置
├── .env.example            # 环境变量模板
├── client.js               # Viem Client 客户端配置与代币金额转换工具
├── index.js                # 事件监听主入口脚本
├── trade.js                # NFT 铸造、上架、购买自动化流程测试脚本
├── package.json
└── README.md
```

---

## 快速上手

### 1. 安装依赖

```bash
cd back_scripts
npm install
```

### 2. 配置环境变量

`back_scripts/.env` 已预设为您在本地链上部署的三个合约地址：

```env
RPC_URL=http://127.0.0.1:8545
CHAIN_ID=31337

# 本地部署的三个合约地址
NFT_MARKET_ADDRESS=0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0
CALLED_TOKEN_ADDRESS=0x5FbDB2315678afecb367f032d93F642f64180aa3
NFT_CONTRACT_ADDRESS=0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512

POLLING_INTERVAL=2000
TOKEN_DECIMALS=18

# 本地 Anvil 预设私钥 (Account 0 为卖家/部署者，Account 1 为买家)
SELLER_PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
BUYER_PRIVATE_KEY=0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d
```

---

## 联调运行验证

建议在两个终端窗口中分别运行：

### 终端 1：启动事件监听服务

```bash
npm start
```

监听器将输出服务就绪信息，并持续监听新上架与买卖行为：
```text
========================================================
🚀 启动 NFTMarket 合约事件监听服务 (Powered by Viem)
========================================================
🌐 监听网络:    Anvil (ChainID: 31337)
🔌 RPC 节点:    http://127.0.0.1:8545
📑 目标合约:    0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0
...
```

### 终端 2：执行模拟交易（铸造 -> 上架 -> 购买）

```bash
npm run trade
```

该脚本将自动执行：
1. **卖家铸造 NFT**：获取新 Token ID；
2. **卖家授权并上架**：调用 `market.list`（监听器将实时输出 `NFTListed` 日志）；
3. **买家资金准备**：确保买家拥有足够的 `CalledToken`；
4. **买家授权并购买**：调用 `market.buyNFT`（监听器将实时输出 `NFTSold` 日志）；
5. **验证所有权归属**：确认 NFT 已成功转移到买家名下。
