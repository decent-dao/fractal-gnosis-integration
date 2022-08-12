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
} from "../typechain-types";

describe("MetaFactory", () => {
  // Factories
  let daoFactory: DAOFactory;
  let metaFactory: MetaFactory;
  let gnosisFactory: Contract;

  // Impl
  let accessControlImpl: DAOAccessControl;
  let daoImpl: DAO;

  // Deployed contracts
  let accessControl: DAOAccessControl;
  let dao: DAO;
  let gnosisSafe: Contract;

  // Wallets
  let deployer: SignerWithAddress;
  let owner1: SignerWithAddress;
  let owner2: SignerWithAddress;
  let owner3: SignerWithAddress;

  let tx: ContractTransaction;

  // Gnosis
  const gnosisFactoryAddress = "0xa6B71E26C5e0845f74c812102Ca7114b6a896AB2";
  const gnosisSingletonAddress = "0xd9Db270c1B5E3Bd161E8c8503c55cEABeE709552";
  const threshold = 2;
  const saltNum = BigNumber.from(
    "0x856d90216588f9ffc124d1480a440e1c012c7a816952bc968d737bae5d4e139c"
  );
  const initializer = ethers.constants.HashZero;
  const iface = new Interface([
    "function createProxyWithNonce(address _singleton, bytes memory initializer, uint256 saltNonce) returns (GnosisSafeProxy proxy)",
  ]);

  const ifaceSafe = new Interface([
    "function setup(address[] calldata _owners,uint256 _threshold,address to,bytes calldata data,address fallbackHandler,address paymentToken,uint256 payment,address payable paymentReceiver)",
  ]);

  const abi = [
    "event ProxyCreation(address proxy, address singleton)",
    "function createProxy(address singleton, bytes memory data) public returns (address proxy)",
    "function proxyRuntimeCode() public pure returns (bytes memory)",
    "function proxyCreationCode() public pure returns (bytes memory)",
    "function createProxyWithNonce(address _singleton,bytes memory initializer,uint256 saltNonce) returns (address proxy)",
    "function createProxyWithCallback(address _singleton,bytes memory initializer,uint256 saltNonce,IProxyCreationCallback callback) public returns (GnosisSafeProxy proxy)",
    "function calculateCreateProxyWithNonceAddress(address _singleton,bytes calldata initializer,uint256 saltNonce) external returns (address proxy)",
  ];

  const abiSafe = [
    "event SafeSetup(address indexed initiator, address[] owners, uint256 threshold, address initializer, address fallbackHandler)",
    "function isOwner(address owner) public view returns (bool)",
    "function getThreshold() public view returns (uint256)",
    "function setup(address[] calldata _owners,uint256 _threshold,address to,bytes calldata data,address fallbackHandler,address paymentToken,uint256 payment,address payable paymentReceiver)",
  ];

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

    // Get deployed MetaFactory contract
    metaFactory = await new MetaFactory__factory(deployer).deploy();

    // Get deployed factory contracts
    daoFactory = await new DAOFactory__factory(deployer).deploy();

    // Get deployed implementation contracts
    daoImpl = await new DAO__factory(deployer).deploy();
    accessControlImpl = await new DAOAccessControl__factory(deployer).deploy();

    const abiCoder = new ethers.utils.AbiCoder();
    const { chainId } = await ethers.provider.getNetwork();

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

    const createGnosisSetupCalldata = ifaceSafe.encodeFunctionData("setup", [
      [owner1.address, owner2.address, owner3.address],
      threshold,
      ethers.constants.AddressZero,
      ethers.constants.HashZero,
      ethers.constants.AddressZero,
      ethers.constants.AddressZero,
      0,
      ethers.constants.AddressZero,
    ]);

    const predictedGnosisSafeAddress = ethers.utils.getCreate2Address(
      gnosisFactory.address,
      ethers.utils.solidityKeccak256(
        ["bytes", "uint256"],
        [
          ethers.utils.solidityKeccak256(
            ["bytes"],
            [createGnosisSetupCalldata]
          ),
          saltNum,
        ]
      ),
      ethers.utils.solidityKeccak256(
        ["bytes", "uint256"],
        [
          // eslint-disable-next-line camelcase
          await gnosisFactory.proxyCreationCode(),
          gnosisSingletonAddress,
        ]
      )
    );

    accessControl = await ethers.getContractAt(
      "DAOAccessControl",
      predictedAccessControlAddress
    );

    dao = await ethers.getContractAt("DAO", predictedDAOAddress);

    gnosisSafe = new ethers.Contract(
      predictedGnosisSafeAddress,
      abiSafe,
      deployer
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

    const createGnosisSafeCalldata = iface.encodeFunctionData(
      "createProxyWithNonce",
      [gnosisSingletonAddress, createGnosisSetupCalldata, saltNum]
    );

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
      [],
      [],
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

  it("Emitted events with expected deployed contract addresses", async () => {
    await expect(tx)
      .to.emit(metaFactory, "DAOCreated")
      .withArgs(dao.address, accessControl.address, deployer.address);

    await expect(tx)
      .to.emit(daoFactory, "DAOCreated")
      .withArgs(
        dao.address,
        accessControl.address,
        metaFactory.address,
        deployer.address
      );
    await expect(tx)
      .to.emit(gnosisFactory, "ProxyCreation")
      .withArgs(gnosisSafe.address, gnosisSingletonAddress);
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

  it("Setup the correct roles", async () => {
    expect(await accessControl.hasRole("DAO_ROLE", dao.address)).to.eq(true);

    expect(await accessControl.hasRole("DAO_ROLE", metaFactory.address)).to.eq(
      false
    );

    expect(
      await accessControl.hasRole("EXECUTE_ROLE", metaFactory.address)
    ).to.eq(false);

    expect(await accessControl.hasRole("UPGRADE_ROLE", dao.address)).to.eq(
      true
    );
  });

  it("Sets up the correct DAO role authorization", async () => {
    expect(
      await accessControl.isRoleAuthorized(
        "EXECUTE_ROLE",
        dao.address,
        "execute(address[],uint256[],bytes[])"
      )
    ).to.eq(true);

    expect(
      await accessControl.isRoleAuthorized(
        "UPGRADE_ROLE",
        dao.address,
        "upgradeTo(address)"
      )
    ).to.eq(true);
  });
});
