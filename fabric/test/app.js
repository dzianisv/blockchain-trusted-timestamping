'use strict'
var log4js = require('log4js')
var logger = log4js.getLogger('fabric-test')
var crypto = require('crypto')

var config = require('./config.json')
var helper = require('./app/helper.js')
var channels = require('./app/create-channel.js')
var join = require('./app/join-channel.js')
var install = require('./app/install-chaincode.js')
var instantiate = require('./app/instantiate-chaincode.js')
var invoke = require('./app/invoke-transaction.js')
var query = require('./app/query.js')

const userName = 'user'
const orgName = 'org1'
const channelName = 'mychannel'
const peers = ['localhost:7051', 'localhost:7056']
const chaincode = config.chaincode
let start = 0

function testPutGet(count, results) {
  const documentHashes = []
  let putDelay = 0
  let getDelay = 0

  for (let i = 0; i < count; i++) {
    documentHashes.push(crypto.randomBytes(32).toString('hex'))
  }

  let start = Date.now()
  return Promise.all(documentHashes.map(h => {
    return invoke.invokeChaincode(peers, channelName, chaincode.name, chaincode.version, 'put', [h], userName, orgName, true)
  })).then((res) => {
    putDelay = Date.now() - start
    // logger.debug('Put transactions', res)
    logger.info('Put delay', putDelay)
  }).then(() => {
    start = Date.now()
    return Promise.all(documentHashes.map(h => {
      return query.queryChaincode('peer1', channelName, chaincode.name, chaincode.version, 'get', [h], userName, orgName)
    }))
  }).then(timestamps => {
    getDelay = Date.now() - start
    // logger.info('Queried data', timestamps)
    logger.info('Get delay', getDelay)
    timestamps = timestamps.map(b => {
      return (b.readUInt32BE(0) << 32) | b.readUInt32BE(4) // converty bytes array to int64
    })
    // logger.info('Timestamps', timestamps)
    return timestamps
  }).catch((err) => {
    logger.error(err)
    return err
  }).then((res) => {
    const r = { count: count, putDelay: putDelay, getDelay: getDelay, res: res }
    if (results) {
      results.push(r)
    }
    return r
  })
}

let results = []

helper.getRegisteredUsers(userName, orgName, true)
  .then((member) => {
    return channels.createChannel(channelName, '../artifacts/channel/mychannel.tx', userName, orgName)
  }).then((res) => {
    const peers = ['localhost:7051', 'localhost:7056']
    return join.joinChannel(channelName, peers, userName, orgName)
  }).then((res) => {
    return install.installChaincode(peers, chaincode.name, chaincode.path, chaincode.version, userName, orgName)
  }).then((res) => {
    return instantiate.instantiateChaincode(peers, channelName, chaincode.name, chaincode.path, chaincode.version, 'Init', [], userName, orgName)
  }).then(() => {
    let promiseChain = new Promise(resolve => resolve())
    const counts = [32, 64, 128, 256, 512, 1024]
    counts.forEach(count => {
      promiseChain = promiseChain.then(() => {
        return new Promise((resolve, reject) => {
          let t = setTimeout(() => {
            reject(new Error("GetPut test tiemout"))
          }, config.eventWaitTime)

          testPutGet(count, results).then((result) => {
            clearTimeout(t)
            resolve(result)
          })
        })
      }).catch(err => {
        logger.error(err)
      })
    })
    return promiseChain
  }).then(() => {
    logger.info(results)
    process.exit()
  })
