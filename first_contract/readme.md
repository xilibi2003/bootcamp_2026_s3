# First Contract Demo

本目录下的合约适合直接复制到 [Remix IDE](https://remix.ethereum.org/) 运行测试。

## 合约说明

### 1. [BaseERC20.sol](file:///Users/emmett/openspace_code/bootcamp_2026_s3/first_contract/BaseERC20.sol)
标准 ERC20 代币合约，支持：
- 构造参数灵活：可传入代币名称、符号、初始发行量，亦可留空使用默认值（`BaseERC20`, `BERC`, 100万）。
- 支持 `transfer`, `approve`, `transferFrom`, `balanceOf`, `allowance` 等标准方法。

### 2. [CalledToken.sol](file:///Users/emmett/openspace_code/bootcamp_2026_s3/first_contract/CalledToken.sol)
仿 ERC1363 风格的扩展 ERC20 代币合约，继承自 `BaseERC20`：
- `transferAndCall(address to, uint256 amount)` / `transferAndCall(address to, uint256 amount, bytes data)`：
  在转账完成后，若目标地址是合约，自动回调其 `ITokenReceiver.tokensReceived(msg.sender, amount, data)` 函数。
- `transferFromAndCall(address from, address to, uint256 amount, bytes data)`：
  授权转账完成后，同样回调目标合约的 `tokensReceived`。

### 3. [TokenBank.sol](file:///Users/emmett/openspace_code/bootcamp_2026_s3/first_contract/TokenBank.sol)
代币银行合约，实现 `ITokenReceiver` 接口，支持两种存款方式：
- **传统两步存款**：
  - `deposit(uint256 amount)`: 用户先在代币合约中 `approve` 给银行，再调用 `deposit`。
- **回调一步存款**（仿 ERC1363）：
  - `tokensReceived(address from, uint256 amount, bytes data)`: 由 `CalledToken` 的 `transferAndCall` 直接触发，TokenBank 校验 `msg.sender == token` 后直接将转入的 Token 记账存入用户名下，**无需提前 approve**。
- `withdraw(uint256 amount)`: 提取自己之前存入的代币。
- `balances[address]`: 记录各用户在银行中的存款总额。

---

## Remix 操作测试流程

### 方式 A：使用 CalledToken 进行一步转账存款（transferAndCall）

1. **部署 CalledToken**
   - 在 Remix 中打开 `BaseERC20.sol` 和 `CalledToken.sol`。
   - 编译并部署 `CalledToken`（构造参数可留空，默认发行 100 万枚 `CTK` 到部署者钱包）。
   - 复制部署后的 `CalledToken` 合约地址。

2. **部署 TokenBank**
   - 编译 `TokenBank.sol`。
   - 构造参数 `_tokenAddress` 填入刚刚部署的 `CalledToken` 地址，点击 Deploy。
   - 复制部署后的 `TokenBank` 合约地址。

3. **直接一步转账存款（无需 approve）**
   - 在 `CalledToken` 合约面板中，找到 `transferAndCall`。
   - `to` 填入 `TokenBank` 合约地址。
   - `amount` 填入存款数量（例如 `10000000000000000000` 即 10 枚代币）。
   - 点击 transact 执行。

4. **验证存款**
   - 在 `TokenBank` 合约面板中，调用 `getBalance(你的钱包地址)`。
   - 可以看到金额已正确增加，实现了「转账即存入」的一步操作。

5. **提款 (Withdraw)**
   - 在 `TokenBank` 合约面板中，调用 `withdraw(数量)`，代币将退回到调用者钱包。

---

### 方式 B：传统两步存款流程（Approve + Deposit）

1. **部署代币**（BaseERC20 或 CalledToken 皆可）并部署 **TokenBank**。
2. **授权 (Approve)**：在代币合约中调用 `approve(TokenBank地址, 数量)`。
3. **存款 (Deposit)**：在 `TokenBank` 中调用 `deposit(数量)`。
4. **提款 (Withdraw)**：在 `TokenBank` 中调用 `withdraw(数量)`。
