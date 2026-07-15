#!/usr/bin/env node
/**
 * @chainlink/contracts-ccip is Foundry-oriented: its sources import OpenZeppelin as
 * "@openzeppelin/contracts@4.8.3/..." which only resolves through Foundry remappings.
 * npm installs those aliased dependencies as "@openzeppelin/contracts-4.8.3" (dash).
 * Hardhat 2 has no remapping support, so we create symlinks matching the import paths.
 */
const fs = require("fs");
const path = require("path");

const ozDir = path.join(__dirname, "..", "node_modules", "@openzeppelin");

for (const version of ["4.8.3", "5.0.2"]) {
  const target = `contracts-${version}`;
  const linkName = path.join(ozDir, `contracts@${version}`);
  if (!fs.existsSync(path.join(ozDir, target))) {
    console.warn(`postinstall: ${target} not found, skipping symlink`);
    continue;
  }
  try {
    fs.symlinkSync(target, linkName, "dir");
    console.log(`postinstall: linked @openzeppelin/contracts@${version} -> ${target}`);
  } catch (err) {
    if (err.code !== "EEXIST") throw err;
  }
}
