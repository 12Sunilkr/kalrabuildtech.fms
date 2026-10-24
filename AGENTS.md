# Development Guidelines & Rules

## Mandatory Test-Driven Development (TDD) & Testing Protocol

When editing, modifying, or developing any code in this repository:

1. **Follow TDD (Test-Driven Development)**:
   - **Step 1 (Red)**: Write unit and integration test specifications *before* writing or modifying production code.
   - **Step 2 (Green)**: Implement the solution until tests pass.
   - **Step 3 (Refactor)**: Refactor and optimize while keeping all tests passing.

2. **Unit Testing (Mandatory)**:
   - All components, utilities, state handlers, services, and backend endpoints must have corresponding unit tests.
   - Test both success and edge/error paths.

3. **Integration Testing (Mandatory)**:
   - All end-to-end user workflows, API integration routes, and cross-module interactions must have integration tests.
   - Ensure data integrity, API responses, and database persistence are verified.

4. **Execution & Verification**:
   - Always run the relevant unit and integration test suites before marking tasks as complete, and report test outputs.
