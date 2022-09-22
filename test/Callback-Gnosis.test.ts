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
import { CallbackGnosis } from "../typechain-types/contracts/CallbackGnosis";
import { CallbackGnosis__factory } from "../typechain-types/factories/contracts/CallbackGnosis__factory";

import {
  buildSignatureBytes,
  buildSafeTransaction,
  safeSignTypedData,
  ifaceSafe,
  abi,
  predictGnosisSafeAddress,
  abiSafe,
  predictGnosisSafeCallbackAddress,
} from "./helpers";

describe.only("Gnosis Safe", () => {
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
  let mockAccessControl: SignerWithAddress;

  // Gnosis
  let createGnosisSetupCalldata: string;
  let callback: CallbackGnosis;

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
      mockAccessControl,
    ] = await ethers.getSigners();

    // Get deployed Gnosis Safe
    gnosisFactory = new ethers.Contract(gnosisFactoryAddress, abi, deployer);
    // Deploy VetoGuard contract with a 10 block delay between queuing and execution
    vetoGuard = await new VetoGuard__factory(deployer).deploy(
      vetoGuardOwner.address,
      10,
      owner1.address,
      owner1.address
    );

    const setGuardCalldata = ifaceSafe.encodeFunctionData("enableModule", [
      vetoGuard.address,
    ]);
    callback = await new CallbackGnosis__factory(deployer).deploy();

    const callbackinterface = new ethers.utils.Interface(
      // eslint-disable-next-line camelcase
      CallbackGnosis__factory.abi
    );
    const calldata = callbackinterface.encodeFunctionData("test", []);
    const abiCoder = new ethers.utils.AbiCoder();

    // const bytecode = abiCoder.encode(
    //   [
    //     "address[]",
    //     "uint256",
    //     "address",
    //     "bytes",
    //     "address",
    //     "address",
    //     "uint256",
    //     "address",
    //   ],
    //   [
    //     [owner1.address, owner2.address, owner3.address],
    //     threshold,
    //     callback.address, // mulit-send Goreli
    //     calldata, // contract tx
    //     ethers.constants.AddressZero,
    //     ethers.constants.AddressZero,
    //     0,
    //     ethers.constants.AddressZero,
    //   ]
    // );

    // bytescode.push(createGnosisSetupCalldata);
    // bytescode.push(createGnosisSetupCalldata2);

    createGnosisSetupCalldata = ifaceSafe.encodeFunctionData("setup", [
      [owner1.address, owner2.address, owner3.address],
      threshold,
      callback.address,
      calldata,
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

    // // Deploy VetoGuard contract with a 10 block delay between queuing and execution
    // vetoGuard = await new VetoGuard__factory(deployer).deploy(
    //   vetoGuardOwner.address,
    //   10,
    //   vetoERC20Voting.address,
    //   gnosisSafe.address
    // );

    // Deploy Gnosis Safe
    await gnosisFactory.createProxyWithNonce(
      gnosisSingletonAddress,
      createGnosisSetupCalldata,
      saltNum
    );

    // Get Gnosis Safe contract
    gnosisSafe = new ethers.Contract(
      predictedGnosisSafeAddress,
      abiSafe,
      deployer
    );

    // // Vetoers delegate their votes to themselves
    // await votesToken.connect(tokenVetoer1).delegate(tokenVetoer1.address);
    // await votesToken.connect(tokenVetoer2).delegate(tokenVetoer2.address);

    // // Deploy VetoERC20Voting contract
    // vetoERC20Voting = await new VetoERC20Voting__factory(deployer).deploy();

    // // Initialize VetoERC20Voting contract
    // await vetoERC20Voting.initialize(
    //   1000,
    //   votesToken.address,
    //   vetoGuard.address,
    //   mockAccessControl.address
    // );

    // const tx = buildSafeTransaction({
    //   to: gnosisSafe.address,
    //   data: setGuardData,
    //   safeTxGas: 1000000,
    //   nonce: await gnosisSafe.nonce(),
    // });
    // const sigs = [
    //   await safeSignTypedData(owner1, gnosisSafe, tx),
    //   await safeSignTypedData(owner2, gnosisSafe, tx),
    // ];
    // const signatureBytes = buildSignatureBytes(sigs);

    // Execute transaction that adds the veto guard to the Safe
    // await expect(
    //   gnosisSafe.execTransaction(
    //     tx.to,
    //     tx.value,
    //     tx.data,
    //     tx.operation,
    //     tx.safeTxGas,
    //     tx.baseGas,
    //     tx.gasPrice,
    //     tx.gasToken,
    //     tx.refundReceiver,
    //     signatureBytes
    //   )
    // ).to.emit(gnosisSafe, "ExecutionSuccess");

    // Gnosis Safe received the 1,000 tokens
    // expect(await votesToken.balanceOf(gnosisSafe.address)).to.eq(1000);
  });

  describe("Gnosis Safe with VetoGuard", () => {
    it("A transaction can be queued and executed", async () => {
      //   // Create transaction to set the guard address
      // console.log(await vetoGuard.supportsInterface("0xe6d7a83a"));
      console.log(`callback` + callback.address);
      console.log(`factory` + gnosisFactory.address);
      console.log((await gnosisSafe.getThreshold()).toString());
      // console.log((await gnosisSafe.getGuard()).toString());
    });
  });
});
