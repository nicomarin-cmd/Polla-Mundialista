import { ethers } from 'hardhat'

async function main() {
  const [deployer] = await ethers.getSigners()
  const network = await ethers.provider.getNetwork()
  console.log(`Network:  ${network.name} (chainId ${network.chainId})`)
  console.log(`Deployer: ${deployer.address}`)

  const OPERATOR     = deployer.address
  const FEE_TREASURY = process.env.FEE_TREASURY ?? deployer.address

  console.log(`Operator:    ${OPERATOR}`)
  console.log(`feeTreasury: ${FEE_TREASURY}`)

  const Factory = await ethers.getContractFactory('PollaEscrow')
  const escrow  = await Factory.deploy(OPERATOR, FEE_TREASURY)
  await escrow.waitForDeployment()

  const addr = await escrow.getAddress()
  console.log(`\nPollaEscrow deployed: ${addr}`)
  console.log(`\nNext steps:`)
  console.log(`  1. Añadir en .env.local:       VITE_ESCROW_CONTRACT=${addr}`)
  console.log(`  2. Supabase secret:             npx supabase secrets set ESCROW_CONTRACT_ADDRESS=${addr}`)
  console.log(`  3. Re-deploy Edge Functions:    npx supabase functions deploy cerrar-polla cancelar-polla auto-cerrar-pollas`)
}

main().catch((e) => { console.error(e); process.exit(1) })
