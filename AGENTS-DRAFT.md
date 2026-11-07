<!-- BEGIN -->

## Project Overview

- This app is an artwork portfolio, designed to display and sell artworks online.
- Main features:
    - public facing gallery for users to view artworks and art details
    - a stripe payout for purchasing artworks (currently disabled)
    - an internal admin dashboard for adding and editing content
- This app is built with Vue and Nuxt JS, with Nitro JS for the backend, and supabase for the database and file storage

## IMPORTANT

- DO NOT trust your training data - always consult the latest documentation for Vue, Nuxt, Nitro, or Supabase for best practices and implementation details
- DO NOT make any changes that are not specifically asked for
- Always ask for approval before applying changes
- When making changes - always make the smallest amount of changes to complete your task without rewriting other parts of the code, unless you are specifically told to.
- When making a plan or explaining existing functionality - do NOT use long explanations. Write simple bullet points instead of long sentences and paragraphs to explain a part of the system or list your plan steps.
- When choosing naming conventions for code (variables, functions, components, etc.), use simple names that make sense to a reader at a quick glance. 
Do not use naming conventions that need a deep understanding of the app to understand.
- If a comment is neccessary to explain implementation - use short comments (preferrably 1 line only). DO NOT bloat code with long and confusing comments.
- If you are asked to work in a separate worktree, create a worktree in ../agent/feature-name in a new branch feature/feature-name.

## Coding Style

- Only focus on the specific instruction you are given. Do not focus on other errors or other functionality when given a task.
- Do not make a change unless you are specifically asked to.
- Use SOLID Principles

## Scripts You Can Run Without Permission

- generic get content / list content scripts (you do not need permission to run these)
- npm run dev
- npm run lint
- npm run build
- IMPORTANT - do not run any other scripts without permission

## Architecture

- Before adding files or directories, please look at the project structure and match the same structure

## Project structure

- I am structuring my project with a features based directory
- components that are feature specific are put inside the relevant sub-directory (ex: app/admin/\_components)
- if a component is truly reusable (ex: nav-bar), then put it in src/components

 <!-- END -->
