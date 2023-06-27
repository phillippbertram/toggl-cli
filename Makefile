BINARY_NAME := tgl
BUILD_DIR := ./dist
INSTALL_PATH := $(GOPATH)/bin/$(BINARY_NAME)


default: build

build:
	@echo "Building $(BINARY_NAME)..."
	@goreleaser build --snapshot --clean --single-target
	@echo "$(BINARY_NAME) build complete."

.PHONY: install
install: build
	@echo "Installing $(BINARY_NAME)..."
	@binary_path=$$(find $(BUILD_DIR) -name "$(BINARY_NAME)*" -type f -print -quit) && \
	mv "$$binary_path" $(INSTALL_PATH)
	@echo "$(BINARY_NAME) installed globally."

.PHONY: uninstall
uninstall:
	@echo "Uninstalling $(BINARY_NAME)..."
	@if [ -n "$$(which $(BINARY_NAME))" ]; then \
		rm -f "$$(which $(BINARY_NAME))"; \
		echo "$(BINARY_NAME) uninstalled."; \
	else \
		echo "$(BINARY_NAME) is not installed."; \
	fi

.PHONY: clean
deps:
	go install github.com/goreleaser/goreleaser@v1.18.2

.PHONY: clean
clean:
	@echo "Cleaning up..."
	@rm -rf $(BUILD_DIR)
	@echo "Cleanup complete."