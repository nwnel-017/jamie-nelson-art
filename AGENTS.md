<!-- BEGIN -->

## Project Overview

- This app is an artwork portfolio, designed to display and sell artworks online.
- Main features:
    - public facing gallery for users to view artworks and art details
    - a stripe payout for purchasing artworks (currently disabled)
    - an internal admin dashboard for adding and editing content
- This app is built with Vue and Nuxt JS, with Nitro JS for the backend, and supabase for the database and file storage

## IMPORTANT

- Consult official documentation when implementing unfamiliar APIs, version-sensitive functionality, or behavior where framework details are uncertain. Prefer documentation matching the project's installed versions.- DO NOT make any changes that are not specifically asked for
- I like simple systems, and software that feels obvious. Do not preserve complexity just because it already exists. Do not introduce machinery because it looks architecturally impressive. Understand the real constraint, then fight for the smallest model that makes the correct behavior unsurprising
- When making a plan or explaining existing functionality - do NOT use long explanations. Write simple bullet points instead of long sentences and paragraphs to explain a part of the system or list your plan steps.
- When choosing naming conventions for code (variables, functions, components, etc.), use simple names that make sense to a reader at a quick glance. 
Do not use naming conventions that need a deep understanding of the app to understand.
- If a comment is neccessary to explain implementation - use short comments (preferrably 1 line only). DO NOT bloat code with long and confusing comments.
- If you are asked to create a new worktree, create a worktree in ../agent/feature-name in a new branch feature/feature-name. DO NOT created nested worktrees

## Coding Style

- It is important to avoid scope creep. Only focus on the specific instruction you are given. Do not fix unrelated bugs, refactor unrelated code, or introduce functionality outside the task's requirements. If you do notice important bugs or other findings, you can make note of it.
- Do not make a change unless you are specifically asked to.
- When writing database migrations - write a short comment at the top, explaining its purpose in simple, high level terms
- When modifying a migration created during the current session, edit the existing migration rather than creating a new one, provided it has not been applied to a shared or production database. If the migration has already been applied to a shared or production database, create a new migration instead.

## Testing

- Keep test suites focused and concise. Prioritize critical behavior, meaningful edge cases, failure paths, and regression coverage.
- Avoid redundant tests, trivial assertions, and tests that verify implementation details rather than observable behavior.

## Verification

- Before committing code changes, run relevant tests and static checks, including lint and typecheck where applicable.
- Before opening a pull request, run the full lint, typecheck, test, and production build checks.
- If a verification command fails, determine whether the failure was introduced by the current changes. Fix failures caused by the current task before proceeding.
- Do not modify unrelated code solely to resolve pre-existing verification failures. Report those failures instead.
- Never claim a check passed unless it was actually executed successfully.
- If verification cannot be completed, clearly report which checks were not run and why.

## Scripts You Can Run Without Permission

- Agents may run local inspection, development, lint, typecheck, test, and build commands without additional permission. Request approval before executing scripts that modify production or shared data, deploy resources, or perform destructive operations.

## Architecture

- Before adding files or directories, please look at the project structure and match the same structure

 <!-- END -->
