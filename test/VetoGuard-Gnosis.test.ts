import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { BigNumber, Contract } from "ethers";
import { ethers, network } from "hardhat";
import {
  Token,
  Token__factory,
  VetoGuard,
  VetoGuard__factory,
} from "../typechain-types";

import {
  buildSignatureBytes,
  buildSafeTransaction,
  safeSignTypedData,
  ifaceSafe,
  abi,
} from "./helpers";

describe.only("Gnosis Safe Veto Guard", () => {
  // Factories
  let gnosisFactory: Contract;

  // Deployed contracts
  let gnosisSafe: Contract;
  let vetoGuard: VetoGuard;
  let token: Token;

  // Wallets
  let deployer: SignerWithAddress;
  let owner1: SignerWithAddress;
  let owner2: SignerWithAddress;
  let owner3: SignerWithAddress;
  let vetoGuardOwner: SignerWithAddress;

  // Gnosis
  let createGnosisSetupCalldata: string;

  async function predictGnosisSafeAddress(
    factory: string,
    calldata: string,
    saltNum: string | BigNumber,
    singleton: string
  ) {
    return ethers.utils.getCreate2Address(
      factory,
      ethers.utils.solidityKeccak256(
        ["bytes", "uint256"],
        [ethers.utils.solidityKeccak256(["bytes"], [calldata]), saltNum]
      ),
      ethers.utils.solidityKeccak256(
        ["bytes", "uint256"],
        [
          // eslint-disable-next-line camelcase
          await gnosisFactory.proxyCreationCode(),
          singleton,
        ]
      )
    );
  }

  const gnosisFactoryAddress = "0xa6B71E26C5e0845f74c812102Ca7114b6a896AB2";
  const gnosisSingletonAddress = "0xd9Db270c1B5E3Bd161E8c8503c55cEABeE709552";
  const threshold = 2;
  const saltNum = BigNumber.from(
    "0x856d90216588f9ffc124d1480a440e1c012c7a816952bc968d737bae5d4e139c"
  );

  beforeEach(async () => {
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

    [deployer, owner1, owner2, owner3, vetoGuardOwner] =
      await ethers.getSigners();

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
      gnosisSingletonAddress
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

    // Deploy token, give supply to Gnosis Safe
    token = await new Token__factory(deployer).deploy(
      "DCNT",
      "DCNT",
      predictedGnosisSafeAddress,
      1000
    );

    // Deploy veto guard contract with a 10 block delay between queuing and execution
    vetoGuard = await new VetoGuard__factory(deployer).deploy(
      vetoGuardOwner.address,
      10
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
    expect(await token.balanceOf(gnosisSafe.address)).to.eq(1000);
  });

  describe("Native Gnosis Safe with VetoGuard", () => {
    it("A transaction can be queued and executed", async () => {
      // Create transaction to set the guard address
      const tokenTransferData = token.interface.encodeFunctionData("transfer", [
        deployer.address,
        1000,
      ]);

      const tx = buildSafeTransaction({
        to: gnosisSafe.address,
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
        signatureBytes,
        deployer.address
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
    });

    it("A transaction cannot be executed if it hasn't yet been queued", async () => {
      // Create transaction to set the guard address
      const tokenTransferData = token.interface.encodeFunctionData("transfer", [
        deployer.address,
        1000,
      ]);

      const tx = buildSafeTransaction({
        to: gnosisSafe.address,
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
      ).to.be.revertedWith("Transaction is not in the queued state");
    });
  });

  it("A transaction cannot be executed if the delay period has not been reached yet", async () => {
    // Create transaction to set the guard address
    const tokenTransferData = token.interface.encodeFunctionData("transfer", [
      deployer.address,
      1000,
    ]);

    const tx = buildSafeTransaction({
      to: gnosisSafe.address,
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
      signatureBytes,
      deployer.address
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
});
