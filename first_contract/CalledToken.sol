// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./BaseERC20.sol";

/**
 * @title ITokenReceiver
 * @dev 仿 ERC1363 / ERC777 标准的代币接收者接口
 */
interface ITokenReceiver {
    function tokensReceived(
        address from,
        uint256 amount,
        bytes calldata data
    ) external returns (bool);
}

/**
 * @title CalledToken
 * @dev 仿 ERC1363 实现带回调通知的 ERC20 代币合约
 * 核心方法 transferAndCall 在转账成功后，若接收方是合约地址，会自动触发该合约的 tokensReceived 回调
 */
contract CalledToken is BaseERC20 {
    /**
     * @dev 构造函数：支持自定义代币名称、符号与初始发行量（单位为枚，内部会自动乘以 10^decimals）
     * 若未传参（或传空/0），使用默认值: "CalledToken", "CTK", 1000000 代币
     */
    constructor(
        string memory _name,
        string memory _symbol,
        uint256 _initialSupply
    )
        BaseERC20(
            bytes(_name).length > 0 ? _name : "CalledToken",
            bytes(_symbol).length > 0 ? _symbol : "CTK",
            _initialSupply
        )
    {}

    /**
     * @notice 转账给目标地址，若接收方是合约则触发 tokensReceived 回调（不带附加数据）
     * @param to 接收方地址
     * @param amount 转账代币数量
     * @return 成功返回 true
     */
    function transferAndCall(address to, uint256 amount) external returns (bool) {
        return transferAndCall(to, amount, "");
    }

    /**
     * @notice 转账给目标地址，若接收方是合约则触发 tokensReceived 回调（附带自定义数据）
     * @param to 接收方地址
     * @param amount 转账代币数量
     * @param data 传递给回调函数的附加数据
     * @return 成功返回 true
     */
    function transferAndCall(
        address to,
        uint256 amount,
        bytes memory data
    ) public returns (bool) {
        // 1. 先进行 ERC20 转账
        require(_transfer(msg.sender, to, amount), "CalledToken: transfer failed");

        // 2. 如果目标是合约地址，则触发回调
        if (_isContract(to)) {
            require(
                _checkTokensReceived(msg.sender, to, amount, data),
                "CalledToken: tokensReceived reverted or failed"
            );
        }

        return true;
    }

    /**
     * @notice 授权转账并触发回调（仿 ERC1363 transferFromAndCall）
     * @param from 代币转出方地址
     * @param to 接收方合约地址
     * @param amount 转账数量
     * @return 成功返回 true
     */
    function transferFromAndCall(
        address from,
        address to,
        uint256 amount
    ) external returns (bool) {
        return transferFromAndCall(from, to, amount, "");
    }

    /**
     * @notice 授权转账并触发回调（携带附加数据）
     * @param from 代币转出方地址
     * @param to 接收方合约地址
     * @param amount 转账数量
     * @param data 传递给回调函数的附加数据
     * @return 成功返回 true
     */
    function transferFromAndCall(
        address from,
        address to,
        uint256 amount,
        bytes memory data
    ) public returns (bool) {
        // 1. 扣减 allowance 额度
        uint256 currentAllowance = allowance[from][msg.sender];
        require(currentAllowance >= amount, "ERC20: transfer amount exceeds allowance");
        unchecked {
            allowance[from][msg.sender] = currentAllowance - amount;
        }

        // 2. 执行代币转移
        require(_transfer(from, to, amount), "CalledToken: transfer failed");

        // 3. 如果接收者是合约，执行回调
        if (_isContract(to)) {
            require(
                _checkTokensReceived(from, to, amount, data),
                "CalledToken: tokensReceived reverted or failed"
            );
        }

        return true;
    }

    /**
     * @dev 调用目标合约的 tokensReceived 接口
     */
    function _checkTokensReceived(
        address from,
        address to,
        uint256 amount,
        bytes memory data
    ) internal returns (bool) {
        try ITokenReceiver(to).tokensReceived(from, amount, data) returns (bool success) {
            return success;
        } catch {
            revert("CalledToken: tokensReceived call failed");
        }
    }

    /**
     * @dev 判断目标地址是否是合约地址（code.length > 0）
     */
    function _isContract(address account) internal view returns (bool) {
        return account.code.length > 0;
    }
}
