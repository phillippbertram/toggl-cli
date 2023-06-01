
default: build

build:
	goreleaser build --snapshot --clean --single-target

install:
	go install .

deps:
	go install github.com/goreleaser/goreleaser@v1.18.2