### Cosmwasm deployment scripts

This folder contains deployment scripts for cosmwasm contracts needed for amplifier.

### Setup

`npm ci`


1. Compile the contracts in the amplifier [repo](https://github.com/axelarnetwork/axelar-amplifier) using the [rust optimizer](https://github.com/CosmWasm/rust-optimizer) for cosmwasm.

2. Add a `contracts` object to the `axelar` section of your config. Change any values as necessary. For chain specific contracts (`VotingVerifier`,`Gateway`,`MultisigProver`), there should be one object per chain, where the key is the chain id.
```
  "axelar": {
    "contracts": {
      "Coordinator": {
        "governanceAddress": "axelar1gtm0wr3gpkzwgpjujzlyxvgj7a5ltcku99fdcz"
      },
      "ServiceRegistry": {
        "governanceAccount": "axelar1gtm0wr3gpkzwgpjujzlyxvgj7a5ltcku99fdcz"
      },
      "Router": {
        "adminAddress": "axelar1gtm0wr3gpkzwgpjujzlyxvgj7a5ltcku99fdcz",
        "governanceAddress": "axelar10d07y265gmmuvt4z0w9aw880jnsr700j7v9daj"
      },
      "Multisig": {
        "governanceAddress": "axelar10d07y265gmmuvt4z0w9aw880jnsr700j7v9daj",
        "blockExpiry": 10
      },
      "Rewards": {
        "governanceAddress": "axelar10d07y265gmmuvt4z0w9aw880jnsr700j7v9daj",
        "rewardsDenom": "uamplifier",
        "params": {
          "epoch_duration": "10",
          "rewards_per_epoch": "100",
          "participation_threshold": [
            "9",
            "10"
          ]
        }
      },
      "NexusGateway": {
        "nexus": "axelar1gtm0wr3gpkzwgpjujzlyxvgj7a5ltcku99fdcz"
      },
      "VotingVerifier": {
        "ethereum-2": {
          "governanceAddress": "axelar10d07y265gmmuvt4z0w9aw880jnsr700j7v9daj",
          "serviceName": "validators",
          "sourceGatewayAddress": "0xe432150cce91c13a887f7D836923d5597adD8E31",
          "votingThreshold": [
            "9",
            "10"
          ],
          "blockExpiry": 10,
          "confirmationHeight": 1
        },
        "Avalanche": {
          "governanceAddress": "axelar10d07y265gmmuvt4z0w9aw880jnsr700j7v9daj",
          "serviceName": "validators",
          "sourceGatewayAddress": "0xe432150cce91c13a887f7D836923d5597adD8E31",
          "votingThreshold": [
            "9",
            "10"
          ],
          "blockExpiry": 10,
          "confirmationHeight": 1
        }
      },
      "Gateway": {
        "ethereum-2": {
        },
        "Avalanche": {
        }
      },
      "MultisigProver": {
        "ethereum-2": {
          "governanceAddress": "axelar10d07y265gmmuvt4z0w9aw880jnsr700j7v9daj",
          "adminAddress": "axelar1gtm0wr3gpkzwgpjujzlyxvgj7a5ltcku99fdcz",
          "destinationChainID": "0",
          "signingThreshold": [
            "4",
            "5"
          ],
          "serviceName": "validators",
          "workerSetDiffThreshold": 1,
          "encoder": "abi",
          "keyType": "ecdsa"
        },
        "Avalanche": {
          "adminAddress": "axelar1gtm0wr3gpkzwgpjujzlyxvgj7a5ltcku99fdcz",
          "destinationChainID": "0",
          "signingThreshold": [
            "4",
            "5"
          ],
          "serviceName": "validators",
          "workerSetDiffThreshold": 1,
          "encoder": "abi",
          "keyType": "ecdsa"
        }
      }
    },

    "rpc": [rpc],
    "tokenSymbol": "amplifier",
    "gasPrice": "0.00005uamplifier",
    "gasLimit": 5000000
  }
```

### Deploy the contracts
Deploy each contract. Chain name should match the key of an object in the `chains` section of the config. Chain name should be omitted for contracts that are not chain specific.

    `node deploy-contract.js -m [mnemonic] -a [path to contract artifacts] -c [contract name] -e [environment] -n <chain name>` 

Some of the contracts depend on each other and need to be deployed in a specific order. Note the connection router and nexus gateway each need to know the other's address, so you need to pass `--instantiate2`, and upload each contract before instatiating (by passing `-u`).
 1.  `node deploy-contract.js -m [mnemonic] -a [path to artifacts] -c "Router" --instantiate2 -e devnet -u`
 2.  `node deploy-contract.js -m [mnemonic] -a [path to artifacts] -c "NexusGateway" --instantiate2 -e devnet -u`
 3.  `node deploy-contract.js -m [mnemonic] -a [path to artifacts] -c "NexusGateway" --instantiate2 -e devnet -r`
 4.  `node deploy-contract.js -m [mnemonic] -a [path to artifacts] -c "Router" --instantiate2 -e devnet -r`
 5.  `node deploy-contract.js -m [mnemonic] -a [path to artifacts] -c "ServiceRegistry" -e devnet`
 6.  `node deploy-contract.js -m [mnemonic] -a [path to artifacts] -c "Rewards" -e devnet`
 7.  `node deploy-contract.js -m [mnemonic] -a [path to artifacts] -c "Coordinator" -e devnet`
 8.  `node deploy-contract.js -m [mnemonic] -a [path to artifacts] -c "Multisig" -e devnet`
 9.  `node deploy-contract.js -m [mnemonic] -a [path to artifacts] -c "VotingVerifier" -e devnet -n "ethereum,avalanche"`
 10.  `node deploy-contract.js -m [mnemonic] -a [path to artifacts] -c "Gateway" -e devnet -n "ethereum,avalanche"`
 11. `node deploy-contract.js -m [mnemonic] -a [path to artifacts] -c "MultisigProver" -e devnet -n "ethereum,avalanche"`


### Constant Address Deployment

To deploy with a constant address using instantiate2, pass the `--instantiate2` flag.
To upload the contract and compute the expected address without instantiating, pass `--instantiate2` and `-u`. This will write the contract address and the code id to the config file.
A salt can be passed with `-s`. If no salt is passed but a salt is needed for constant address deployment, the contract name will be used as a salt.
Pass `-r` to skip the upload step, and reuse the previous code id (specified in the config).
