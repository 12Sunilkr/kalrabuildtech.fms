# Test-Driven Development (TDD) & Mandatory Testing Rules

Whenever modifying, editing, or developing features/fixes in this project:

## 1. Mandatory TDD Workflow (Red-Green-Refactor)
1. **Red (Write Tests First)**:
   - Before writing or altering production code, define unit and/or integration tests covering the new behavior, edge cases, and failure modes.
   - Run the tests to confirm they fail for the expected reason.
2. **Green (Implement Minimal Code)**:
   - Write the cleanest, minimal implementation needed to make the tests pass.
   - Run the tests and ensure 100% pass rate.
3. **Refactor**:
   - Clean up code, remove duplication, and optimize while keeping all tests green.

## 2. Unit Testing Requirement
- Every new function, utility, hook, component behavior, or API route handler must have unit test coverage.
- Test isolated units with mock dependencies where appropriate.

## 3. Integration Testing Requirement
- Feature workflows, multi-step flows (e.g. auth -> timelog -> task assignment -> persistence), and API integrations must have integration tests.
- Verify end-to-end interactions with the backend, database, and system boundaries.

## 4. Verification Before Completing Any Task
- Always execute and report test runs (unit + integration) to confirm no regressions and that all new tests pass.
