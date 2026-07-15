const fs = require("fs");
const path = require("path");
const networks = require("../config/networks");

const DEPLOYMENTS_DIR = path.join(__dirname, "..", "deployments");

function getNetworkConfig(networkName) {
  const cfg = networks[networkName];
  if (!cfg) {
    throw new Error(
      `No CCIP config for network "${networkName}". Use one of: ${Object.keys(networks).join(", ")}`
    );
  }
  return cfg;
}

function deploymentsPath(networkName) {
  return path.join(DEPLOYMENTS_DIR, `${networkName}.json`);
}

function loadDeployments(networkName) {
  const file = deploymentsPath(networkName);
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {};
}

function saveDeployment(networkName, key, value) {
  fs.mkdirSync(DEPLOYMENTS_DIR, { recursive: true });
  const deployments = loadDeployments(networkName);
  deployments[key] = value;
  fs.writeFileSync(deploymentsPath(networkName), JSON.stringify(deployments, null, 2) + "\n");
  console.log(`deployments/${networkName}.json: ${key} = ${value}`);
}

/** Token address: static config (mainnet) or local deployments file. */
function getTokenAddress(networkName) {
  const cfg = getNetworkConfig(networkName);
  const address = cfg.token || loadDeployments(networkName).token;
  if (!address) {
    throw new Error(`No token deployed on ${networkName}. Run scripts/01_deploy_token.js first.`);
  }
  return address;
}

function getPoolAddress(networkName) {
  const address = loadDeployments(networkName).pool;
  if (!address) {
    throw new Error(`No pool deployed on ${networkName}. Run scripts/02_deploy_pool.js first.`);
  }
  return address;
}

module.exports = { getNetworkConfig, loadDeployments, saveDeployment, getTokenAddress, getPoolAddress };
