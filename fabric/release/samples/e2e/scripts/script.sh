#!/bin/bash

CHANNEL_NAME="$1"
: ${CHANNEL_NAME:="mychannel"}
: ${TIMEOUT:="60"}
COUNTER=0
MAX_RETRY=5
ORDERER_CA=/opt/gopath/src/github.com/hyperledger/fabric/peer/crypto/ordererOrganizations/example.com/orderers/orderer.example.com/cacerts/example.com-cert.pem
CHAINCODE_PATH=github.com/hyperledger/fabric/examples/chaincode/go/timestamping
CHAINCODE_NAME=timestamping-chaincode

setGlobals () {

	if [ $1 -eq 0 -o $1 -eq 1 ] ; then
		CORE_PEER_LOCALMSPID="Org0MSP"
		if [ $1 -eq 0 ]; then
			CORE_PEER_ADDRESS=peer0.org1.example.com:7051
			CORE_PEER_TLS_ROOTCERT_FILE=/opt/gopath/src/github.com/hyperledger/fabric/peer/crypto/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/cacerts/org1.example.com-cert.pem
			CORE_PEER_MSPCONFIGPATH=/opt/gopath/src/github.com/hyperledger/fabric/peer/crypto/peerOrganizations/org1.example.com/peers/peer0.org1.example.com
		else
			CORE_PEER_ADDRESS=peer1.org1.example.com:7051
			CORE_PEER_TLS_ROOTCERT_FILE=/opt/gopath/src/github.com/hyperledger/fabric/peer/crypto/peerOrganizations/org1.example.com/peers/peer1.org1.example.com/cacerts/org1.example.com-cert.pem
			CORE_PEER_MSPCONFIGPATH=/opt/gopath/src/github.com/hyperledger/fabric/peer/crypto/peerOrganizations/org1.example.com/peers/peer1.org1.example.com
		fi
	else
		CORE_PEER_LOCALMSPID="Org1MSP"
		if [ $1 -eq 2 ]; then
			CORE_PEER_ADDRESS=peer0.org2.example.com:7051
			CORE_PEER_TLS_ROOTCERT_FILE=/opt/gopath/src/github.com/hyperledger/fabric/peer/crypto/peerOrganizations/org2.example.com/peers/peer0.org2.example.com/cacerts/org2.example.com-cert.pem
			CORE_PEER_MSPCONFIGPATH=/opt/gopath/src/github.com/hyperledger/fabric/peer/crypto/peerOrganizations/org2.example.com/peers/peer0.org2.example.com
		else
			CORE_PEER_ADDRESS=peer1.org2.example.com:7051
			CORE_PEER_TLS_ROOTCERT_FILE=/opt/gopath/src/github.com/hyperledger/fabric/peer/crypto/peerOrganizations/org2.example.com/peers/peer1.org2.example.com/cacerts/org2.example.com-cert.pem
			CORE_PEER_MSPCONFIGPATH=/opt/gopath/src/github.com/hyperledger/fabric/peer/crypto/peerOrganizations/org2.example.com/peers/peer1.org2.example.com
		fi

	fi
	env |grep CORE
}

createChannel() {
	CORE_PEER_MSPCONFIGPATH=/opt/gopath/src/github.com/hyperledger/fabric/peer/crypto/ordererOrganizations/example.com/orderers/orderer.example.com
	CORE_PEER_LOCALMSPID="OrdererMSP"
	peer channel create -o orderer.example.com:7050 -c $CHANNEL_NAME -f channel.tx
	return $?
}

## Sometimes Join takes time hence RETRY atleast for 5 times
joinWithRetry () {
	peer channel join -b $CHANNEL_NAME.block
	res=$?
	if [ $res -ne 0 -a $COUNTER -lt $MAX_RETRY ]; then
		COUNTER=` expr $COUNTER + 1`
		echo "PEER$1 failed to join the channel, Retry after 2 seconds"
		sleep 2
		joinWithRetry $1
	else
		COUNTER=0
	fi
    return $res
}

joinChannel () {
	for ch in 0 1 2 3; do
		setGlobals $ch
		joinWithRetry $ch || return $?
	done
}

installChaincode () {
	PEER=$1
	setGlobals $PEER
	peer chaincode install -n $CHAINCODE_NAME -v 1.0 -p $CHAINCODE_PATH
	return $?
}

instantiateChaincode () {
	PEER=$1
	setGlobals $PEER
	peer chaincode instantiate -o orderer.example.com:7050 -C $CHANNEL_NAME -c '{"Args": []}' -n $CHAINCODE_NAME -v 1.0 -P "OR ('Org0MSP.member','Org1MSP.member')"
	return $?
}

get () {
  PEER=$1
  setGlobals $PEER
  local rc=1
  local starttime=$(date +%s)

  # continue to poll
  # we either get a successful response, or reach TIMEOUT
  while test "$(($(date +%s)-starttime))" -lt "$TIMEOUT" -a $rc -ne 0
  do
     sleep 3
     echo "Attempting to Query PEER$PEER ...$(($(date +%s)-starttime)) secs"
     peer chaincode query -C $CHANNEL_NAME -n $CHAINCODE_NAME -c '{"Args":["get","a"]}' >&log.txt
     test $? -eq 0 && VALUE=$(cat log.txt | awk '/Query Result/ {print $NF}')
     test "$VALUE" = "$2" && let rc=0 || return $?
  done
}

put () {
	PEER=$1
	HASH=$2
	setGlobals $PEER
	peer chaincode invoke -o orderer.example.com:7050 -C $CHANNEL_NAME -n $CHAINCODE_NAME -c '{"Args":["put","$2"]}'
	return $?
}

# ## Create channel
createChannel || echo "Failed to create a channel $CHANNEL_NAME"

## Join all the peers to the channel
joinChannel || echo "Failed to join to channel $CHANNEL_NAME"


## Install chaincode on Peer0/Org0 and Peer2/Org1
installChaincode 0 || echo "Failed to install the chaincode on first peer"
installChaincode 1 || echo "Failed to install the chaincode on second peer"

instantiateChaincode 0 || echo "Failed to instantiate the chaincode on first peer"
sleep 30

put 0 $(date | sha256sum) || echo "Failed to put hash"
put 0 $(date | sha256sum) || echo "Failed to put hash"
put 0 $(date | sha256sum) || echo "Failed to put hash"

# # #Query on chaincode on Peer0/Org0
# get 0 100 || echo "Failed to query data from smart-contract"
