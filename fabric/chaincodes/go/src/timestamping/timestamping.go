/*
Copyright IBM Corp. 2016 All Rights Reserved.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

		 http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

package main

import (
	"encoding/binary"
	"fmt"

	"github.com/hyperledger/fabric/core/chaincode/shim"
	pb "github.com/hyperledger/fabric/protos/peer"
)

// Invoke operations
// put - requires two arguments, a key and value
// get - requires one argument, a key, and returns a value

type SimpleChaincode struct {
}

// Init is a no-op
func (t *SimpleChaincode) Init(stub shim.ChaincodeStubInterface) pb.Response {
	return shim.Success(nil)
}

// Invoke has two functions
// put - takes two arguments, a key and value, and stores them in the state
func (t *SimpleChaincode) Invoke(stub shim.ChaincodeStubInterface) pb.Response {
	function, args := stub.GetFunctionAndParameters()
	fmt.Println("invoking function", function, args)
	switch function {
	case "put":
		if len(args) < 1 {
			return shim.Error("put operation must include one arguments")
		}

		key := args[0]
		value := make([]byte, 8)
		// ts, txErr := stub.GetTxTimestamp() //in fabric 1.0.0-alpha this function always returns nil, nill
		var ts int64 = 1494321113

		// if txErr != nil || ts == nil {
		// 	return shim.Error(fmt.Sprintf("put operation failed. Error getting tx timestamp: %s", txErr))
		// }
		binary.BigEndian.PutUint64(value, uint64(ts))

		if err := stub.PutState(key, value); err != nil {
			fmt.Printf("Error putting state %s", err)
			return shim.Error(fmt.Sprintf("put operation failed. Error updating state: %s", err))
		}
		return shim.Success(value)
	case "get":
		if len(args) < 1 {
			return shim.Error("get operation must include one argument, a key")
		}
		key := args[0]
		value, err := stub.GetState(key)
		if err != nil {
			return shim.Error(fmt.Sprintf("get operation failed. Error accessing state: %s", err))
		} else {
			fmt.Println("response length:", len(value))
		}

		return shim.Success(value)
	default:
		return shim.Success([]byte("Unsupported operation"))
	}
}

func main() {
	err := shim.Start(new(SimpleChaincode))
	if err != nil {
		fmt.Printf("Error starting chaincode: %s", err)
	}
}
