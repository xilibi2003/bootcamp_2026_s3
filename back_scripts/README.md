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
├── data/
│   └── indexer.db          # SQLite 索引数据库 (运行时自动生成)
├── test/
│   ├── mock-event-test.js  # ABI 与事件解析测试用例
│   └── indexer-test.js     # SQLite 与 RESTful API 测试用例
├── .env                    # 当前生效的环境变量配置
├── .env.example            # 环境变量模板
├── client.js               # Viem Client 客户端配置与代币金额转换工具
├── db.js                   # SQLite 数据库模型与查询层
├── index.js                # NFTMarket 事件监听主入口脚本
├── indexer.js              # CalledToken ERC20 转账索引与 Restful API 服务
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

---

## CalledToken 转账索引与 Restful API 服务

### 1. 功能说明
- **事件索引**：监听 `CalledToken` 合约的 ERC20 `Transfer` 事件，具备历史日志自动追块与实时事件监听入库功能。
- **持久化存储**：使用 **SQLite3** 存储转账流水（`transfers` 表），设置 `UNIQUE(transaction_hash, log_index)` 保证幂等防重。
- **断点记录**：记录最新同步区块高度（`sync_state` 表），服务重启后自动从上次断点继续同步。
- **RESTful API**：提供查询指定地址转账记录、全局转账流水、同步状态与健康检查接口。

### 2. 启动索引服务

```bash
npm run indexer
```

服务启动后将输出：
```text
========================================================
🚀 启动 CalledToken 转账索引与 Restful API 服务
========================================================
🌐 网络:       Anvil (ChainID: 31337)
🪙 目标代币:   0x5FbDB2315678afecb367f032d93F642f64180aa3
🔌 节点 RPC:   http://127.0.0.1:8545
📂 SQLite:     ./data/indexer.db
🚀 API 端口:   3001
--------------------------------------------------------
✅ SQLite 数据库就绪
📡 RESTful API 接口已就绪: http://localhost:3001
```

### 3. RESTful API 接口列表

#### ① 查询指定地址的转账记录 (核心接口)
- **URL**: `GET /api/transfers/:address`
- **Query 参数**:
  - `direction`: 可选 `all` (默认，全部)、`in` (仅入账)、`out` (仅出账)
  - `page`: 分页页码，默认 `1`
  - `limit`: 每页条数，默认 `20` (最大 `100`)
- **示例**:
  ```bash
  # 查询某地址的所有转账记录
  curl http://localhost:3001/api/transfers/0x70997970c51812dc3a010c7d01b50e0d17dc79c8

  # 查询某地址收到的转账（入账）
  curl http://localhost:3001/api/transfers/0x70997970c51812dc3a010c7d01b50e0d17dc79c8?direction=in

  # 查询某地址发起的转账（出账）
  curl http://localhost:3001/api/transfers/0x70997970c51812dc3a010c7d01b50e0d17dc79c8?direction=out&page=1&limit=10
  ```
- **返回示例**:
  ```json
  {
    "success": true,
    "address": "0x70997970c51812dc3a010c7d01b50e0d17dc79c8",
    "direction": "all",
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 1,
      "totalPages": 1
    },
    "data": [
      {
        "id": 1,
        "tokenAddress": "0x5fbdb2315678afecb367f032d93f642f64180aa3",
        "blockNumber": 25,
        "blockHash": "0x...",
        "transactionHash": "0x...",
        "logIndex": 0,
        "from": "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266",
        "to": "0x70997970c51812dc3a010c7d01b50e0d17dc79c8",
        "amount": "200000000000000000000",
        "amountFormatted": "200",
        "timestamp": 1710765432,
        "createdAt": "2026-09-18 20:25:00"
      }
    ]
  }
  ```

#### ② 查询全局转账流水
- **URL**: `GET /api/transfers?page=1&limit=20`

#### ③ 索引服务运行状态
- **URL**: `GET /api/status`

#### ④ 服务健康检查
- **URL**: `GET /health`

---

## 运行自动化测试

```bash
npm test
```
将自动运行事件解析测试以及 SQLite 索引与 RESTful API 接口测试。

---

## 模拟代币转账脚本 (`simulate_transfers.js`)

专门用于在测试账户之间模拟产生各种类型的 `CalledToken` ERC20 转账交易：

### 涵盖的转账类型与场景：
1. **普通转账 (`transfer`)**：巨鲸 Alice 向 Bob, Charlie, David 分发代币；Bob 向 Eva 点对点转账；
2. **授权代理扣款 (`approve` + `transferFrom`)**：Charlie 授权 David，由 David 代理从 Charlie 账户转给 Eva；
3. **合约回调转账 (`transferAndCall`)**：Eva 调用 `transferAndCall` 向 Bob 转账；
4. **附带数据回调转账 (`transferAndCall` 带 bytes 数据)**：David 向 Charlie 附带 `0xdeadbeef` 数据转账；
5. **外部钱包随机空投**：生成新的临时外部钱包并转账。

### 使用命令：

#### 1. 批量全场景模拟（一次性执行全部场景）：
```bash
npm run transfer:simulate
```

#### 2. 持续循环随机转账（适合与索引服务联调观察）：
```bash
# 默认每 3 秒随机转账一次
npm run transfer:loop

# 或指定自定义间隔时间 (如每 5 秒)
node simulate_transfers.js --loop --interval=5
```

