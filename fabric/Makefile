all: release
	release/linux-amd64/get-docker-images.sh
	cd release/samples/e2e && ./network_setup.sh up mychannel

release:
	wget https://nexus.hyperledger.org/content/repositories/snapshots/sandbox/vex-yul-hyp-jenkins-2/fabric-binaries/release.tar.gz
	tar -xf release.tar.gz

