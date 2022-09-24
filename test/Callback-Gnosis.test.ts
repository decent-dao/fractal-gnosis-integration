import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { BigNumber, Contract } from "ethers";
import { ethers, network } from "hardhat";
import {
  VetoGuard,
  VetoGuard__factory,
  VetoGuardFactory,
} from "../typechain-types";
import { CallbackGnosis } from "../typechain-types/contracts/CallbackGnosis";
import { CallbackGnosis__factory } from "../typechain-types/factories/contracts/CallbackGnosis__factory";
import { VetoGuardFactory__factory } from "../typechain-types/factories/contracts/VetoGuardFactory__factory";

import {
  ifaceSafe,
  abi,
  abiSafe,
  predictGnosisSafeCallbackAddress,
} from "./helpers";

describe.only("Gnosis Safe", () => {
  // Factories
  let gnosisFactory: Contract;

  // Deployed contracts
  let gnosisSafe: Contract;
  let vetoGuard: VetoGuard;
  let vetoGuardFactory: VetoGuardFactory;
  let callback: CallbackGnosis;

  // Wallets
  let deployer: SignerWithAddress;
  let owner1: SignerWithAddress;
  let owner2: SignerWithAddress;
  let owner3: SignerWithAddress;

  const gnosisFactoryAddress = "0xa6B71E26C5e0845f74c812102Ca7114b6a896AB2";
  const gnosisSingletonAddress = "0xd9Db270c1B5E3Bd161E8c8503c55cEABeE709552";
  const threshold = 2;
  let setGuardCalldata: string;
  let predictedVetoGuard: string;
  let bytecode: string;
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

    [deployer, owner1, owner2, owner3] = await ethers.getSigners();

    const { chainId } = await ethers.provider.getNetwork();
    const abiCoder = new ethers.utils.AbiCoder(); // encode data

    gnosisFactory = new ethers.Contract(gnosisFactoryAddress, abi, deployer); // Gnosis Factory
    callback = await new CallbackGnosis__factory(deployer).deploy(); // Gnosis Callback

    // Deploy VetoGuardFactory
    vetoGuardFactory = await new VetoGuardFactory__factory(deployer).deploy();
    predictedVetoGuard = ethers.utils.getCreate2Address(
      vetoGuardFactory.address,
      ethers.utils.solidityKeccak256(
        ["uint256", "bytes32"],
        [chainId, ethers.utils.formatBytes32String("salt")]
      ),
      ethers.utils.solidityKeccak256(
        ["bytes"],
        [
          // eslint-disable-next-line camelcase
          VetoGuard__factory.bytecode,
        ]
      )
    );

    vetoGuard = await ethers.getContractAt("VetoGuard", predictedVetoGuard);

    const sigs =
      "0x000000000000000000000000" +
      callback.address.slice(2) +
      "0000000000000000000000000000000000000000000000000000000000000000" +
      "01";

    // Setup GNOSIS
    const createGnosisCalldata = ifaceSafe.encodeFunctionData("setup", [
      [owner1.address, owner2.address, owner3.address, callback.address],
      1,
      ethers.constants.AddressZero,
      ethers.constants.HashZero,
      ethers.constants.AddressZero,
      ethers.constants.AddressZero,
      0,
      ethers.constants.AddressZero,
    ]);

    // DEPLOY GUARD
    const factoryData = [
      abiCoder.encode(["bytes32"], [ethers.utils.formatBytes32String("salt")]),
    ];

    const createGuardCalldata = vetoGuardFactory.interface.encodeFunctionData(
      "create",
      [owner1.address, factoryData]
    );

    // SET GUARD
    setGuardCalldata = ifaceSafe.encodeFunctionData("setGuard", [
      predictedVetoGuard,
    ]);

    // REMOVE OWNER
    const removeCalldata = ifaceSafe.encodeFunctionData("removeOwner", [
      owner3.address,
      callback.address,
      threshold,
    ]);

    // INIT GUARD
    const initParams = abiCoder.encode(
      ["uint256", "address", "address"],
      [10, owner1.address, owner1.address]
    );

    const initGuard = vetoGuard.interface.encodeFunctionData("setUp", [
      initParams,
    ]);

    // TX Array
    const txdata = abiCoder.encode(
      ["address[][]", "bytes[][]", "bool[]"],
      [
        [
          [ethers.constants.AddressZero],
          [
            vetoGuardFactory.address, // deploy Guard
          ],
          [
            ethers.constants.AddressZero, // setGuard Gnosis
            ethers.constants.AddressZero, // remove owner + threshold
            vetoGuard.address, // setup Guard
          ],
        ],
        [
          [createGnosisCalldata],
          [createGuardCalldata],
          [setGuardCalldata, removeCalldata, initGuard],
        ],
        [false, false, true],
      ]
    );
    bytecode = abiCoder.encode(["bytes", "bytes"], [txdata, sigs]);

    // Predidct Gnosis Safe
    const predictedGnosisSafeAddress = await predictGnosisSafeCallbackAddress(
      gnosisFactory.address,
      bytecode,
      saltNum,
      callback.address,
      gnosisSingletonAddress,
      gnosisFactory
    );

    // Get Gnosis Safe contract
    gnosisSafe = new ethers.Contract(
      predictedGnosisSafeAddress,
      abiSafe,
      deployer
    );
  });

  describe("Gnosis Safe with VetoGuard", () => {
    it("Creates a safe and emits changeGuard event", async () => {
      // Deploy Gnosis Safe
      await expect(
        gnosisFactory.createProxyWithCallback(
          gnosisSingletonAddress,
          bytecode,
          saltNum,
          callback.address
        )
      )
        .to.emit(gnosisSafe, "ChangedGuard")
        .withArgs(vetoGuard.address);

      expect(await vetoGuard.executionDelayBlocks()).eq(10);
      expect(await vetoGuard.vetoERC20Voting()).eq(owner1.address);
      expect(await vetoGuard.gnosisSafe()).eq(gnosisSafe.address);
      expect(await gnosisSafe.isOwner(owner1.address)).eq(true);
      expect(await gnosisSafe.isOwner(owner2.address)).eq(true);
      expect(await gnosisSafe.isOwner(owner3.address)).eq(true);
      expect(await gnosisSafe.isOwner(callback.address)).eq(false);
      expect(await gnosisSafe.getThreshold()).eq(threshold);
    });
  });
});
