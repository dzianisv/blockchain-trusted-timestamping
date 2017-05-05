
.PHONY: contract init

contract: src/main.sol
	solc --gas --abi --bin $< -o src

init:
	for i in 0 1; do \
		export DATA_DIR=$(HOME)/.ethereum-test/$$i; \
		rm -rf $$DATA_DIR && \
		geth --datadir $$DATA_DIR init genesis.json; \
		cp "UTC--2017-05-01T18-28-17.289393363Z--86a3aa203c8364aa48a12b830d6f1ab618987e83" $$DATA_DIR/keystore/; \
	done

prepare: init
	cd src && npm install
analyze:
	echo $$(grep "Removed cap-exceeding queued transaction" src/*.log | wc -l) transaction were discarded
test:
	cd src && npm start
