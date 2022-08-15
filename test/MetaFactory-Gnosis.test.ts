import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { BigNumber, Contract, ContractTransaction } from "ethers";
import { Interface } from "ethers/lib/utils";
import { ethers, network } from "hardhat";
import {
  DAO__factory,
  DAO,
  DAOFactory,
  DAOFactory__factory,
  DAOAccessControl,
  DAOAccessControl__factory,
  MetaFactory,
  MetaFactory__factory,
  ERC1967Proxy__factory,
  GnosisWrapperFactory,
  GnosisWrapper,
  GnosisWrapper__factory,
  GnosisWrapperFactory__factory,
  IGnosisWrapper,
  IGnosisWrapper__factory,
} from "../typechain-types";
import getInterfaceSelector from "./getInterfaceSelector";

import {
  safeApproveHash,
  buildSignatureBytes,
  executeContractCallWithSigners,
  buildSafeTransaction,
  executeTx,
  calculateSafeTransactionHash,
  buildContractCall,
  safeSignTypedData,
  ifaceSafe,
  abi,
  abiSafe,
  iface,
} from "./helpers";

describe("Gnosis Integration", () => {
  // Factories
  let daoFactory: DAOFactory;
  let metaFactory: MetaFactory;
  let gnosisFactory: Contract;
  let gnosisWrapperFactory: GnosisWrapperFactory;

  // Impl
  let accessControlImpl: DAOAccessControl;
  let daoImpl: DAO;
  let gnosisWrapperImpl: GnosisWrapper;

  // Deployed contracts
  let accessControl: DAOAccessControl;
  let dao: DAO;
  let gnosisSafe: Contract;
  let gnosisWrapper: GnosisWrapper;

  // Wallets
  let deployer: SignerWithAddress;
  let owner1: SignerWithAddress;
  let owner2: SignerWithAddress;
  let owner3: SignerWithAddress;

  let tx: ContractTransaction;

  // Gnosis
  let createGnosisSetupCalldata: string;
  let createGnosisSafeCalldata: string;

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

    [deployer, owner1, owner2, owner3] = await ethers.getSigners();

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

    gnosisSafe = new ethers.Contract(
      predictedGnosisSafeAddress,
      abiSafe,
      deployer
    );

    createGnosisSafeCalldata = iface.encodeFunctionData(
      "createProxyWithNonce",
      [gnosisSingletonAddress, createGnosisSetupCalldata, saltNum]
    );
  });

  describe("Native Gnosis Safe", () => {
    it("Deploys a native gnosis safe", async () => {
      await expect(
        gnosisFactory.createProxyWithNonce(
          gnosisSingletonAddress,
          createGnosisSetupCalldata,
          saltNum
        )
      )
        .to.emit(gnosisSafe, "SafeSetup")
        .withArgs(
          gnosisFactory.address,
          [owner1.address, owner2.address],
          threshold,
          ethers.constants.AddressZero,
          ethers.constants.AddressZero
        );

      expect(await gnosisSafe.isOwner(owner1.address)).eq(true);
      expect(await gnosisSafe.isOwner(owner2.address)).eq(true);
      expect(await gnosisSafe.isOwner(owner3.address)).eq(true);
      expect(await gnosisSafe.getThreshold()).eq(2);
    });

    it("Owners may sign/execute a transaction", async () => {
      await gnosisFactory.createProxyWithNonce(
        gnosisSingletonAddress,
        createGnosisSetupCalldata,
        saltNum
      );

      const ifaceToken = new Interface([
        "function approve(address spender, uint256 amount) public returns (bool)",
      ]);

      const abiToken = [
        "event Transfer(address indexed from, address indexed to, uint256 value)",
        "function allowance(address owner, address spender) public view returns (uint256)",
        "function approve(address spender, uint256 amount) public returns (bool)",
      ];

      const approveSpenderData = ifaceToken.encodeFunctionData("approve", [
        deployer.address,
        ethers.utils.parseEther("1"),
      ]);

      const tokenContract = new ethers.Contract(
        "0x45442cb17bd3e3c0aeae92bf425473e582d5e740",
        abiToken,
        deployer
      );

      const tx = buildSafeTransaction({
        to: "0x45442cb17bd3e3c0aeae92bf425473e582d5e740",
        data: approveSpenderData,
        safeTxGas: 1000000,
        nonce: await gnosisSafe.nonce(),
      });
      const sigs = [
        await safeSignTypedData(owner1, gnosisSafe, tx),
        await safeSignTypedData(owner2, gnosisSafe, tx),
      ];
      const signatureBytes = buildSignatureBytes(sigs);

      expect(
        await tokenContract.allowance(gnosisSafe.address, deployer.address)
      ).eq(0);

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

      expect(
        await tokenContract.allowance(gnosisSafe.address, deployer.address)
      ).eq(ethers.utils.parseEther("1"));
    });
  });

  describe("Metafactory - Root DAO", () => {
    beforeEach(async () => {
      const abiCoder = new ethers.utils.AbiCoder();
      const { chainId } = await ethers.provider.getNetwork();

      // Get deployed MetaFactory contract
      metaFactory = await new MetaFactory__factory(deployer).deploy();

      // Get deployed factory contracts
      daoFactory = await new DAOFactory__factory(deployer).deploy();
      gnosisWrapperFactory = await new GnosisWrapperFactory__factory(
        deployer
      ).deploy();
      await gnosisWrapperFactory.initialize();

      // Get deployed implementation contracts
      daoImpl = await new DAO__factory(deployer).deploy();
      accessControlImpl = await new DAOAccessControl__factory(
        deployer
      ).deploy();
      gnosisWrapperImpl = await new GnosisWrapper__factory(deployer).deploy();

      const predictedDAOAddress = ethers.utils.getCreate2Address(
        daoFactory.address,
        ethers.utils.solidityKeccak256(
          ["address", "address", "uint256", "bytes32"],
          [
            deployer.address,
            metaFactory.address,
            chainId,
            ethers.utils.formatBytes32String("daoSalt"),
          ]
        ),
        ethers.utils.solidityKeccak256(
          ["bytes", "bytes"],
          [
            // eslint-disable-next-line camelcase
            ERC1967Proxy__factory.bytecode,
            abiCoder.encode(["address", "bytes"], [daoImpl.address, []]),
          ]
        )
      );

      const predictedAccessControlAddress = ethers.utils.getCreate2Address(
        daoFactory.address,
        ethers.utils.solidityKeccak256(
          ["address", "address", "uint256", "bytes32"],
          [
            deployer.address,
            metaFactory.address,
            chainId,
            ethers.utils.formatBytes32String("daoSalt"),
          ]
        ),
        ethers.utils.solidityKeccak256(
          ["bytes", "bytes"],
          [
            // eslint-disable-next-line camelcase
            ERC1967Proxy__factory.bytecode,
            abiCoder.encode(
              ["address", "bytes"],
              [accessControlImpl.address, []]
            ),
          ]
        )
      );

      const predictedGnosisWrapperAddress = ethers.utils.getCreate2Address(
        gnosisWrapperFactory.address,
        ethers.utils.solidityKeccak256(
          ["address", "address", "uint256", "bytes32"],
          [
            deployer.address,
            metaFactory.address,
            chainId,
            ethers.utils.formatBytes32String("wrapperSalt"),
          ]
        ),
        ethers.utils.solidityKeccak256(
          ["bytes", "bytes"],
          [
            // eslint-disable-next-line camelcase
            ERC1967Proxy__factory.bytecode,
            abiCoder.encode(
              ["address", "bytes"],
              [gnosisWrapperImpl.address, []]
            ),
          ]
        )
      );

      accessControl = await ethers.getContractAt(
        "DAOAccessControl",
        predictedAccessControlAddress
      );

      dao = await ethers.getContractAt("DAO", predictedDAOAddress);
      gnosisWrapper = await ethers.getContractAt(
        "GnosisWrapper",
        predictedGnosisWrapperAddress
      );

      const createDAOParams = {
        daoImplementation: daoImpl.address,
        daoFactory: daoFactory.address,
        accessControlImplementation: accessControlImpl.address,
        salt: ethers.utils.formatBytes32String("daoSalt"),
        daoName: "TestDao",
        roles: ["EXECUTE_ROLE", "UPGRADE_ROLE"],
        rolesAdmins: ["DAO_ROLE", "DAO_ROLE"],
        members: [[metaFactory.address], [dao.address]],
        daoFunctionDescs: [
          "execute(address[],uint256[],bytes[])",
          "upgradeTo(address)",
        ],
        daoActionRoles: [["EXECUTE_ROLE"], ["UPGRADE_ROLE"]],
      };

      const wrapperFactoryData = [
        abiCoder.encode(["address"], [predictedAccessControlAddress]),
        abiCoder.encode(["address"], [gnosisSafe.address]),
        abiCoder.encode(["address"], [gnosisWrapperImpl.address]),
        abiCoder.encode(
          ["bytes32"],
          [ethers.utils.formatBytes32String("wrapperSalt")]
        ),
      ];

      const innerAddActionsRolesCalldata =
        accessControl.interface.encodeFunctionData("daoAddActionsRoles", [
          [],
          [],
          [],
        ]);

      const outerAddActionsRolesCalldata = dao.interface.encodeFunctionData(
        "execute",
        [[accessControl.address], [0], [innerAddActionsRolesCalldata]]
      );

      const revokeMetafactoryRoleCalldata =
        accessControl.interface.encodeFunctionData("userRenounceRole", [
          "EXECUTE_ROLE",
          metaFactory.address,
        ]);

      tx = await metaFactory.createDAOAndExecute(
        daoFactory.address,
        createDAOParams,
        [gnosisWrapperFactory.address],
        [wrapperFactoryData],
        [gnosisFactory.address, dao.address, accessControl.address],
        [0, 0, 0],
        [
          createGnosisSafeCalldata,
          outerAddActionsRolesCalldata,
          revokeMetafactoryRoleCalldata,
        ],
        {
          gasLimit: 30000000,
        }
      );
    });

    it("Gnosis Safe is setup", async () => {
      await expect(tx)
        .to.emit(gnosisSafe, "SafeSetup")
        .withArgs(
          gnosisFactory.address,
          [owner1.address, owner2.address, owner3.address],
          2,
          ethers.constants.AddressZero,
          ethers.constants.AddressZero
        );

      expect(await gnosisSafe.isOwner(owner1.address)).eq(true);
      expect(await gnosisSafe.isOwner(owner2.address)).eq(true);
      expect(await gnosisSafe.isOwner(owner3.address)).eq(true);
      expect(await gnosisSafe.getThreshold()).eq(2);
    });

    it("Gnosis Wrapper Setup", async () => {
      await expect(tx)
        .to.emit(gnosisWrapperFactory, "GnosisWrapperCreated")
        .withArgs(gnosisWrapper.address);

      expect(await gnosisWrapper.accessControl()).eq(accessControl.address);
      expect(await gnosisWrapper.gnosisSafe()).eq(gnosisSafe.address);
    });

    it("Supports the expected ERC165 interface", async () => {
      // Supports Module Factory interface
      expect(
        await gnosisWrapper.supportsInterface(
          // eslint-disable-next-line camelcase
          getInterfaceSelector(IGnosisWrapper__factory.createInterface())
        )
      ).to.eq(true);
    });

    it("Owners may sign/execute a transaction", async () => {
      const ifaceToken = new Interface([
        "function approve(address spender, uint256 amount) public returns (bool)",
      ]);

      const abiToken = [
        "event Transfer(address indexed from, address indexed to, uint256 value)",
        "function allowance(address owner, address spender) public view returns (uint256)",
        "function approve(address spender, uint256 amount) public returns (bool)",
      ];

      const approveSpenderData = ifaceToken.encodeFunctionData("approve", [
        deployer.address,
        ethers.utils.parseEther("1"),
      ]);

      const tokenContract = new ethers.Contract(
        "0x45442cb17bd3e3c0aeae92bf425473e582d5e740",
        abiToken,
        deployer
      );

      const tx = buildSafeTransaction({
        to: "0x45442cb17bd3e3c0aeae92bf425473e582d5e740",
        data: approveSpenderData,
        safeTxGas: 1000000,
        nonce: await gnosisSafe.nonce(),
      });
      const sigs = [
        await safeSignTypedData(owner1, gnosisSafe, tx),
        await safeSignTypedData(owner2, gnosisSafe, tx),
      ];
      const signatureBytes = buildSignatureBytes(sigs);

      expect(
        await tokenContract.allowance(gnosisSafe.address, deployer.address)
      ).eq(0);

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

      expect(
        await tokenContract.allowance(gnosisSafe.address, deployer.address)
      ).eq(ethers.utils.parseEther("1"));
    });
  });
});
