'use strict';

require('dotenv').config();

const { ethers } = require('hardhat');
const {
    getDefaultProvider,
    utils: { hexZeroPad },
    Contract,
} = ethers;
const { Command, Option } = require('commander');
const {
    printInfo,
    prompt,
    printWarn,
    printWalletInfo,
    wasEventEmitted,
    mainProcessor,
    validateParameters,
    getContractJSON,
    isValidTokenId,
    getGasOptions,
} = require('./utils');
const { getWallet } = require('./sign-utils');
const IInterchainTokenService = getContractJSON('IInterchainTokenService');
const { addExtendedOptions } = require('./cli-utils');
const { getSaltFromKey } = require('@axelar-network/axelar-gmp-sdk-solidity/scripts/utils');
const tokenManagerImplementations = {
    MINT_BURN: 0,
    MINT_BURN_FROM: 1,
    LOCK_UNLOCK: 2,
    LOCK_UNLOCK_FEE: 3,
};

function getDeploymentSalt(options) {
    const { rawSalt, salt } = options;

    if (rawSalt) {
        validateParameters({ isKeccak256Hash: { rawSalt } });
        return rawSalt;
    }

    validateParameters({ isString: { salt } });
    return getSaltFromKey(salt);
}

async function handleTx(tx, chain, contract, action, firstEvent, secondEvent) {
    printInfo(`${action} tx`, tx.hash);

    const receipt = await tx.wait(chain.confirmations);

    const eventEmitted =
        (firstEvent ? wasEventEmitted(receipt, contract, firstEvent) : true) ||
        (secondEvent ? wasEventEmitted(receipt, contract, secondEvent) : false);

    if (!eventEmitted) {
        printWarn('Event not emitted in receipt.');
    }
}

async function processCommand(config, chain, options) {
    const { privateKey, address, action, yes } = options;

    const contracts = chain.contracts;
    const contractName = 'InterchainTokenService';

    const interchainTokenServiceAddress = address || contracts.InterchainTokenService?.address;

    validateParameters({ isValidAddress: { interchainTokenServiceAddress } });

    const rpc = chain.rpc;
    const provider = getDefaultProvider(rpc);

    printInfo('Chain', chain.name);

    const wallet = await getWallet(privateKey, provider, options);
    const { address: walletAddress } = await printWalletInfo(wallet, options);

    printInfo('Contract name', contractName);
    printInfo('Contract address', interchainTokenServiceAddress);

    const interchainTokenService = new Contract(interchainTokenServiceAddress, IInterchainTokenService.abi, wallet);

    const gasOptions = await getGasOptions(chain, options, contractName);

    printInfo('Action', action);

    if (prompt(`Proceed with action ${action}`, yes)) {
        return;
    }

    const tokenId = options.tokenId;

    switch (action) {
        case 'contractId': {
            const contractId = await interchainTokenService.contractId();
            printInfo('InterchainTokenService contract ID', contractId);

            break;
        }

        case 'tokenManagerAddress': {
            validateParameters({ isValidTokenId: { tokenId } });

            const tokenIdBytes32 = hexZeroPad(tokenId.startsWith('0x') ? tokenId : '0x' + tokenId, 32);

            const tokenManagerAddress = await interchainTokenService.tokenManagerAddress(tokenIdBytes32);
            printInfo(`TokenManager address for tokenId: ${tokenId}`, tokenManagerAddress);

            try {
                await interchainTokenService.validTokenManagerAddress(tokenIdBytes32);
                printInfo(`TokenManager for tokenId: ${tokenId} exists at address:`, tokenManagerAddress);
            } catch (error) {
                printInfo(`TokenManager for tokenId: ${tokenId} does not yet exist.`);
            }

            break;
        }

        case 'interchainTokenAddress': {
            validateParameters({ isValidTokenId: { tokenId } });

            const tokenIdBytes32 = hexZeroPad(tokenId.startsWith('0x') ? tokenId : '0x' + tokenId, 32);

            const interchainTokenAddress = await interchainTokenService.interchainTokenAddress(tokenIdBytes32);
            printInfo(`InterchainToken address for tokenId: ${tokenId}`, interchainTokenAddress);

            break;
        }

        case 'interchainTokenId': {
            const { sender } = options;

            const deploymentSalt = getDeploymentSalt(options);

            validateParameters({ isValidAddress: { sender } });

            const interchainTokenId = await interchainTokenService.interchainTokenId(sender, deploymentSalt);
            printInfo(`InterchainTokenId for sender ${sender} and deployment salt: ${deploymentSalt}`, interchainTokenId);

            break;
        }

        case 'tokenManagerImplementation': {
            const type = options.type;

            const tokenManagerImplementation = await interchainTokenService.tokenManagerImplementation(tokenManagerImplementations[type]);
            printInfo(`${type} TokenManager implementation address`, tokenManagerImplementation);

            break;
        }

        case 'flowLimit': {
            validateParameters({ isValidTokenId: { tokenId } });

            const tokenIdBytes32 = hexZeroPad(tokenId.startsWith('0x') ? tokenId : '0x' + tokenId, 32);

            const flowLimit = await interchainTokenService.flowLimit(tokenIdBytes32);
            printInfo(`Flow limit for TokenManager with tokenId ${tokenId}`, flowLimit);

            break;
        }

        case 'flowOutAmount': {
            validateParameters({ isValidTokenId: { tokenId } });

            const tokenIdBytes32 = hexZeroPad(tokenId.startsWith('0x') ? tokenId : '0x' + tokenId, 32);

            const flowOutAmount = await interchainTokenService.flowOutAmount(tokenIdBytes32);
            printInfo(`Flow out amount for TokenManager with tokenId ${tokenId}`, flowOutAmount);

            break;
        }

        case 'flowInAmount': {
            validateParameters({ isValidTokenId: { tokenId } });

            const tokenIdBytes32 = hexZeroPad(tokenId.startsWith('0x') ? tokenId : '0x' + tokenId, 32);

            const flowInAmount = await interchainTokenService.flowInAmount(tokenIdBytes32);
            printInfo(`Flow out amount for TokenManager with tokenId ${tokenId}`, flowInAmount);

            break;
        }

        case 'deployTokenManager': {
            const { destinationChain, type, params, gasValue } = options;

            const deploymentSalt = getDeploymentSalt(options);

            validateParameters({
                isString: { destinationChain },
                isValidCalldata: { params },
                isValidNumber: { gasValue },
            });

            const tx = await interchainTokenService.deployTokenManager(
                deploymentSalt,
                destinationChain,
                tokenManagerImplementations[type],
                params,
                gasValue,
                gasOptions,
            );

            await handleTx(tx, chain, interchainTokenService, options.action, 'TokenManagerDeployed', 'TokenManagerDeploymentStarted');

            break;
        }

        case 'deployInterchainToken': {
            const { destinationChain, name, symbol, decimals, distributor, gasValue } = options;

            const deploymentSalt = getDeploymentSalt(options);

            validateParameters({
                isNonEmptyString: { name, symbol },
                isString: { destinationChain },
                isValidBytesAddress: { distributor },
                isValidNumber: { decimals, gasValue },
            });

            const tx = await interchainTokenService.deployInterchainToken(
                deploymentSalt,
                destinationChain,
                name,
                symbol,
                decimals,
                distributor,
                gasValue,
                gasOptions,
            );

            await handleTx(tx, chain, interchainTokenService, options.action, 'TokenManagerDeployed', 'InterchainTokenDeploymentStarted');

            break;
        }

        case 'contractCallValue': {
            const { sourceChain, sourceAddress, payload } = options;

            validateParameters({ isNonEmptyString: { sourceChain, sourceAddress } });

            const isTrustedAddress = await interchainTokenService.isTrustedAddress(sourceChain, sourceAddress);

            if (!isTrustedAddress) {
                throw new Error('Invalid remote service.');
            }

            validateParameters({ isValidCalldata: { payload } });

            const [tokenAddress, tokenAmount] = await interchainTokenService.contractCallValue(sourceChain, sourceAddress, payload);
            printInfo(`Amount of tokens with address ${tokenAddress} that the call is worth:`, tokenAmount);

            break;
        }

        case 'expressExecute': {
            const { commandID, sourceChain, sourceAddress, payload } = options;

            validateParameters({
                isKeccak256Hash: { commandID },
                isNonEmptyString: { sourceChain, sourceAddress },
                isValidCalldata: { payload },
            });

            const tx = await interchainTokenService.expressExecute(commandID, sourceChain, sourceAddress, payload, gasOptions);

            await handleTx(tx, chain, interchainTokenService, options.action, 'ExpressExecuted');

            break;
        }

        case 'interchainTransfer': {
            const { destinationChain, destinationAddress, amount, metadata } = options;

            validateParameters({
                isValidTokenId: { tokenId },
                isNonEmptyString: { destinationChain, destinationAddress },
                isValidNumber: { amount },
                isValidCalldata: { metadata },
            });

            const tokenIdBytes32 = hexZeroPad(tokenId.startsWith('0x') ? tokenId : '0x' + tokenId, 32);

            const tx = await interchainTokenService.interchainTransfer(
                tokenIdBytes32,
                destinationChain,
                destinationAddress,
                amount,
                metadata,
                gasOptions,
            );

            await handleTx(tx, chain, interchainTokenService, options.action, 'InterchainTransfer', 'InterchainTransferWithData');

            break;
        }

        case 'callContractWithInterchainToken': {
            const { destinationChain, destinationAddress, amount, data } = options;

            validateParameters({
                isValidTokenId: { tokenId },
                isNonEmptyString: { destinationChain, destinationAddress },
                isValidNumber: { amount },
                isValidCalldata: { data },
            });

            const tokenIdBytes32 = hexZeroPad(tokenId.startsWith('0x') ? tokenId : '0x' + tokenId, 32);

            const tx = await interchainTokenService.callContractWithInterchainToken(
                tokenIdBytes32,
                destinationChain,
                destinationAddress,
                amount,
                data,
                gasOptions,
            );

            await handleTx(tx, chain, interchainTokenService, options.action, 'InterchainTransfer', 'InterchainTransferWithData');

            break;
        }

        case 'setFlowLimits': {
            const { tokenIds, flowLimits } = options;
            const tokenIdsBytes32 = [];

            for (const tokenId of tokenIds) {
                if (!isValidTokenId(tokenId)) {
                    throw new Error(`Invalid tokenId value: ${tokenId}`);
                }

                const tokenIdBytes32 = hexZeroPad(tokenId.startsWith('0x') ? tokenId : '0x' + tokenId, 32);
                tokenIdsBytes32.push(tokenIdBytes32);
            }

            validateParameters({ isNumberArray: { flowLimits } });

            const tx = await interchainTokenService.setFlowLimits(tokenIdsBytes32, flowLimits, gasOptions);

            await handleTx(tx, chain, interchainTokenService, options.action, 'FlowLimitSet');

            break;
        }

        case 'setTrustedAddress': {
            const owner = await interchainTokenService.owner();

            if (owner.toLowerCase() !== walletAddress.toLowerCase()) {
                throw new Error(`${action} can only be performed by contract owner: ${owner}`);
            }

            const { trustedChain, trustedAddress } = options;

            validateParameters({ isNonEmptyString: { trustedChain, trustedAddress } });

            const tx = await interchainTokenService.setTrustedAddress(trustedChain, trustedAddress, gasOptions);

            await handleTx(tx, chain, interchainTokenService, options.action, 'TrustedAddressSet');

            break;
        }

        case 'removeTrustedAddress': {
            const owner = await interchainTokenService.owner();

            if (owner.toLowerCase() !== walletAddress.toLowerCase()) {
                throw new Error(`${action} can only be performed by contract owner: ${owner}`);
            }

            const trustedChain = options.trustedChain;

            validateParameters({ isNonEmptyString: { trustedChain } });

            const tx = await interchainTokenService.removeTrustedAddress(trustedChain, gasOptions);

            await handleTx(tx, chain, interchainTokenService, options.action, 'TrustedAddressRemoved');

            break;
        }

        case 'setPauseStatus': {
            const owner = await interchainTokenService.owner();

            if (owner.toLowerCase() !== walletAddress.toLowerCase()) {
                throw new Error(`${action} can only be performed by contract owner: ${owner}`);
            }

            const pauseStatus = options.pauseStatus;

            const tx = await interchainTokenService.setPauseStatus(pauseStatus, gasOptions);

            await handleTx(tx, chain, interchainTokenService, options.action, 'Paused', 'Unpaused');

            break;
        }

        case 'execute': {
            const { commandID, sourceChain, sourceAddress, payload } = options;

            validateParameters({ isKeccak256Hash: { commandID }, isNonEmptyString: { sourceChain, sourceAddress } });

            const isTrustedAddress = await interchainTokenService.isTrustedAddress(sourceChain, sourceAddress);

            if (!isTrustedAddress) {
                throw new Error('Invalid remote service.');
            }

            validateParameters({ isValidCalldata: { payload } });

            const tx = await interchainTokenService.execute(commandID, sourceChain, sourceAddress, payload, gasOptions);

            await handleTx(tx, chain, interchainTokenService, options.action);

            break;
        }

        default: {
            throw new Error(`Unknown action ${action}`);
        }
    }
}

async function main(options) {
    await mainProcessor(options, processCommand);
}

if (require.main === module) {
    const program = new Command();

    program.name('ITS').description('Script to perform ITS commands');

    addExtendedOptions(program, { address: true, salt: true });

    program.addOption(
        new Option('--action <action>', 'ITS action')
            .choices([
                'contractId',
                'tokenManagerAddress',
                'tokenAddress',
                'interchainTokenAddress',
                'interchainTokenId',
                'tokenManagerImplementation',
                'flowLimit',
                'flowOutAmount',
                'flowInAmount',
                'deployTokenManager',
                'deployInterchainToken',
                'contractCallValue',
                'expressExecute',
                'interchainTransfer',
                'callContractWithInterchainToken',
                'setFlowLimits',
                'setTrustedAddress',
                'removeTrustedAddress',
                'setPauseStatus',
                'execute',
            ])
            .makeOptionMandatory(true),
    );

    program.addOption(new Option('--commandID <commandID>', 'execute command ID'));
    program.addOption(new Option('--tokenId <tokenId>', 'ID of the token'));
    program.addOption(new Option('--sender <sender>', 'TokenManager deployer address'));
    program.addOption(
        new Option('--type <type>', 'TokenManager implementation type').choices([
            'MINT_BURN',
            'MINT_BURN_FROM',
            'LOCK_UNLOCK',
            'LOCK_UNLOCK_FEE',
        ]),
    );
    program.addOption(new Option('--destinationChain <destinationChain>', 'destination chain'));
    program.addOption(new Option('--destinationAddress <destinationAddress>', 'destination address'));
    program.addOption(new Option('--params <params>', 'params for TokenManager deployment'));
    program.addOption(new Option('--gasValue <gasValue>', 'gas value'));
    program.addOption(new Option('--name <name>', 'token name'));
    program.addOption(new Option('--symbol <symbol>', 'token symbol'));
    program.addOption(new Option('--decimals <decimals>', 'token decimals'));
    program.addOption(new Option('--distributor <distributor>', 'token distributor'));
    program.addOption(new Option('--sourceChain <sourceChain>', 'source chain'));
    program.addOption(new Option('--sourceAddress <sourceAddress>', 'source address'));
    program.addOption(new Option('--payload <payload>', 'payload'));
    program.addOption(new Option('--amount <amount>', 'token amount'));
    program.addOption(new Option('--metadata <metadata>', 'token transfer metadata'));
    program.addOption(new Option('--data <data>', 'token transfer data'));
    program.addOption(new Option('--tokenIds <tokenIds>', 'tokenId array'));
    program.addOption(new Option('--flowLimits <flowLimits>', 'flow limit array'));
    program.addOption(new Option('--trustedChain <trustedChain>', 'chain name for trusted addresses'));
    program.addOption(new Option('--trustedAddress <trustedAddress>', 'trusted address'));
    program.addOption(new Option('--pauseStatus <pauseStatus>', 'pause status').choices(['true', 'false']));
    program.addOption(new Option('--rawSalt <rawSalt>', 'raw deployment salt').env('RAW_SALT'));

    program.action((options) => {
        main(options);
    });

    program.parse();
}

module.exports = { getDeploymentSalt, handleTx };