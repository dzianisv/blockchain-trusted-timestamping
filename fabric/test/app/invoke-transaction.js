/**
 * Copyright 2017 IBM All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */
'use strict'
var path = require('path')
var fs = require('fs')
var util = require('util')
var hfc = require('fabric-client')
var Peer = require('fabric-client/lib/Peer.js')
var config = require('../config.json')
var helper = require('./helper.js')
var EventHub = require('fabric-client/lib/EventHub.js')
hfc.addConfigFile(path.join(__dirname, 'network-config.json'))
var ORGS = hfc.getConfigSetting('network-config')
var tx_id = null
var nonce = null
var member = null
var eventhubs = {}
var invoked = 0

function getHostnameByPeerAddress (org, peers) {
  var orgDetails = ORGS[org]
  var result = []
  for (let index in peers) {
    for (let key in orgDetails) {
      if (orgDetails.hasOwnProperty(key) && key.indexOf('peer') == 0 && orgDetails[
        key].requests.indexOf(peers[index]) >= 0) {
        result.push(key)
      }
    }
  }
  return result
};

function waitForTransactions(transactions, peers, org) {
  const eventPromises = []
  const logger = helper.getLogger('invoke-chaincode')

  registerEventHub(org, peers)

  transactions.forEach(transactionID => {
    for (let key in eventhubs) {
      let eh = eventhubs[key]

      let txPromise = new Promise((resolve, reject) => {
        let handle = setTimeout(() => {
          reject(new Error('The transaction ' + transactionID + ' commit timed out on ' + key))
        }, config.eventWaitTime)

        eh.registerTxEvent(transactionID, (tx, code) => {
          clearTimeout(handle)
          eh.unregisterTxEvent(transactionID)
          if (code !== 'VALID') {
            reject(new Error('The transaction was invalid, code = ' + code))
          } else {
            logger.info('The transaction', transactionID, 'has been committed on peer ' + key)
            resolve(transactionID)
          }
        })
      })
      eventPromises.push(txPromise)
    }
  })

  return Promise.all(eventPromises)
}

function registerEventHub (org, peers) {
  var peerHosts = getHostnameByPeerAddress(org, peers)

  for (var index in peerHosts) {
    const key = peerHosts[index] + '.' + org
    if (eventhubs[key]) {
      continue
    }

    let eh = new EventHub()
    let data = fs.readFileSync(path.join(__dirname, ORGS[org][peerHosts[index]][
      'tls_cacerts'
    ]))
    eh.setPeerAddr(ORGS[org][peerHosts[index]]['events'], {
      pem: Buffer.from(data).toString(),
      'ssl-target-name-override': ORGS[org][peerHosts[index]]['server-hostname']
    })
    eh.connect()
    eventhubs[key] = eh
  }
}

var invokeChaincode = function (peers, channelName, chaincodeName, chaincodeVersion, fn, args, username, org, wait) {
  wait = typeof wait === 'undefined' ? true : wait
  var chain = helper.getChainForOrg(org)
  helper.setupOrderer()

  var targets = helper.getTargets(peers, org)
  helper.setupPeers(chain, peers, targets)

  var peerHosts = getHostnameByPeerAddress(org, peers)
  let logger = helper.getLogger('invoke-chaincode')

  let tx_id

  return helper.getRegisteredUsers(username, org).then((user) => {
    let nonce = helper.getNonce()
    tx_id = chain.buildTransactionID(nonce, user)
    logger = helper.getLogger('invoke-chaincode[' + tx_id + ']')
    // send proposal to endorser
    var request = {
      targets: targets,
      chaincodeId: chaincodeName,
      chaincodeVersion: chaincodeVersion,
      fcn: fn,
      args: helper.getArgs(args),
      chainId: channelName,
      txId: tx_id,
      nonce: nonce
    }
    return chain.sendTransactionProposal(request)
  }, err => {
    throw err
  }).then((results) => {
    var proposalResponses = results[0]
    var proposal = results[1]
    var header = results[2]
    var all_good = true
    for (var i in proposalResponses) {
      let one_good = false
      if (proposalResponses && proposalResponses[0].response && proposalResponses[0].response.status === 200) {
        one_good = true
      } else {
        logger.error('transaction proposal was bad')
      }
      all_good = all_good & one_good
    }
    if (all_good) {
      // logger.debug('Successfully sent Proposal and received ProposalResponse: Status - %s, message - "%s", metadata - "%s", endorsement signature: %s',
      //   proposalResponses[0].response.status, proposalResponses[0].response.message,
      //   proposalResponses[0].response.payload, proposalResponses[0].endorsement.signature.toString('hex'))
      var request = {
        proposalResponses: proposalResponses,
        proposal: proposal,
        header: header
      }

      return Promise.all([chain.sendTransaction(request), waitForTransactions([tx_id], peers, org)]).then((results) => {
        return results[0] // the first returned value is from the 'sendPromise' which is from the 'sendTransaction()' call
      })
    } else {
      logger.error('Failed to send Proposal or receive valid response. Response null or status is not 200. exiting...')
      throw new Error('Failed to send Proposal for' + tx_id + ' or receive valid response. Response null or status is not 200. exiting...')
    }
  }, (err) => {
    throw err
  }).then((response) => {
    if (response.status === 'SUCCESS') {
      logger.debug('Successfully sent transaction to the orderer - invoked:', ++invoked)
      return tx_id
    } else {
      logger.error('Failed to order the transaction. Error code: ' + response.status)
      throw Error('Failed to order the transaction.' + tx_id + 'Error code: ' + response)
    }
  })
}
exports.invokeChaincode = invokeChaincode
