# Evaluation Framework Changelog

## v1.1.0 - Multi-Step and Conversation Mode Support

### Added
- **Multi-Step Evaluation Mode**: Added support for executing a predefined sequence of tool calls and evaluating the combined results
- **Conversation Mode**: Added support for LLM-driven multi-step evaluations where the model determines which tools to call
- **Enhanced Metrics**: Track tool call counts, step counts, and other execution metrics
- **Improved Reporting**: Updated HTML reports to display detailed information about tool calls in multi-step scenarios
- **Sample Tests**: Added example multi-step and conversation mode test definitions

### Changed
- **Schema Updates**: Extended the prompt schema to support both single and multi-step executions
- **Documentation**: Updated README with comprehensive documentation for the new capabilities
- **Report Layout**: Redesigned the HTML report to better display multi-step test results

### Technical Changes
- Extended `EvalPromptSchema` to support step definitions and conversation mode
- Added new `ToolCallRecord` schema to track individual tool calls
- Implemented `runMultiStepMode` and `runConversationMode` methods
- Updated validation prompt generation to include all tool calls
- Added tool call metrics to summary statistics