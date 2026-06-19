import { HardhatUserConfig } from 'hardhat/config'
import '@nomicfoundation/hardhat-toolbox'
import * as dotenv from 'dotenv'

dotenv.config()

const OPERATOR_KEY = process.env.OPERATOR_PRIVATE_KEY ?? ''

const config: HardhatUserConfig = {
  solidity: {
    version: '0.8.20',
    settings: { optimizer: { enabled: true, runs: 200 } },
  },
  paths: { sources: './src' },
  networks: {
    celo: {
      url: 'https://forno.celo.org',
      chainId: 42220,
      accounts: OPERATOR_KEY ? [OPERATOR_KEY] : [],
    },
    'celo-sepolia': {
      url: 'https://forno.celo-sepolia.celo-testnet.org',
      chainId: 11142220,
      accounts: OPERATOR_KEY ? [OPERATOR_KEY] : [],
    },
  },
}

export default config
