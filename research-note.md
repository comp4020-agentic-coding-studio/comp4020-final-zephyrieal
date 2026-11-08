# Engineered Checks the Agent Does Not Own

<center> Judy Xie </center>

Good agentic software development depends on external checks that the agent writing the code cannot modify, skip, or weaken. Instructions help the agent understand what to build. Checks provide evidence that it built the right thing, but only for the requirements they actually test. As code generation becomes cheaper and smarter, manually checking large amounts of code becomes increasingly harder for humans. Better instructions can reduce agent mistakes, but not necessarily verify that the produced software meets the requirements. Hence, checks must test the right requirements, expose important failures, and resist being weakened to fit the implementation.

## Why coding speed does not establish good practice

METR (2025) found that experienced open-source developers took 19% longer with AI while believing they had worked faster. The same experiment conducted in early 2026 estimated an 18% reduction in completion time for returning developers, but its uncertainty interval included no effect. The authors warned that the estimate was unreliable, partly because developers’ reluctance to work without AI affected who participated and which tasks entered the study (METR, 2026).

These studies do not establish whether agents make developers faster. They show why teams should measure the time it takes to produce a change they are willing to ship, including checking and rework. Lopopolo (2026) reports that human quality assurance became a bottleneck as one OpenAI team generated code faster. That case shows how faster generation can move the bottleneck to verification, without establishing that this happens everywhere.

## Context guides -- it does not verify

Gloaguen et al. (2026) compared coding agents working with and without repository context files. The files did not consistently improve task success and raised inference costs by more than 20%. Agents generally followed the instructions, so the result cannot simply be explained by them ignoring the files. The study measured success using tests on Python repository tasks. It does not tell us whether context files help agents preserve design decisions over time.

Lopopolo (2026) gives a practical example of where guidance falls short: his team found a large `AGENTS.md` difficult to keep up to date and moved some documented rules into linters and structural tests. This illustrates Böckeler’s (2026) distinction between guides, which steer the agent, and sensors, which give feedback on the result. A guide can tell an agent which modules may depend on one another; a check can detect a forbidden dependency. Neither establishes that the architecture is appropriate for the problem. And if the agent can remove the rule when the check fails, a passing result no longer matters.

## What about checks?

Hora and Robbes (2026) found that 36% of agent-authored test commits added mocks, compared with 26% of other test commits. More mocks do not prove worse tests, but they invite scrutiny of which real interactions are exercised. Chen et a. (2026) likewise found that prompting agents to write more or fewer tests did not significantly change task resolution on SWE-bench Verified. Test volume is a poor substitute for evidence that the tests catch consequential failures.

Anthropic (2026) reports that agents praised their own mediocre work, and even worse -- a separate evaluator agent initially found real bugs and approved the work anyway. Passing tests is still not acceptance: maintainers would reject about half of SWE-bench-passing patches (METR, 2026).

## Unread code can still be accountable engineering

StrongDM’s software factory explicitly bans human code review and evaluates behavior through scenarios stored outside the codebase and simulated external services. OpenAI’s internal project made human pull-request review optional and shifted almost all review to agents. Lopopolo (2026) reports roughly a million lines across application code, tests, documentation, and tooling. These accounts show that teams can ship without routinely reading the implementation. They leave open how well the practice holds up as software changes. StrongDM’s scenarios make rewriting local tests insufficient, but a scenario can omit important behavior and a simulated service can diverge from production.

## Where the field is heading

As agentic coding continue to evolve, review will move from diffs to acceptance criteria, and changes to criteria will be gated like changes to production. Teams can accept agent-written code without reading every line when they have good evidence that it meets the requirements. Agents can write tests and propose exceptions, but the checks used to accept a change must run, and changes to what counts as a pass need separate approval.  Developers therefore need to understand the software well enough to explain what the checks establish, recognize what they miss, and revise them as requirements change. 

# References

Anthropic (2026). *Harness design for long-running application development*. [online] AnthropicAI. Available at: https://www.anthropic.com/research/harness-design-long-running-apps [Accessed 9 Nov. 2026].

Birgitta Böckeler (2026). *Harness engineering for coding agent users*. [online] martinfowler.com. Available at: https://martinfowler.com/articles/harness-engineering.html [Accessed 9 Nov. 2026].

Gloaguen, T., Mündler, N., Müller, M., Raychev, V. and Vechev, M. (2026). *Evaluating AGENTS.Md: Are repository-level context files helpful for coding agents?* [online] arXiv.org. Available at: https://arxiv.org/abs/2602.11988 [Accessed 9 Nov. 2026].

Hora, A. and Robbes, R. (2026). *Are coding agents generating over-mocked tests? An empirical study*. [online] arXiv.org. Available at: https://arxiv.org/abs/2602.00409 [Accessed 8 Nov. 2026].

Lopopolo, R. (2026). *Harness engineering: Leveraging codex in an agent-first world*. [online] OpenAI. Available at: https://openai.com/index/harness-engineering/ [Accessed 9 Nov. 2026].

METR (2025). *Measuring the impact of Early-2025 AI on experienced open-source developer productivity*. [online] METR Blog. Available at: https://metr.org/blog/2025-07-10-early-2025-ai-experienced-os-dev-study/ [Accessed 3 Nov. 2026].

METR (2026a). *Many SWE-bench-Passing PRs would not be merged into main*. [online] METR Blog. Available at: https://metr.org/notes/2026-03-10-many-swe-bench-passing-prs-would-not-be-merged-into-main/ [Accessed 9 Nov. 2026].

METR (2026b). *We are changing our developer productivity experiment design*. [online] METR Blog. Available at: https://metr.org/blog/2026-02-24-uplift-update/ [Accessed 9 Nov. 2026].

Zhi, C., Sun, Z., Shi, Y., Chao, P., Gu, X., Lo, D. and Jiang, L. (2026). *Rethinking the value of agent-generated tests for LLM-Based software engineering agents*. arXiv. Available at: https://arxiv.org/abs/2602.07900v2 [Accessed 9 Nov. 2026].