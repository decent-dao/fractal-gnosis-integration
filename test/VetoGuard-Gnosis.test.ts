import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { BigNumber, Contract } from "ethers";
import { ethers, network } from "hardhat";
import {
  VotesToken,
  VotesToken__factory,
  VetoERC20Voting,
  VetoERC20Voting__factory,
  VetoGuard,
  VetoGuard__factory,
} from "../typechain-types";

import {
  buildSignatureBytes,
  buildSafeTransaction,
  safeSignTypedData,
  ifaceSafe,
  abi,
  predictGnosisSafeAddress,
} from "./helpers";

describe("Gnosis Safe", () => {
  // Factories
  let gnosisFactory: Contract;

  // Deployed contracts
  let gnosisSafe: Contract;
  let vetoGuard: VetoGuard;
  let vetoERC20Voting: VetoERC20Voting;
  let votesToken: VotesToken;

  // Wallets
  let deployer: SignerWithAddress;
  let owner1: SignerWithAddress;
  let owner2: SignerWithAddress;
  let owner3: SignerWithAddress;
  let tokenVetoer1: SignerWithAddress;
  let tokenVetoer2: SignerWithAddress;
  let vetoGuardOwner: SignerWithAddress;

  // Gnosis
  let createGnosisSetupCalldata: string;

  const gnosisFactoryAddress = "0xa6B71E26C5e0845f74c812102Ca7114b6a896AB2";
  const gnosisSingletonAddress = "0xd9Db270c1B5E3Bd161E8c8503c55cEABeE709552";
  const threshold = 2;
  const saltNum = BigNumber.from(
    "0x856d90216588f9ffc124d1480a440e1c012c7a816952bc968d737bae5d4e139c"
  );

  beforeEach(async () => {
    // Fork Goerli to use contracts deployed on Goerli
    await network.provider.request({
      method: "hardhat_reset",
      params: [
        {
          forking: {
            jsonRpcUrl: process.env.GOERLI_PROVIDER
              ? process.env.GOERLI_PROVIDER
              : "",
            blockNumber: 7387621,
          },
        },
      ],
    });

    [
      deployer,
      owner1,
      owner2,
      owner3,
      tokenVetoer1,
      tokenVetoer2,
      vetoGuardOwner,
    ] = await ethers.getSigners();

    // Get deployed Gnosis Safe
    gnosisFactory = new ethers.Contract(gnosisFactoryAddress, abi, deployer);

    createGnosisSetupCalldata = ifaceSafe.encodeFunctionData("setup", [
      [owner1.address, owner2.address, owner3.address],
      threshold,
      ethers.constants.AddressZero,
      ethers.constants.HashZero,
      ethers.constants.AddressZero,
      ethers.constants.AddressZero,
      0,
      ethers.constants.AddressZero,
    ]);

    const predictedGnosisSafeAddress = await predictGnosisSafeAddress(
      gnosisFactory.address,
      createGnosisSetupCalldata,
      saltNum,
      gnosisSingletonAddress,
      gnosisFactory
    );

    // Deploy Gnosis Safe
    await gnosisFactory.createProxyWithNonce(
      gnosisSingletonAddress,
      createGnosisSetupCalldata,
      saltNum
    );

    // Get Gnosis Safe contract
    gnosisSafe = await ethers.getContractAt(
      "GnosisSafe",
      predictedGnosisSafeAddress
    );

    // Deploy token, allocate supply to two token vetoers and Gnosis Safe
    votesToken = await new VotesToken__factory(deployer).deploy(
      "DCNT",
      "DCNT",
      [tokenVetoer1.address, tokenVetoer2.address, gnosisSafe.address],
      [500, 600, 1000]
    );

    // Vetoers delegate their votes to themselves
    await votesToken.connect(tokenVetoer1).delegate(tokenVetoer1.address);
    await votesToken.connect(tokenVetoer2).delegate(tokenVetoer2.address);

    // Deploy VetoERC20Voting contract
    vetoERC20Voting = await new VetoERC20Voting__factory(deployer).deploy();

    // Deploy VetoGuard contract with a 10 block delay between queuing and execution
    vetoGuard = await new VetoGuard__factory(deployer).deploy(
      vetoGuardOwner.address,
      10,
      vetoERC20Voting.address,
      gnosisSafe.address
    );

    // Initialize VetoERC20Voting contract
    await vetoERC20Voting.initialize(
      1000,
      1000,
      votesToken.address,
      vetoGuard.address
    );

    // Create transaction to set the guard address
    const setGuardData = gnosisSafe.interface.encodeFunctionData("setGuard", [
      vetoGuard.address,
    ]);

    const tx = buildSafeTransaction({
      to: gnosisSafe.address,
      data: setGuardData,
      safeTxGas: 1000000,
      nonce: await gnosisSafe.nonce(),
    });
    const sigs = [
      await safeSignTypedData(owner1, gnosisSafe, tx),
      await safeSignTypedData(owner2, gnosisSafe, tx),
    ];
    const signatureBytes = buildSignatureBytes(sigs);

    // Execute transaction that adds the veto guard to the Safe
    await expect(
      gnosisSafe.execTransaction(
        tx.to,
        tx.value,
        tx.data,
        tx.operation,
        tx.safeTxGas,
        tx.baseGas,
        tx.gasPrice,
        tx.gasToken,
        tx.refundReceiver,
        signatureBytes
      )
    ).to.emit(gnosisSafe, "ExecutionSuccess");

    // Gnosis Safe received the 1,000 tokens
    expect(await votesToken.balanceOf(gnosisSafe.address)).to.eq(1000);
  });

  describe("Gnosis Safe with VetoGuard", () => {
    it("A transaction can be queued and executed", async () => {
      // Create transaction to set the guard address
      const tokenTransferData = votesToken.interface.encodeFunctionData(
        "transfer",
        [deployer.address, 1000]
      );

      const tx = buildSafeTransaction({
        to: votesToken.address,
        data: tokenTransferData,
        safeTxGas: 1000000,
        nonce: await gnosisSafe.nonce(),
      });

      const sigs = [
        await safeSignTypedData(owner1, gnosisSafe, tx),
        await safeSignTypedData(owner2, gnosisSafe, tx),
      ];
      const signatureBytes = buildSignatureBytes(sigs);

      await vetoGuard.queueTransaction(
        tx.to,
        tx.value,
        tx.data,
        tx.operation,
        tx.safeTxGas,
        tx.baseGas,
        tx.gasPrice,
        tx.gasToken,
        tx.refundReceiver,
        signatureBytes
      );

      // Mine blocks to surpass the execution delay
      for (let i = 0; i < 9; i++) {
        await network.provider.send("evm_mine");
      }

      await gnosisSafe.execTransaction(
        tx.to,
        tx.value,
        tx.data,
        tx.operation,
        tx.safeTxGas,
        tx.baseGas,
        tx.gasPrice,
        tx.gasToken,
        tx.refundReceiver,
        signatureBytes
      );

      expect(await votesToken.balanceOf(gnosisSafe.address)).to.eq(0);
      expect(await votesToken.balanceOf(deployer.address)).to.eq(1000);
    });

    it("A transaction cannot be executed if it hasn't yet been queued", async () => {
      // Create transaction to set the guard address
      const tokenTransferData = votesToken.interface.encodeFunctionData(
        "transfer",
        [deployer.address, 1000]
      );

      const tx = buildSafeTransaction({
        to: votesToken.address,
        data: tokenTransferData,
        safeTxGas: 1000000,
        nonce: await gnosisSafe.nonce(),
      });

      const sigs = [
        await safeSignTypedData(owner1, gnosisSafe, tx),
        await safeSignTypedData(owner2, gnosisSafe, tx),
      ];
      const signatureBytes = buildSignatureBytes(sigs);

      await expect(
        gnosisSafe.execTransaction(
          tx.to,
          tx.value,
          tx.data,
          tx.operation,
          tx.safeTxGas,
          tx.baseGas,
          tx.gasPrice,
          tx.gasToken,
          tx.refundReceiver,
          signatureBytes
        )
      ).to.be.revertedWith("Transaction has not been queued yet");
    });
  });

  it("A transaction cannot be queued if the signatures aren't valid", async () => {
    // Create transaction to set the guard address
    const tokenTransferData = votesToken.interface.encodeFunctionData(
      "transfer",
      [deployer.address, 1000]
    );

    const tx = buildSafeTransaction({
      to: votesToken.address,
      data: tokenTransferData,
      safeTxGas: 1000000,
      nonce: await gnosisSafe.nonce(),
    });

    // Only 1 signer signs, while the threshold is 2
    const sigs = [await safeSignTypedData(owner1, gnosisSafe, tx)];
    const signatureBytes = buildSignatureBytes(sigs);

    await expect(
      vetoGuard.queueTransaction(
        tx.to,
        tx.value,
        tx.data,
        tx.operation,
        tx.safeTxGas,
        tx.baseGas,
        tx.gasPrice,
        tx.gasToken,
        tx.refundReceiver,
        signatureBytes
      )
    ).to.be.revertedWith("GS020");
  });

  it("A transaction cannot be executed if the delay period has not been reached yet", async () => {
    // Create transaction to set the guard address
    const tokenTransferData = votesToken.interface.encodeFunctionData(
      "transfer",
      [deployer.address, 1000]
    );

    const tx = buildSafeTransaction({
      to: votesToken.address,
      data: tokenTransferData,
      safeTxGas: 1000000,
      nonce: await gnosisSafe.nonce(),
    });

    const sigs = [
      await safeSignTypedData(owner1, gnosisSafe, tx),
      await safeSignTypedData(owner2, gnosisSafe, tx),
    ];
    const signatureBytes = buildSignatureBytes(sigs);

    await vetoGuard.queueTransaction(
      tx.to,
      tx.value,
      tx.data,
      tx.operation,
      tx.safeTxGas,
      tx.baseGas,
      tx.gasPrice,
      tx.gasToken,
      tx.refundReceiver,
      signatureBytes
    );

    await expect(
      gnosisSafe.execTransaction(
        tx.to,
        tx.value,
        tx.data,
        tx.operation,
        tx.safeTxGas,
        tx.baseGas,
        tx.gasPrice,
        tx.gasToken,
        tx.refundReceiver,
        signatureBytes
      )
    ).to.be.revertedWith("Transaction delay period has not completed yet");
  });

  it("A transaction can be executed if it has received some veto votes, but not above the threshold", async () => {
    // Create transaction to set the guard address
    const tokenTransferData = votesToken.interface.encodeFunctionData(
      "transfer",
      [deployer.address, 1000]
    );

    const tx = buildSafeTransaction({
      to: votesToken.address,
      data: tokenTransferData,
      safeTxGas: 1000000,
      nonce: await gnosisSafe.nonce(),
    });

    const sigs = [
      await safeSignTypedData(owner1, gnosisSafe, tx),
      await safeSignTypedData(owner2, gnosisSafe, tx),
    ];
    const signatureBytes = buildSignatureBytes(sigs);

    await vetoGuard.queueTransaction(
      tx.to,
      tx.value,
      tx.data,
      tx.operation,
      tx.safeTxGas,
      tx.baseGas,
      tx.gasPrice,
      tx.gasToken,
      tx.refundReceiver,
      signatureBytes
    );

    const txHash = await vetoERC20Voting.getTransactionHash(
      tx.to,
      tx.value,
      tx.data,
      tx.operation,
      tx.safeTxGas,
      tx.baseGas,
      tx.gasPrice,
      tx.gasToken,
      tx.refundReceiver
    );

    // Vetoer 1 casts 500 veto votes
    await vetoERC20Voting.connect(tokenVetoer1).castVetoVote(txHash, false);

    // 500 veto votes have been cast
    expect(
      await vetoERC20Voting.getVetoVotes(
        tx.to,
        tx.value,
        tx.data,
        tx.operation,
        tx.safeTxGas,
        tx.baseGas,
        tx.gasPrice,
        tx.gasToken,
        tx.refundReceiver
      )
    ).to.eq(500);

    expect(
      await vetoERC20Voting.getIsVetoed(
        tx.to,
        tx.value,
        tx.data,
        tx.operation,
        tx.safeTxGas,
        tx.baseGas,
        tx.gasPrice,
        tx.gasToken,
        tx.refundReceiver
      )
    ).to.eq(false);

    // Mine blocks to surpass the execution delay
    for (let i = 0; i < 9; i++) {
      await network.provider.send("evm_mine");
    }

    await gnosisSafe.execTransaction(
      tx.to,
      tx.value,
      tx.data,
      tx.operation,
      tx.safeTxGas,
      tx.baseGas,
      tx.gasPrice,
      tx.gasToken,
      tx.refundReceiver,
      signatureBytes
    );

    expect(await votesToken.balanceOf(deployer.address)).to.eq(1000);
    expect(await votesToken.balanceOf(gnosisSafe.address)).to.eq(0);
  });

  it("A transaction cannot be executed if it has received more veto votes than the threshold", async () => {
    // Create transaction to set the guard address
    const tokenTransferData = votesToken.interface.encodeFunctionData(
      "transfer",
      [deployer.address, 1000]
    );

    const tx = buildSafeTransaction({
      to: votesToken.address,
      data: tokenTransferData,
      safeTxGas: 1000000,
      nonce: await gnosisSafe.nonce(),
    });

    const sigs = [
      await safeSignTypedData(owner1, gnosisSafe, tx),
      await safeSignTypedData(owner2, gnosisSafe, tx),
    ];
    const signatureBytes = buildSignatureBytes(sigs);

    await vetoGuard.queueTransaction(
      tx.to,
      tx.value,
      tx.data,
      tx.operation,
      tx.safeTxGas,
      tx.baseGas,
      tx.gasPrice,
      tx.gasToken,
      tx.refundReceiver,
      signatureBytes
    );

    const txHash = await vetoERC20Voting.getTransactionHash(
      tx.to,
      tx.value,
      tx.data,
      tx.operation,
      tx.safeTxGas,
      tx.baseGas,
      tx.gasPrice,
      tx.gasToken,
      tx.refundReceiver
    );

    // Vetoer 1 casts 500 veto votes
    await vetoERC20Voting.connect(tokenVetoer1).castVetoVote(txHash, false);

    // Vetoer 2 casts 600 veto votes
    await vetoERC20Voting.connect(tokenVetoer2).castVetoVote(txHash, false);

    // 1100 veto votes have been cast
    expect(
      await vetoERC20Voting.getVetoVotes(
        tx.to,
        tx.value,
        tx.data,
        tx.operation,
        tx.safeTxGas,
        tx.baseGas,
        tx.gasPrice,
        tx.gasToken,
        tx.refundReceiver
      )
    ).to.eq(1100);

    expect(
      await vetoERC20Voting.getIsVetoed(
        tx.to,
        tx.value,
        tx.data,
        tx.operation,
        tx.safeTxGas,
        tx.baseGas,
        tx.gasPrice,
        tx.gasToken,
        tx.refundReceiver
      )
    ).to.eq(true);

    // Mine blocks to surpass the execution delay
    for (let i = 0; i < 9; i++) {
      await network.provider.send("evm_mine");
    }

    await expect(
      gnosisSafe.execTransaction(
        tx.to,
        tx.value,
        tx.data,
        tx.operation,
        tx.safeTxGas,
        tx.baseGas,
        tx.gasPrice,
        tx.gasToken,
        tx.refundReceiver,
        signatureBytes
      )
    ).to.be.revertedWith("Transaction has been vetoed");
  });

  it("A vetoed transaction does not prevent another transaction from being executed", async () => {
    // Create transaction to set the guard address
    const tokenTransferData1 = votesToken.interface.encodeFunctionData(
      "transfer",
      [deployer.address, 1000]
    );

    const tokenTransferData2 = votesToken.interface.encodeFunctionData(
      "transfer",
      [deployer.address, 999]
    );

    const tx1 = buildSafeTransaction({
      to: votesToken.address,
      data: tokenTransferData1,
      safeTxGas: 1000000,
      nonce: await gnosisSafe.nonce(),
    });

    const tx2 = buildSafeTransaction({
      to: votesToken.address,
      data: tokenTransferData2,
      safeTxGas: 1000000,
      nonce: await gnosisSafe.nonce(),
    });

    const sigs1 = [
      await safeSignTypedData(owner1, gnosisSafe, tx1),
      await safeSignTypedData(owner2, gnosisSafe, tx1),
    ];
    const signatureBytes1 = buildSignatureBytes(sigs1);

    const sigs2 = [
      await safeSignTypedData(owner1, gnosisSafe, tx2),
      await safeSignTypedData(owner2, gnosisSafe, tx2),
    ];
    const signatureBytes2 = buildSignatureBytes(sigs2);

    await vetoGuard.queueTransaction(
      tx1.to,
      tx1.value,
      tx1.data,
      tx1.operation,
      tx1.safeTxGas,
      tx1.baseGas,
      tx1.gasPrice,
      tx1.gasToken,
      tx1.refundReceiver,
      signatureBytes1
    );

    const txHash1 = await vetoERC20Voting.getTransactionHash(
      tx1.to,
      tx1.value,
      tx1.data,
      tx1.operation,
      tx1.safeTxGas,
      tx1.baseGas,
      tx1.gasPrice,
      tx1.gasToken,
      tx1.refundReceiver
    );

    // Vetoer 1 casts 500 veto votes
    await vetoERC20Voting.connect(tokenVetoer1).castVetoVote(txHash1, false);

    // Vetoer 2 casts 600 veto votes
    await vetoERC20Voting.connect(tokenVetoer2).castVetoVote(txHash1, false);

    // 1100 veto votes have been cast
    expect(
      await vetoERC20Voting.getVetoVotes(
        tx1.to,
        tx1.value,
        tx1.data,
        tx1.operation,
        tx1.safeTxGas,
        tx1.baseGas,
        tx1.gasPrice,
        tx1.gasToken,
        tx1.refundReceiver
      )
    ).to.eq(1100);

    expect(
      await vetoERC20Voting.getIsVetoed(
        tx1.to,
        tx1.value,
        tx1.data,
        tx1.operation,
        tx1.safeTxGas,
        tx1.baseGas,
        tx1.gasPrice,
        tx1.gasToken,
        tx1.refundReceiver
      )
    ).to.eq(true);

    // Mine blocks to surpass the execution delay
    for (let i = 0; i < 9; i++) {
      await network.provider.send("evm_mine");
    }

    await expect(
      gnosisSafe.execTransaction(
        tx1.to,
        tx1.value,
        tx1.data,
        tx1.operation,
        tx1.safeTxGas,
        tx1.baseGas,
        tx1.gasPrice,
        tx1.gasToken,
        tx1.refundReceiver,
        signatureBytes1
      )
    ).to.be.revertedWith("Transaction has been vetoed");

    // Tx1 has been vetoed, now try to queue and execute tx2
    await vetoGuard.queueTransaction(
      tx2.to,
      tx2.value,
      tx2.data,
      tx2.operation,
      tx2.safeTxGas,
      tx2.baseGas,
      tx2.gasPrice,
      tx2.gasToken,
      tx2.refundReceiver,
      signatureBytes2
    );

    // Mine blocks to surpass the execution delay
    for (let i = 0; i < 9; i++) {
      await network.provider.send("evm_mine");
    }

    await gnosisSafe.execTransaction(
      tx2.to,
      tx2.value,
      tx2.data,
      tx2.operation,
      tx2.safeTxGas,
      tx2.baseGas,
      tx2.gasPrice,
      tx2.gasToken,
      tx2.refundReceiver,
      signatureBytes2
    );

    expect(await votesToken.balanceOf(deployer.address)).to.eq(999);
    expect(await votesToken.balanceOf(gnosisSafe.address)).to.eq(1);
  });

  it.only("A frozen DAO cannot execute any transactions", async () => {
    // Create transaction to set the guard address
    const tokenTransferData1 = votesToken.interface.encodeFunctionData(
      "transfer",
      [deployer.address, 1000]
    );

    const tokenTransferData2 = votesToken.interface.encodeFunctionData(
      "transfer",
      [deployer.address, 999]
    );

    const tokenTransferData3 = votesToken.interface.encodeFunctionData(
      "transfer",
      [deployer.address, 998]
    );

    const tx1 = buildSafeTransaction({
      to: votesToken.address,
      data: tokenTransferData1,
      safeTxGas: 1000000,
      nonce: await gnosisSafe.nonce(),
    });

    const tx2 = buildSafeTransaction({
      to: votesToken.address,
      data: tokenTransferData2,
      safeTxGas: 1000000,
      nonce: await gnosisSafe.nonce(),
    });

    const tx3 = buildSafeTransaction({
      to: votesToken.address,
      data: tokenTransferData3,
      safeTxGas: 1000000,
      nonce: await gnosisSafe.nonce(),
    });

    const sigs1 = [
      await safeSignTypedData(owner1, gnosisSafe, tx1),
      await safeSignTypedData(owner2, gnosisSafe, tx1),
    ];
    const signatureBytes1 = buildSignatureBytes(sigs1);

    const sigs2 = [
      await safeSignTypedData(owner1, gnosisSafe, tx2),
      await safeSignTypedData(owner2, gnosisSafe, tx2),
    ];
    const signatureBytes2 = buildSignatureBytes(sigs2);

    const sigs3 = [
      await safeSignTypedData(owner1, gnosisSafe, tx3),
      await safeSignTypedData(owner2, gnosisSafe, tx3),
    ];
    const signatureBytes3 = buildSignatureBytes(sigs3);

    await vetoGuard.queueTransaction(
      tx1.to,
      tx1.value,
      tx1.data,
      tx1.operation,
      tx1.safeTxGas,
      tx1.baseGas,
      tx1.gasPrice,
      tx1.gasToken,
      tx1.refundReceiver,
      signatureBytes1
    );

    const txHash1 = await vetoERC20Voting.getTransactionHash(
      tx1.to,
      tx1.value,
      tx1.data,
      tx1.operation,
      tx1.safeTxGas,
      tx1.baseGas,
      tx1.gasPrice,
      tx1.gasToken,
      tx1.refundReceiver
    );

    // Vetoer 1 casts 500 veto votes and 500 freeze votes
    await vetoERC20Voting.connect(tokenVetoer1).castVetoVote(txHash1, true);

    // Vetoer 2 casts 600 veto votes
    await vetoERC20Voting.connect(tokenVetoer2).castVetoVote(txHash1, true);

    // 1100 veto votes have been cast
    expect(
      await vetoERC20Voting.getVetoVotes(
        tx1.to,
        tx1.value,
        tx1.data,
        tx1.operation,
        tx1.safeTxGas,
        tx1.baseGas,
        tx1.gasPrice,
        tx1.gasToken,
        tx1.refundReceiver
      )
    ).to.eq(1100);

    // 1100 freeze votes have been cast
    expect(
      await vetoERC20Voting.getFreezeVotes(
        tx1.to,
        tx1.value,
        tx1.data,
        tx1.operation,
        tx1.safeTxGas,
        tx1.baseGas,
        tx1.gasPrice,
        tx1.gasToken,
        tx1.refundReceiver
      )
    ).to.eq(1100);

    expect(
      await vetoERC20Voting.getIsVetoed(
        tx1.to,
        tx1.value,
        tx1.data,
        tx1.operation,
        tx1.safeTxGas,
        tx1.baseGas,
        tx1.gasPrice,
        tx1.gasToken,
        tx1.refundReceiver
      )
    ).to.eq(true);

    // Check that the DAO has been frozen
    expect(await vetoERC20Voting.isFrozen()).to.eq(true);

    // Mine blocks to surpass the execution delay
    for (let i = 0; i < 9; i++) {
      await network.provider.send("evm_mine");
    }

    await expect(
      gnosisSafe.execTransaction(
        tx1.to,
        tx1.value,
        tx1.data,
        tx1.operation,
        tx1.safeTxGas,
        tx1.baseGas,
        tx1.gasPrice,
        tx1.gasToken,
        tx1.refundReceiver,
        signatureBytes1
      )
    ).to.be.revertedWith("Transaction has been vetoed");

    // Queue tx2
    await vetoGuard.queueTransaction(
      tx2.to,
      tx2.value,
      tx2.data,
      tx2.operation,
      tx2.safeTxGas,
      tx2.baseGas,
      tx2.gasPrice,
      tx2.gasToken,
      tx2.refundReceiver,
      signatureBytes2
    );

    // Mine blocks to surpass the execution delay
    for (let i = 0; i < 9; i++) {
      await network.provider.send("evm_mine");
    }

    await expect(
      gnosisSafe.execTransaction(
        tx2.to,
        tx2.value,
        tx2.data,
        tx2.operation,
        tx2.safeTxGas,
        tx2.baseGas,
        tx2.gasPrice,
        tx2.gasToken,
        tx2.refundReceiver,
        signatureBytes2
      )
    ).to.be.revertedWith("Transaction has been vetoed");

    // Queue tx3
    await vetoGuard.queueTransaction(
      tx3.to,
      tx3.value,
      tx3.data,
      tx3.operation,
      tx3.safeTxGas,
      tx3.baseGas,
      tx3.gasPrice,
      tx3.gasToken,
      tx3.refundReceiver,
      signatureBytes3
    );

    // Mine blocks to surpass the execution delay
    for (let i = 0; i < 9; i++) {
      await network.provider.send("evm_mine");
    }

    await expect(
      gnosisSafe.execTransaction(
        tx3.to,
        tx3.value,
        tx3.data,
        tx3.operation,
        tx3.safeTxGas,
        tx3.baseGas,
        tx3.gasPrice,
        tx3.gasToken,
        tx3.refundReceiver,
        signatureBytes3
      )
    ).to.be.revertedWith("Transaction has been vetoed");
  });

  it("A vetoer cannot cast veto votes more than once", async () => {
    // Create transaction to set the guard address
    const tokenTransferData = votesToken.interface.encodeFunctionData(
      "transfer",
      [deployer.address, 1000]
    );

    const tx = buildSafeTransaction({
      to: votesToken.address,
      data: tokenTransferData,
      safeTxGas: 1000000,
      nonce: await gnosisSafe.nonce(),
    });

    const sigs = [
      await safeSignTypedData(owner1, gnosisSafe, tx),
      await safeSignTypedData(owner2, gnosisSafe, tx),
    ];
    const signatureBytes = buildSignatureBytes(sigs);

    await vetoGuard.queueTransaction(
      tx.to,
      tx.value,
      tx.data,
      tx.operation,
      tx.safeTxGas,
      tx.baseGas,
      tx.gasPrice,
      tx.gasToken,
      tx.refundReceiver,
      signatureBytes
    );

    const txHash = await vetoERC20Voting.getTransactionHash(
      tx.to,
      tx.value,
      tx.data,
      tx.operation,
      tx.safeTxGas,
      tx.baseGas,
      tx.gasPrice,
      tx.gasToken,
      tx.refundReceiver
    );

    // Vetoer 1 casts 500 veto votes
    await vetoERC20Voting.connect(tokenVetoer1).castVetoVote(txHash, false);

    await expect(
      vetoERC20Voting.connect(tokenVetoer1).castVetoVote(txHash, false)
    ).to.be.revertedWith("User has already voted");
  });

  it("A veto vote cannot be cast if the transaction has not been queued yet", async () => {
    // Create transaction to set the guard address
    const tokenTransferData = votesToken.interface.encodeFunctionData(
      "transfer",
      [deployer.address, 1000]
    );

    const tx = buildSafeTransaction({
      to: votesToken.address,
      data: tokenTransferData,
      safeTxGas: 1000000,
      nonce: await gnosisSafe.nonce(),
    });

    const txHash = await vetoERC20Voting.getTransactionHash(
      tx.to,
      tx.value,
      tx.data,
      tx.operation,
      tx.safeTxGas,
      tx.baseGas,
      tx.gasPrice,
      tx.gasToken,
      tx.refundReceiver
    );

    await expect(
      vetoERC20Voting.connect(tokenVetoer1).castVetoVote(txHash, false)
    ).to.be.revertedWith("Transaction has not yet been queued");
  });
});
