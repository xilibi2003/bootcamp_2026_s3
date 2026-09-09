// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./bank.sol";

contract BigBank is Bank {
    event AdminTransferred(
        address indexed previousAdmin,
        address indexed newAdmin
    );

    // 仅允许存款金额 > 0.001 ether
    modifier minDeposit() {
        require(
            msg.value > 0.001 ether,
            "BigBank: deposit amount must be > 0.001 ether"
        );
        _;
    }

    // 重写 deposit 方法，应用 minDeposit 修饰器
    function deposit() public payable virtual override minDeposit {
        super.deposit();
    }

    // 将 BigBank 管理员权限转移给新地址（如 Admin 合约）
    function transferAdmin(address newAdmin) external onlyAdmin {
        require(
            newAdmin != address(0),
            "BigBank: new admin cannot be zero address"
        );
        address oldAdmin = admin;
        admin = newAdmin;
        emit AdminTransferred(oldAdmin, newAdmin);
    }
}
