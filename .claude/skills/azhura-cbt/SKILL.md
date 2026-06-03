```markdown
# azhura-cbt Development Patterns

> Auto-generated skill from repository analysis

## Overview
This skill teaches you the core development patterns and conventions used in the `azhura-cbt` TypeScript codebase. You'll learn how to structure files, write imports and exports, follow commit message conventions, and organize tests. While no specific frameworks or automated workflows are detected, this guide ensures consistency and clarity across contributions.

## Coding Conventions

### File Naming
- Use **camelCase** for all filenames.
  - Example: `userProfile.ts`, `authService.ts`

### Import Style
- Use **relative imports** for modules within the codebase.
  - Example:
    ```typescript
    import { getUser } from './userService';
    ```

### Export Style
- Use **named exports** rather than default exports.
  - Example:
    ```typescript
    // userService.ts
    export function getUser(id: string) { ... }
    export const USER_ROLE = 'admin';
    ```

### Commit Messages
- Follow the **Conventional Commits** format.
- Use the `feat` prefix for new features.
- Keep commit messages concise (average ~67 characters).
  - Example: `feat: add password reset functionality`

## Workflows

### Feature Development
**Trigger:** When adding a new feature or module  
**Command:** `/feature-development`

1. Create a new file using camelCase naming.
2. Implement the feature using TypeScript.
3. Use relative imports for any dependencies.
4. Export functions or constants using named exports.
5. Write or update corresponding test files (`*.test.*`).
6. Commit your changes using the `feat` prefix and a concise message.

### Testing
**Trigger:** When writing or running tests  
**Command:** `/run-tests`

1. Create or update test files with the `.test.` pattern (e.g., `userService.test.ts`).
2. Write tests according to the project's conventions.
3. Run your tests using the project's test runner (framework unspecified).

## Testing Patterns

- Test files follow the `*.test.*` naming convention.
  - Example: `authService.test.ts`
- The specific testing framework is not detected; check existing tests for style and structure.
- Place tests alongside or near the modules they cover.

## Commands
| Command              | Purpose                                 |
|----------------------|-----------------------------------------|
| /feature-development | Step-by-step guide for adding features  |
| /run-tests           | Instructions for writing and running tests |
```
