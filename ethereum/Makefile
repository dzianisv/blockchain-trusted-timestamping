
.PHONY: contract
DATA_DIR := ~/.ethereum

contract: src/main.sol
	solc --gas --abi --bin $< -o src

init:
	rm -rf $(DATA_DIR)
	rm -rf ~/.ethereum
	geth --datadir $(DATA_DIR) init genesis.json
	cp "UTC--2017-05-01T18-28-17.289393363Z--86a3aa203c8364aa48a12b830d6f1ab618987e83" $(DATA_DIR)/keystore

run:
	geth --networkid 15 --datadir $(DATA_DIR) --unlock 0x86a3aa203c8364aa48a12b830d6f1ab618987e83 --password secrets.txt --rpc --mine --gasprice 1 console

prepare: init
	cd src && npm install

test:
	cd src && npm start
