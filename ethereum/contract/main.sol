pragma solidity ^0.4.0;

contract TrustedTimestamping {

    mapping(bytes32 => uint) public timestamps;

    function put(bytes32 dataHash) {
        if (timestamps[dataHash] == 0) {
            timestamps[dataHash] = now /* current block timestamp */;
        } else {
            throw; /* timestamp for this hash is already set */
        }
    }

    function get(bytes32 dataHash) constant returns (uint) {
        return timestamps[dataHash];
    }

    function check(bytes32 dataHash, uint timestamp) constant returns (bool) {
        return timestamps[dataHash] == timestamp;
    }
}