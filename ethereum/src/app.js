'use strict';

const Web3 = require('web3');
const fs = require('fs');
const crypto = require('crypto');
const child_process = require('child_process');

const thenify = function (f) {
  return function (...args) {
    return new Promise((resolve, reject) => {
      f(...args, function (err, result) {
        return err ? reject(err) : resolve(result);
      })
    });
  };
}

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function startNodes() {
  const options = {};
  // spawn the bootnode for peers discovery
  child_process.spawn('bootnode', ['--nodekey', 'bootnode.key']);

  //spawn Ethereum clients and connect to boostrap node, first client will mine blocks
  const clients = [
    child_process.spawn('geth', '--identity node0 --networkid 85 --verbosity 3 --datadir ~/.ethereum-test/0 --password secrets.txt --port 30303 --rpcport 8545 --unlock 0 --bootnodes enode://e1e68e4bd5505d4f2a14319b5da4d6b499de34c1e86021c14f535706202ba52fc73c61ecbadc44acfa53939de9747183fe3c5f5a80a3980e990eed22567d0e48@[::1]:30301 --rpc --maxpeers 1 --mine --minerthreads 1'.split(' '), options),
    child_process.spawn('geth', '--identity node1 --networkid 85 --verbosity 3 --datadir ~/.ethereum-test/1 --password secrets.txt --port 30304 --rpcport 8546 --unlock 0 --bootnodes enode://e1e68e4bd5505d4f2a14319b5da4d6b499de34c1e86021c14f535706202ba52fc73c61ecbadc44acfa53939de9747183fe3c5f5a80a3980e990eed22567d0e48@[::1]:30301 --rpc'.split(' '), options)
  ];


  // redirect stdout and stderr to log files
  let i = 0;
  clients.forEach(c => {
    console.log('Starteded client', c.pid);
    const stream = fs.createWriteStream(`client${i++}.log`);
    c.stdout.pipe(stream);
    c.stderr.pipe(stream);
  });

  return wait(10000).then(() => {
    console.log('clients started');
  });
}

function test() {
  // instantiate Web3 RPC api to each Ethereum client
  var api = [new Web3(), new Web3()];
  api[0].setProvider(new api[0].providers.HttpProvider('http://localhost:8545'));
  api[1].setProvider(new api[1].providers.HttpProvider('http://localhost:8546'));
  const testCases = [8, 16, 32, 64];
  const testCaseRounds = 64;

  // read contract code and ABI
  var code = '0x' + fs.readFileSync('TrustedTimestamping.bin');
  var abi = JSON.parse(fs.readFileSync('TrustedTimestamping.abi'));

  function waitForTransactionCommitment(a, txs, timeout) {
    const txsStatuses = {};

    txs.forEach(tx => {
      txsStatuses[tx] = false;
    });

    return new Promise((resolve) => {
      let iHandle = null;
      let tHandle = null;

      function stopWaiting() {
        if (iHandle) clearInterval(iHandle);
        if (tHandle) clearTimeout(tHandle);

        let commitedTxs = [];

        for (let tx in txsStatuses) {
          if (txsStatuses[tx]) {
            commitedTxs.push(tx);
          }
        }

        return resolve(commitedTxs);
      }

      tHandle = setTimeout(() => {
        console.error(Object.values(txsStatuses).filter(s => s).length, 'transactions were commited to blockchain');
        stopWaiting();
      }, timeout);

      iHandle = setInterval(() => {
        a.eth.getBlock('latest', (err, block) => {
          if (!err) {
            block.transactions.forEach(tx => {
              if (txsStatuses[tx] === false)
                txsStatuses[tx] = true;
            });

            if (Object.values(txsStatuses).filter(s => s).length >= txs.length) {
              stopWaiting();
            }
          }
        });
      }, 500);
    });
  }

  function getContract(a, address) {
    return a.eth.contract(abi).at(address);
  }

  function testPutGet(count, contract, results) {
    var documentHashes = [];
    for (var i = 0; i < count; i++) {
      documentHashes.push(crypto.randomBytes(32));
    }
    // make transaction send message to contract and call function put()
    var account = api[0].eth.accounts[0];
    var start = 0;
    var nonce = api[0].eth.getTransactionCount(account);

    var contractInstance = getContract(api[0], contract.address);
    let transactions;

    let putDuration = 0;
    let getDuration = 0;
    let commitedTx = 0;
    let commitedTs = 0;

    // and ask blockchain network to call put method with document hash
    return Promise.all(documentHashes.map(function (h) {
      start = Date.now();
      return thenify(contractInstance.put.sendTransaction)(h, { from: account, nonce: nonce++ });
    })).then(txs => {
      transactions = txs;
      return transactions;
    }).then((txs) => {
      return waitForTransactionCommitment(api[1], txs, 120000); //wait for next block
    }).then((commitedTxs) => {
      // transaction were created and sent to Ethereum client, calculate duration
      putDuration = Date.now() - start;
      commitedTx = commitedTxs.length;
    }).then(() => {
      // check that timestamps were added to blockchain on the second Ethereum client
      const constractInstance1 = getContract(api[1], contract.address);
      start = Date.now();
      return Promise.all(documentHashes.map((h) => {
        return thenify(constractInstance1.get.call)(h);
      }))
    }).then(addedTimestamps => {
      getDuration = Date.now() - start;
      commitedTs = addedTimestamps.filter(t => parseInt(t)).length;
    }).catch(error => {
      console.error(error);
    }).then(() => {
      const r = { putDuration: putDuration, getDuration: getDuration, commitedTx: commitedTx, commitedTs: commitedTs, count: count };
      results.push(r);
      return r;
    });
  }

  const results = [];
  let start = Date.now();

  console.log('Creating a contract');

  (new Promise((resolve, reject) => {
    const options = {
      from: api[0].eth.accounts[0],
      data: code,
      gas: '4700000'
    };

    // instantiate a contract on the first geth node
    api[0].eth.contract(abi).new(options, function (e, contract) {
      if (e)
        return reject(e);

      if (typeof contract.address !== 'undefined') {
        // contract was registered in blockchain (transaction was added to block)
        console.log(`Contract mined in ${Date.now() - start} ms! address: ` + contract.address + ' transactionHash: ' + contract.transactionHash);
        resolve(contract);
      }
    });
  })).then((contract) => {
    let counts = [];
    for (let i = 0; i < testCaseRounds; i++) {
      counts = counts.concat(testCases);
    }

    // get instance of registered contract by contract address
    let promisesChain = new Promise(resolve => resolve());
    counts.forEach(count => {
      promisesChain = promisesChain.then(() => testPutGet(count, contract, results));
    });
    return promisesChain;
  }).then(() => {
    testCases.forEach(c => {
      let averagePutDuration = 0;
      let averageGetDuration = 0;

      results.forEach(r => {
        if (r.count === c) {
          averagePutDuration += r.putDuration;
          averageGetDuration += r.getDuration;
        }
      });

      console.log('Average put', averagePutDuration / testCaseRounds, 'and get', averageGetDuration / testCaseRounds, 'durations for', c);
    });
    console.log(JSON.stringify(results));
  }).catch(err => {
    console.error(err);
  }).then(() => {
    process.exit();
  });
}

switch (process.argv[2]) {
  case 'start-nodes':
    startNodes();
    break;
  case 'test':
    test();
    break;
  default:
    startNodes().then(() => {
      return test();
    });
}