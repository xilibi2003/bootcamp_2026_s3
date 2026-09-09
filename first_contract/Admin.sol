// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IBank {
    function withdraw(uint256 amount) external;
}

contract Admin {
    address public owner;

    event Received(address indexed sender, uint256 amount);
    event WithdrawnFromBank(address indexed bank, uint256 amount);
    event WithdrawnToOwner(address indexed owner, uint256 amount);

    modifier onlyOwner() {
        require(msg.sender == owner, "Admin: caller is not owner");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    // 必须实现 receive 函数，以便接收 BigBank.withdraw() 转入的 ETH
    receive() external payable {
        emit Received(msg.sender, msg.value);
    }

    // 调用 BigBank 的 withdraw 方法取款到 Admin 合约
    function adminWithdraw(IBank bank, uint256 amount) external onlyOwner {
        bank.withdraw(amount);
        emit WithdrawnFromBank(address(bank), amount);
    }

    // 同样提供 withdraw 别名方法，方便调用
    function withdraw(IBank bank, uint256 amount) external onlyOwner {
        bank.withdraw(amount);
        emit WithdrawnFromBank(address(bank), amount);
    }

    // 将 Admin 合约内持有的 ETH 提取到 owner 账户
    function withdrawToOwner() external onlyOwner {
        uint256 balance = address(this).balance;
        require(balance > 0, "Admin: no balance to withdraw");

        (bool success, ) = payable(owner).call{value: balance}("");
        require(success, "Admin: transfer to owner failed");

        emit WithdrawnToOwner(owner, balance);
    }
}
