import express from 'express';
import { ethers } from 'ethers';
import path from 'path';
import cors from 'cors';

const MOXIE_CONTRACT_ADDRESS = '0x7448c7456a97769F6cD04F1E83A4a23cCdC46aBD'; 
const DEGEN_CONTRACT_ADDRESS = '0x4ed4E862860beD51a9570b96d89aF5E1B0Efefed'; 
const TOKEN_ABI = ['function balanceOf(address) view returns (uint256)']; 

// Base's RPC URL
const provider = new ethers.JsonRpcProvider('https://mainnet.base.org');

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
      return res.status(400).json({ error: `Invalid ${token === 'moxie' ? "moxie" : "degen"} address` });
    }

    const contractAddress = token.toLowerCase() === 'moxie' ? MOXIE_CONTRACT_ADDRESS : DEGEN_CONTRACT_ADDRESS;
    const contract = new ethers.Contract(contractAddress, TOKEN_ABI, provider);
    
    let balance;
    try {
      balance = await contract.balanceOf(address);
    } catch (error) {
      console.error('Error fetching balance:', error);
      if (error.code === 'CALL_EXCEPTION') {
        return res.status(500).json({ error: 'Error calling contract. Possible rate limiting.' });
      }
      throw error;
    }

    if (balance === '0x') {
      return res.status(404).json({ error: 'No balance found or unable to decode balance' });
    }

    res.json({ address, balance: ethers.formatUnits(balance, 18) });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error fetching balance: ' + error.message });
  }
});

app.get('/historical-balance/:token/:address', async (req, res) => {
  try {
    const { token, address } = req.params;
    if (!ethers.isAddress(address)) {
      return res.status(400).json({ error: 'Invalid address' });
    }

    const contractAddress = token.toLowerCase() === 'moxie' ? MOXIE_CONTRACT_ADDRESS : DEGEN_CONTRACT_ADDRESS;
    const contract = new ethers.Contract(contractAddress, TOKEN_ABI, provider);

    const currentBlock = await provider.getBlockNumber();
    const oneDayAgoBlock = currentBlock - 6500; // Approx. 1 day of blocks
    const oneWeekAgoBlock = currentBlock - 45500; // Approx. 1 week of blocks

    const [currentBalance, oneDayAgoBalance, oneWeekAgoBalance] = await Promise.all([
      contract.balanceOf(address, { blockTag: currentBlock }),
      contract.balanceOf(address, { blockTag: oneDayAgoBlock }),
      contract.balanceOf(address, { blockTag: oneWeekAgoBlock })
    ]);

    res.json({
      address,
      currentBalance: ethers.formatUnits(currentBalance, 18),
      oneDayAgoBalance: ethers.formatUnits(oneDayAgoBalance, 18),
      oneWeekAgoBalance: ethers.formatUnits(oneWeekAgoBalance, 18)
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error fetching historical balance: ' + error.message });
  }
});

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK' });
});
