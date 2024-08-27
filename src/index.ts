import path from 'path';
import { retry } from 'ts-retry-promise';
import { ethers } from 'ethers';
import express from 'express';
import cors from 'cors';

// Base network addresses
const MOXIE_CONTRACT_ADDRESS = '0x7448c7456a97769F6cD04F1E83A4a23cCdC46aBD';
const DEGEN_CONTRACT_ADDRESS = '0x4ed4E862860beD51a9570b96d89aF5E1B0Efefed';

// Base network public RPC URL
//instead of using a global provider, i am using a provider for each request to prevent over rate limit
const createProvider = () => {
  return new ethers.JsonRpcProvider('https://mainnet.base.org');
};

const MOXIE_ABI = [
  'function balanceOf(address account) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)'
];

const DEGEN_ABI = [
  'function balanceOf(address account) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)'
];

const getBalance = async (contract, address, blockTag = 'latest') => {
  return retry(async () => {
    console.log(`Attempting to get balance for ${address} at block ${blockTag}`);
    console.log(`Contract address: ${contract.target}`); // Use contract.target instead of contract.address
    try {
      const balance = await contract.balanceOf(address, { blockTag });
      console.log(`Raw balance result: ${balance}`);
      return ethers.formatUnits(balance, await contract.decimals());
    } catch (error) {
      console.error(`Error fetching balance: ${error.message}`);
      throw error;
    }
  }, { retries: 3, delay: 1000 });
};

const app = express();
const port = 3000;

app.use(express.json());
app.use(cors());

app.use(express.static(path.join(__dirname, '../public')));

app.get('/', (req, res) => {
  res.send('Token Balance Checker');
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});

app.get('/balance/:token/:address', async (req, res) => {
  try {
    const { token, address } = req.params;
    if (!ethers.isAddress(address)) {
      return res.status(400).json({ error: 'Invalid address' });
    }

    let contractAddress, contractABI;
    if (token.toLowerCase() === 'moxie') {
      contractAddress = MOXIE_CONTRACT_ADDRESS;
      contractABI = MOXIE_ABI;
    } else {
      contractAddress = DEGEN_CONTRACT_ADDRESS;
      contractABI = DEGEN_ABI;
    }

    console.log(`Using contract address: ${contractAddress}`);
    const provider = createProvider();
    const contract = new ethers.Contract(contractAddress, contractABI, provider);

    try {
      const balance = await getBalance(contract, address);
      res.json({ address, balance });
    } catch (error) {
      console.error(`Error fetching ${token} balance:`, error);
      res.status(500).json({ error: `Error fetching ${token} balance: ${error.message}` });
    }
  } catch (error) {
    console.error('Error in /balance route:', error);
    res.status(500).json({ error: 'Error in balance route: ' + error.message });
  }
});

app.get('/historical-balance/:token/:address', async (req, res) => {
  try {
    const { token, address } = req.params;
    if (!ethers.isAddress(address)) {
      return res.status(400).json({ error: 'Invalid address' });
    }
    let contractAddress, contractABI;
    if (token.toLowerCase() === 'moxie') {
      contractAddress = MOXIE_CONTRACT_ADDRESS;
      contractABI = MOXIE_ABI;
    } else {
      contractAddress = DEGEN_CONTRACT_ADDRESS;
      contractABI = DEGEN_ABI;
    }
    const provider = createProvider();
    console.log(`Using contract address: ${contractAddress}`);
    const contract = new ethers.Contract(contractAddress, contractABI , provider);

    const currentBlock = await provider.getBlockNumber();
    console.log(`Current block number: ${currentBlock}`);
    const oneDayAgoBlock = currentBlock - 43200; // Approx. 1 day of blocks on Base (2s block time)
    const oneWeekAgoBlock = currentBlock - 302400; // Approx. 1 week of blocks on Base

    const [currentBalance, oneDayAgoBalance, oneWeekAgoBalance] = await Promise.all([
      getBalance(contract, address, currentBlock.toString()),
      getBalance(contract, address, oneDayAgoBlock.toString()),
      getBalance(contract, address, oneWeekAgoBlock.toString())
    ]);

    res.json({
      address,
      currentBalance,
      oneDayAgoBalance,
      oneWeekAgoBalance
    });
  } catch (error) {
    console.error('Error in /historical-balance route:', error);
    res.status(500).json({ error: 'Error fetching historical balance: ' + error.message });
  }
});

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK' });
});