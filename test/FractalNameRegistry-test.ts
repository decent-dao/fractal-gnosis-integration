import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers } from "hardhat";

import {
  FractalNameRegistry,
  FractalNameRegistry__factory,
} from "../typechain-types";

describe("Fractal Name Registry", () => {
  // Deployed contracts
  let fractalNameRegistry: FractalNameRegistry;

  // Addresses
  let deployer: SignerWithAddress;
  let dao1: SignerWithAddress;
  let dao2: SignerWithAddress;
  let dao3: SignerWithAddress;

  beforeEach(async () => {
    [deployer, dao1, dao2, dao3] = await ethers.getSigners();

    // Deploy the Fractal Name Registry
    fractalNameRegistry = await new FractalNameRegistry__factory(
      deployer
    ).deploy();
  });

  it("DAO addresses are initialized with an empty string", async () => {
    expect(await fractalNameRegistry.getDAOName(dao1.address)).to.eq("");
    expect(await fractalNameRegistry.getDAOName(dao2.address)).to.eq("");
    expect(await fractalNameRegistry.getDAOName(dao3.address)).to.eq("");
  });

  it("A DAO can update its string", async () => {
    await fractalNameRegistry.connect(dao1).updateDAOName("Decent Dawgs");

    expect(await fractalNameRegistry.getDAOName(dao1.address)).to.eq(
      "Decent Dawgs"
    );
    expect(await fractalNameRegistry.getDAOName(dao2.address)).to.eq("");
    expect(await fractalNameRegistry.getDAOName(dao3.address)).to.eq("");
  });

  it("DAOs can update their names multiple times", async () => {
    await fractalNameRegistry.connect(dao1).updateDAOName("Decent Dawgs");

    expect(await fractalNameRegistry.getDAOName(dao1.address)).to.eq(
      "Decent Dawgs"
    );
    expect(await fractalNameRegistry.getDAOName(dao2.address)).to.eq("");
    expect(await fractalNameRegistry.getDAOName(dao3.address)).to.eq("");

    await fractalNameRegistry.connect(dao1).updateDAOName("Yea DAO");

    expect(await fractalNameRegistry.getDAOName(dao1.address)).to.eq("Yea DAO");
    expect(await fractalNameRegistry.getDAOName(dao2.address)).to.eq("");
    expect(await fractalNameRegistry.getDAOName(dao3.address)).to.eq("");

    await fractalNameRegistry.connect(dao2).updateDAOName("Decent Engineering");

    expect(await fractalNameRegistry.getDAOName(dao1.address)).to.eq("Yea DAO");
    expect(await fractalNameRegistry.getDAOName(dao2.address)).to.eq(
      "Decent Engineering"
    );
    expect(await fractalNameRegistry.getDAOName(dao3.address)).to.eq("");

    await fractalNameRegistry.connect(dao3).updateDAOName("Decent Branding");

    expect(await fractalNameRegistry.getDAOName(dao1.address)).to.eq("Yea DAO");
    expect(await fractalNameRegistry.getDAOName(dao2.address)).to.eq(
      "Decent Engineering"
    );
    expect(await fractalNameRegistry.getDAOName(dao3.address)).to.eq(
      "Decent Branding"
    );
  });
});
