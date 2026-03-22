# ALIVE Mind

## Commitment

This repository performs cognition for ALIVE.

It is responsible for:
- interpreting signals
- reasoning and simulation
- forming decisions
- managing working and long-term memory (future phases)

All outputs are descriptive and advisory.

It does not:
- execute actions
- access external systems directly
- enforce policy
- bypass runtime governance

Cognition exists only when allowed by runtime.

## Architecture Spine

Constitution defines → Runtime governs → Mind thinks → Body acts → Interface displays

## Purpose
Cognitive layer responsible for reasoning, memory, simulation, and decision formation.

## Responsibilities
- UC (Unconscious): filtering, pattern detection, background processing
- STM: working memory and active reasoning
- LTM: durable memory and compressed knowledge
- Decision formation
- Simulation and planning
- Learning and calibration

## Memory Model
- Experience Stream (read-only input)
- Thought (transient)
- Derived Memory (compressed, durable)

## Rules
- Outputs are descriptive only
- Does NOT execute actions
- Does NOT call tools or devices

## Permitted Implementations
- Symbolic
- Hybrid symbolic + vector
- Model-assisted symbolic

Must comply with: Constitution → Runtime governance → Memory contracts

## Non-Scope
- No execution
- No direct sensor/actuator access
- No policy enforcement

## Drift Warning
⚠️ If this layer executes actions, architecture integrity is broken.
