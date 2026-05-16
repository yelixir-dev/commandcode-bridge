# CommandCode Bridge Implementation Plan

> **For Hermes:** Use TDD, then perform three independent code reviews before declaring release readiness.

**Goal:** Build a production-quality OpenAI-compatible API bridge for CommandCode DeepSeek V4 Pro.

**Architecture:** Fastify HTTP server → typed OpenAI request validation → CommandCode request conversion → `/alpha/generate` streaming upstream → OpenAI response conversion.

**Tech Stack:** Node.js 20+, TypeScript strict mode, Fastify, Zod, Vitest, Docker/systemd deployment assets.

---

## Task 1: Project Foundation

**Objective:** Create a clean Node/TypeScript package with strict build, lint, and test commands.

**Files:** `package.json`, `tsconfig.json`, `eslint.config.js`, `.prettierrc.json`, `.gitignore`, `.env.example`.

**Verification:** `npm install` succeeds; tests initially fail because source implementation is absent.

## Task 2: RED Tests

**Objective:** Specify behavior before implementation.

**Files:** `tests/*.test.ts`.

**Expected RED:** Imports fail or functions are missing.

## Task 3: Core Types and Config

**Objective:** Add typed OpenAI/CommandCode shapes, model aliases, env parsing, and safe auth loading.

**Files:** `src/types.ts`, `src/config.ts`, `src/auth.ts`.

**Verification:** Auth and model tests pass.

## Task 4: Conversion Layer

**Objective:** Convert OpenAI messages/tools/request options into CommandCode body and CommandCode events into OpenAI responses.

**Files:** `src/converter.ts`, `src/openai.ts`.

**Verification:** Converter and OpenAI-format tests pass.

## Task 5: Upstream Client

**Objective:** Implement robust fetch wrapper and line-based CommandCode event parser.

**Files:** `src/commandcode.ts`.

**Verification:** Stream parser tests pass; HTTP error handling test passes.

## Task 6: Fastify Server

**Objective:** Implement routes, auth guard, rate limiting, request size limits, error formatting, and streaming.

**Files:** `src/server.ts`, `src/index.ts`.

**Verification:** Server injection tests pass.

## Task 7: Documentation and Release Assets

**Objective:** Prepare GitHub/GitLab-ready docs and deployment files.

**Files:** `README.md`, `README.ko.md`, `docs/*`, `release/*`, `Dockerfile`, `docker-compose.yml`, CI configs.

**Verification:** `npm run verify`; manual smoke instructions documented.

## Task 8: Triple Review Gate

**Objective:** Run three independent reviews and fix blockers.

**Reviewers:** Hermes delegate reviewer, Kimi CLI reviewer, CommandCode CLI reviewer.

**Verification:** All blocking findings resolved or documented as accepted risk.
