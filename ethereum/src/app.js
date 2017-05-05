'use strict';

const Web3 = require('web3');
const fs = require('fs');
const crypto = require('crypto');
const assert = require('assert');
const child_process = require('child_process');
const thenify = require('thenify');

const options = {};
// spawn the bootnode for peers discovery
child_process.spawn('bootnode', ['--nodekey', 'bootnode.key']);

//spawn Ethereum clients and connect to boostrap node, first client will mine blocks
const clients = [
  child_process.spawn('/usr/bin/geth', '--identity node0 --networkid 85 --verbosity 4 --datadir ~/.ethereum-test/0 --password secrets.txt --port 30303 --rpcport 8545 --unlock 0 --bootnodes enode://e1e68e4bd5505d4f2a14319b5da4d6b499de34c1e86021c14f535706202ba52fc73c61ecbadc44acfa53939de9747183fe3c5f5a80a3980e990eed22567d0e48@[::1]:30301 --rpc --mine --minerthreads 1'.split(' '), options),
  child_process.spawn('/usr/bin/geth', '--identity node1 --networkid 85 --verbosity 4 --datadir ~/.ethereum-test/1 --password secrets.txt --port 30304 --rpcport 8546 --unlock 0 --bootnodes enode://e1e68e4bd5505d4f2a14319b5da4d6b499de34c1e86021c14f535706202ba52fc73c61ecbadc44acfa53939de9747183fe3c5f5a80a3980e990eed22567d0e48@[::1]:30301 --rpc'.split(' '), options)
];

// redirect stdout and stderr to log files
let i = 0;
clients.forEach(c => {
  console.log('Starteded client', c.pid);
  const stream = fs.createWriteStream(`client${i++}.log`);
  c.stdout.pipe(stream);
  c.stderr.pipe(stream);
});

// instantiate Web3 RPC api to each Ethereum client
var api = [new Web3(), new Web3()];
api[0].setProvider(new api[0].providers.HttpProvider('http://localhost:8545'));
api[1].setProvider(new api[1].providers.HttpProvider('http://localhost:8546'));

// read contract code and ABI
var code = '0x' + fs.readFileSync('TrustedTimestamping.bin');
var abi = JSON.parse(fs.readFileSync('TrustedTimestamping.abi'));

// wait for clients startup
setTimeout(() => {
  console.log('Creating a contract');
  var putContractTime = Date.now();
  // Creating a contract
  var Contract = api[0].eth.contract(abi);
  // putting the contract to blockchain
  var trustedTimestamping = Contract.new({
    from: api[0].eth.accounts[0],
    data: code,
    gas: '4700000'
  }, function (e, contract) {

    if (e)
      console.log(e);

    if (typeof contract.address !== 'undefined') {
      // contract was registered in blockchain (transaction was added to block)
      console.log(`Contract mined in ${Date.now() - putContractTime} ms! address: ` + contract.address + ' transactionHash: ' + contract.transactionHash);
      // get instance of registered contract by contract address
      var contractInstance = Contract.at(contract.address);

      var documentHashes = [];
      for (var i = 0; i < 128; i++) {
        documentHashes.push(crypto.randomBytes(32));
      }
      // make transaction send message to contract and call function put()
      var account = api[0].eth.accounts[0];
      var start = Date.now();
      var nonce = api[0].eth.getTransactionCount(account);

      // and ask blockchain network to call put method with document hash
      return Promise.all(documentHashes.map(function (h) {
        return thenify(contractInstance.put.sendTransaction)(h, { from: account, nonce: nonce++ });
      })).then(transactions => {
        console.log(transactions);
        // transaction were created and sent to Ethereum client, calculate duration
        let duration = (Date.now() - start) / 1000;
        console.log(`Puting ${documentHashes.length} timestamps time: ${duration}`);
        console.log(`${documentHashes.length / duration} timestamps/s', Timestamp putting duration: ${duration / documentHashes.length}s`);

        // wait for next block for 17s
        setTimeout(function () {
          var count = api[0].eth.getBlockTransactionCount('pending');
          assert(count == 0);

          // check that timestamps were added to blockchain on the second Ethereum client
          console.log((new Date()).toISOString(), 'getting timestamps');
          const constractInstance1 = api[1].eth.contract(abi).at(contract.address);
          let start = Date.now();
          Promise.all(documentHashes.map((h) => {
            return thenify(constractInstance1.get.call)(h);
          })).then(addedTimestamps => {
            console.log(addedTimestamps.filter(t => t).length, 'timestamps are set');
          });

          console.log((new Date()).toISOString(), 'getting transactions inforamtion');
          // check that all transaction were added to blockchain on the second Ethreum client
          Promise.all(transactions.map(function (t) {
              thenify(api[1].eth.getTransaction)(t);
          })).then(addedTransactions => {
              console.log(addedTransactions);
              console.log(addedTransactions.filter(t => t).length, 'transactions were added to blockchain');
          });
        }, 120000);
      }).catch(error => {
        console.error(error);
      });
    }
  });
}, 10000);