# Specification: Autopilot V2 Restoration

## Overview
Restoration of the core Autopilot V2 components: Membrane (CLI), Nervous System (Signals), and Brain (Optimizer), along with integrity fixes for the `LLMService`.

## Components

### 1. Membrane (CLI HUD)
-   **File:** `src/membrane/Dashboard.tsx`
-   **Tech:** `ink`, `react`
-   **Features:**
    -   Real-time status display (Phase, Task, KPI).
    -   Input handling for user commands.
    -   Visual feedback for agent activity.

### 2. Nervous System (Coordination)
-   **Files:** `src/nervous/scanner.ts`, `src/nervous/dispatcher.ts`
-   **Features:**
    -   `SignalScanner`: Scans codebase for `@CRITICAL`, `@TODO`, `@OPTIMIZE` tags using `ripgrep`.
    -   `AgentDispatcher`: Routes signals to appropriate agents (Firefighter, Steward, Optimizer).
    -   **Stigmergy:** No central queue; the code itself is the queue.

### 3. Brain (Cognition)
-   **Files:** `src/brain/optimizer.ts`, `src/brain/types.ts`
-   **Features:**
    -   `DSPyOptimizer`: Manages prompt signatures and few-shot examples.
    -   `Trace`: Records execution paths for optimization.
    -   **Self-Improvement:** Compiles better prompts over time.

### 4. Integrity (Immune System)
-   **Files:** `src/providers/llm_service.ts`, `src/telemetry/kpi_writer.ts`
-   **Features:**
    -   `LLMService`: Abstract interface for LLM providers with "Smart Stub" fallback.
    -   `PhaseExecutionManager`: Enforces DRQC by routing all tasks through the LLM (or stub).

## Data Structures
-   `Signal`: `{ type: string, location: SourceLocation, context: string }`
-   `Trace`: `{ input: any, output: any, score: number, metadata: any }`

## Interfaces
-   `IOrchestrator`: Main loop interface.
-   `ILLMService`: `generate(prompt: string, schema?: z.ZodSchema): Promise<T>`

## Constraints
-   Must run in restricted environments (no API keys).
-   Must pass `TemplateDetector` checks (no static templates).
-   Must be strictly typed (TypeScript).
