build-SlacronymFunction:
	@echo "Building SlacronymFunction..."
	@mkdir -p $(ARTIFACTS_DIR)
	@cp index.mjs $(ARTIFACTS_DIR)/
	@cp acronyms.json $(ARTIFACTS_DIR)/
	@cp package.json $(ARTIFACTS_DIR)/
