'use strict';

var Web3 = require('web3');
var web3 = new Web3();
var fs = require('fs');
var crypto = require('crypto');
var assert = require('assert');

web3.setProvider(new web3.providers.HttpProvider('http://localhost:8545'));

var code = '0x' + fs.readFileSync('TrustedTimestamping.bin');
var abi = JSON.parse(fs.readFileSync('TrustedTimestamping.abi'));


var putContractTime = Date.now();
var Contract = web3.eth.contract(abi);
var trustedTimestamping = Contract.new({
  from: web3.eth.accounts[0],
  data: code,
  gas: '4700000'
}, function (e, contract) {

  if (e)
    console.log(e);

  if (typeof contract.address !== 'undefined') {
    // contract was registered on blockchain
    console.log(`Contract mined in ${Date.now() - putContractTime} ms! address: ` + contract.address + ' transactionHash: ' + contract.transactionHash);
    // get instance of registered contract by contract address
    var contractInstance = Contract.at(contract.address);
    // and ask blockchain network to call put method with document hash
    var documentHashes = [];
    for (var i = 0; i < 256; i++) {
      documentHashes.push(crypto.randomBytes(32));
    }

    var account = web3.eth.accounts[0];
    var start = Date.now();
    var recipients = documentHashes.map(function(h) {
      return contractInstance.put.sendTransaction(h, { from: account });
    });

    var duration = (Date.now() - start) / 1000;
    console.log(`Puting ${documentHashes.length} timestamps time: ${duration}`);
    console.log(`${documentHashes.length / duration} timestamps/s', Timestamp putting duration: ${duration / documentHashes.length}s`);


    start = Date.now();
    documentHashes.map(function(h) {
      var ts = contractInstance.get.call(h);
      assert(ts !== 0);
      return ts;
    });

    duration = (Date.now() - start) / 1000;
    console.log(`Getting ${documentHashes.length} timestamps time: ${duration}`);
    console.log(`${documentHashes.length / duration} timestamps/s', Timestamp getting duration: ${duration / documentHashes.length}s`);
  }
})