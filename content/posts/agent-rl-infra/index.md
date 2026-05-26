---
title: "Rethinking RL Infra for Agents"
date: 2026-05-26
tags: ["agent", "rl", "infra", "polar"]
author: "Binfeng Xu"
showToc: true
TocOpen: false
summary: "Why the agentic shift breaks classical RL infra, a tour of Forge, ROLL, SkyRL and Slime, and my recent take with Polar (Agentic RL on Any Harness at Scale)."
---

A year ago, RL for LLMs was almost entirely about reasoning -- math, code, short single-turn problems with a clean verifier. The whole loop fit on one picture: model generates a response, environment scores it, optimizer updates the weights. Research focus were algorithmic (GRPO, DAPO, GSPO, Dr.GRPO); while infra was mostly an afterthought.

Agentic RL breaks that picture. [ROLL](https://arxiv.org/pdf/2512.24873v3) puts it well in their report: *RLVR trains models that "can answer"; agentic RL trains models that "can act."* The model no longer produces a single response -- it lives inside a harness, calls tools, reads observations, spawns sub-agents, interacts with agent swarms, manages its own context, and finishes (or doesn't) between minutes to days.

That shift is no longer an algorithm problem. It's a systems problem. **In agentic RL, rollout typically eats 80-90% of wall time**, and the bottleneck moves from "how do I update the policy" to "how do I keep GPUs busy while a long, flaky, multi-turn trajectory finishes." This post walks through the paradigm shift, tours four recent frameworks pushing on it (Forge, ROLL, SkyRL, Slime), and ends with our own take, **Polar**.


## What Actually Changed?

A useful starting point is the objective [Forge](https://www.minimax.io/news/forge-scalable-agent-rl-framework-and-algorithm) states up front:

```
max J(θ) = Throughput(A) × Sample-Efficiency(A)
```

Throughput is the raw tokens-per-second the system pushes through rollout, training, and I/O. Sample efficiency is how much each trajectory teaches the model -- a function of data freshness, off-policyness, and noise. Every design choice in agentic RL infra is a trade-off between the two. Push throughput too hard and you go off-policy. Stay strictly on-policy and one long tail blocks the whole farm.

A few concrete things change once you accept this objective:

1. **Rollouts dominate the wall clock.** Generating tokens is the smaller part of a rollout. The bigger parts are tool execution, sandbox boot, file I/O, sub-agent retries, and context management between turns. Two tasks that look identical can differ by 10-100× in completion time.

2. **Long tails are normal, not pathological.** Some episodes finish in seconds. Some get stuck in retry loops or run into a slow tool and stretch to hours. Strict-sync FIFO turns one straggler into a global stall.

3. **Async is no longer optional**, but raw greedy async breaks training. You have to actively manage staleness, distribution drift, and stability.

4. **Reward becomes sparse, gameable, and hard to verify.** No clean "math answer correct" signal. An outcome-only `0/1` reward on a coding agent is essentially noise for the first few thousand steps. Add naïve shaping and the model finds a way to hack it.

5. **The agent harness is increasingly a black box.** The harnesses most worth training against -- Claude Code, Codex, Qwen Code, Gemini CLI -- are closed binaries you can't open and rewrite into `env.step()`.

6. **Token-In-Token-Out (TITO) drift is real.** Decode-then-re-encode round-trips through text quietly diverge from the original token IDs (interstitial whitespace, special tokens, tokenizer edge cases). If the trainer optimizes a token sequence that isn't the one the rollout policy actually sampled, your gradient is wrong.

All of these point the same direction: **the training loop and the agent loop have to live in different processes, talk through a stable interface, and never assume the other side is a known quantity.**


## A Tour of Agent RL Frameworks

Let's walk through four of the most representative frameworks evidenced in public -- Forge (Minimax), ROLL (Alibaba), SkyRL-Agent (NovaSky AI / Berkeley), and Slime (Zhipu) -- attacking the similar problem from different angles. Each is worth understanding on its own terms.

### Forge: Treat the Agent as a Trajectory Producer

Though a private framework, Forge's tech report showcases its move to redefine what an agent *is* to the training system. It's not a class inside the RL framework that gets `step()`-ed on. It's an independent **Trajectory Producer** running on the outside; the RL system just consumes whatever messages and rewards come back.

The architecture has three layers: an **Agent** (white-box or black-box, producing trajectories), a **Middleware** layer (a Gateway Server for standardized LLM traffic and a Data Pool collecting completions and rewards asynchronously), and **Engines** (the rollout engine and train engine, syncing weights periodically).

{{< figure src="./assets/forge_arch.png" alt="Forge architecture" align="center" width="600" caption="*Forge's three-layer decoupling — Agent / Middleware / Engines.*" >}}

Pure FIFO blocks on the head of the queue; pure greedy async lets the trainer over-consume short, fast samples and drift the distribution. Forge introduces a sliding window `[H, H+W]` -- inside the window, whoever finishes first gets consumed; outside, you wait. It's not really a scheduler, it's a *sample distribution regulator*.

Forge also takes the dense-reward problem seriously. A real coding session can span thousands of trajectory turns; an outcome-only `0/1` produces no learnable gradient for ages. Forge composes process rewards (penalize broken tool calls, dense intermediate signal), task-completion-time rewards (encourage shorter execution paths), and the final outcome. In practice, **every reward component needs a cap**. We've seen runs where a single uncapped shaping term silently swallows the outcome signal -- the model just learns to maximize the proxy. A reasonable default we landed on: outcome dominates, intermediate checkpoints contribute `+0.1` each, process total capped at `0.5`.


### ROLL: Treat the Whole Pipeline as an Async Distributed System

ROLL goes all-in on async. Its central claim, in CLI-Native Mode, is that the training framework **should not reimplement the agent at all** -- it should consume whatever an existing agent runtime (e.g. iFlow CLI) produces.

ROLL breaks one RL iteration -- rollout, env interaction, reward, loss, update -- into stages that run on independently scheduled workers. Trajectories flow into a sample buffer; the trainer pulls batches and applies an **asynchronous ratio** to cap how stale a sample can be relative to the current policy. Out-of-budget samples get dropped.

{{< figure src="./assets/roll_arch.png" alt="ROLL architecture" align="center" width="650" caption="*ROLL Agentic Learning Ecosystem — Train / Sandbox / CLI separation, async with sample buffer.*" >}}


A second move, **train-rollout multiplexing**, dynamically reassigns GPUs across the boundary. If rollout becomes the bottleneck, GPUs slide from training to rollout; once the sample buffer fills up, they slide back. Static 50/50 splits leave one side idle.

The third, **Chunked MDP + IPA** (Interaction-Perceptive Agentic Policy Optimization), is more algorithmic but lands in the infra. ROLL argues that token-level optimization is too fine (most tokens don't change environment state) and sequence-level is too coarse (mixes many decisions into one credit). They cut the trajectory into **interaction chunks** -- the contiguous tokens between two environment interactions -- and propagate return, importance ratio, and mismatch masking at chunk granularity.

{{< figure src="./assets/roll_arch2.png" alt="ROLL architecture" align="center" width="650" caption="*ROLL architecture -- Async pipelines and Train-Rollout Multiplexing.*" >}}

ROLL also treats environment cleanliness as part of *reward correctness*, not engineering hygiene. In one of their early synthetic harnesses, false-positive rate hit **~40%**: a task asked for a full `git push` to a webserver, but the test script only checked whether some URL returned `"hello world"`, so the agent learned to `echo` it directly into the doc root and call the task done. ROLL responded with three checks at task admission -- an LLM-as-judge sanity pass, a ground-truth pass (golden solution must pass the test), and a no-op pass (doing nothing should *not* pass the test). If your verifier isn't reliable, the policy will optimize against the verifier's holes, not the task.


### SkyRL: Pipeline the Stages, Unify Through Tools

[SkyRL-Agent](https://arxiv.org/pdf/2511.16108) attacks the same throughput-vs-stability tension from a different angle: rather than redefining the agent boundary or going fully async, it focuses on **fine-grained pipeline scheduling across heterogeneous rollout stages**, paired with a tool-centric unified agent loop that keeps every framework concern reachable through one abstraction.

The starting observation is that a multi-turn rollout is not one job. It's at least three: **runtime initialization** (cold-starting a sandbox or container -- CPU-bound and slow), **agent run** (the LLM-and-tool loop itself -- mixed CPU/GPU), and **reward calculation** (run tests, score outputs -- often CPU-bound and long-tailed). Naive async batching launches them all at once and waits on the slowest; bounded batching caps concurrency but still serializes the stages within each trajectory. Both leave the GPU idle for stretches.

SkyRL's **Async Pipeline** dispatcher overlaps these three stages across trajectories through three bounded queues of configurable size. While trajectory `i` is in its CPU-bound reward stage, trajectory `j` can already be running its LLM forward pass on the same GPU. The reported numbers: **1.55× speedup over naive bounded async batching** and ~90% sustained GPU utilization during generation -- exactly the "kill the CPU/GPU bubbles" win anyone who has profiled long-horizon rollouts will recognize.

{{< figure src="./assets/skyrl_arch.png" alt="SkyRL architecture" align="center" width="650" caption="*SkyRL-Agent's three-stage decomposition (INIT / RUN / REWARD) and Async Pipeline dispatching.*" >}}

Two more design choices worth flagging:

- **Tool-centric unified agent loop.** Every agent action -- stateless calls (python interpreter), environment-modifying calls (file editor), and even agent-state-modifying operations like summarization or history truncation -- is registered through the same `BaseTool` interface. This puts context management *inside* the action space rather than as an out-of-band hack, the same insight Forge reaches independently. It also means a new task is just a few tool registrations, with the main agent loop untouched.

- **Transition-based trajectory representation.** SkyRL replaces conventional mask-based loss construction with a `(o_t, a_t, r_t)` transition tuple captured by a lightweight `@record_transitions` decorator. Each LLM invocation gets recorded with its input tokens, output tokens, and log probabilities; `post_process` then aggregates them into a backend-agnostic format consumable by SkyRL-train, VeRL, or Tinker. The benefit is twofold -- it sidesteps the brittleness of mask-based concatenation when context gets compacted between turns (the "one continuous text sequence" assumption breaks the moment you summarize), and it gives **token-level fidelity for free**: the inference engine's actual sampled IDs and logprobs are what the trainer optimizes, not a re-tokenized transcript.

SkyRL also lands a recipe-level lesson worth absorbing. When they trained SA-SWE-32B (Qwen3-32B → 39.4% on SWE-Bench Verified, with >2× cost reduction over comparable baselines), they noted that **better tools matter more than more steps**. A bash-only setup spent most of its rollout budget thrashing through `grep` and `view`; replacing it with an AST-aware code search tool dramatically improved both rollout pass@K and sample efficiency. Reward shaping fixes credit assignment; tool design fixes the action distribution itself. The two are not interchangeable.


### Slime: Fully Async, Just Control the Drift

[Slime](https://github.com/THUDM/slime) takes the most radical position: *don't try to be sync, don't even pretend.* Inference engines stream trajectories continuously, the training engine refreshes weights on its own beat, and rollout weights periodically resync to whatever training is on.

The interesting question becomes: when a single trajectory can span multiple policy versions, how do you contain the off-policy error?

Slime's answer is engineering-flavored: don't try to reconstruct the exact `π_old` per token (which would require tracking every historical checkpoint). Instead, log the **log-probability at sampling time** as the behavior signal, then compute importance ratios against the current policy at training time. It's an approximation, but it's the *right* approximation for an async setting.

On top of that:

- **Direct double-sided importance clipping** `[1 - ε_l, 1 + ε_h]`. Tokens with ratio outside the window get masked entirely rather than scaled -- a stricter version of DAPO's Clip-Higher (e.g. raise the upper clip from `0.2 → 0.28` to give low-probability exploratory tokens more room).
- **Sample-level staleness threshold** on top of token-level clipping. If a response was generated by a policy too many versions behind the trainer, drop it. Local drift gets handled by clipping; global staleness gets handled by sample drop.
- **Prefill-Decode Disaggregation.** Long prefills and short decodes shouldn't share the same cluster -- in multi-turn agent traffic, prefills pile up and starve the decode side. Slime separates them physically, and trajectory completion time stabilizes.
- **TITO Gateway** records the actual token IDs sampled by the inference backend rather than re-tokenizing the text after the fact. Combined with FP8 rollout inference, this single decision removes a whole category of silent gradient corruption.

{{< figure src="./assets/slime_arch.png" alt="Slime architecture" align="center" width="600" caption="*Slime's architecuture overview*" >}}


### Conclusion: Common Patterns Worth Taking

A handful of things cut across all four, and has been reinforced over my experiments:

- **Do not mask or drop thinking tokens** -- that's where the model's value actually lives. Mask tool observations including tool error, or the fitted model can repeat errors.
- **Token-level loss aggregation (DAPO-style) is more stable than sequence-level** on long running trajectories.
- **GRPO has a length bias** -- longer responses get implicitly up-weighted by mean/std normalization. Dr.GRPO drops the length term and recovers an unbiased baseline.
- **Sandbox container pooling matters more than you think.** Reducing CPU bound runtime preparation steps can usually give 3~5x speedup in our setups.
- **Red-team the reward before launch.** Prerun separate experiments encouraging reward hacking based on your reward function to surface possible hacking patterns. During training, sample rollouts over time and run an LLM-as-judge for hack-pattern detection. It catches things the reward curve hides.


## Polar: When the Harness is a Black Box

Introducing my recent work, [Polar](https://arxiv.org/pdf/2605.24220). The frameworks above all assume some level of control over the agent -- the Trajectory Producer in Forge, the CLI runtime in ROLL. But many of the most interesting harnesses to train against today are closed binaries: Claude Code, Codex, Qwen Code, Gemini CLI. You can't wrap them in predefined Python API. You can't even necessarily intercept their internal event loop.

**Polar** (our recent work) starts from this constraint: *can we train agents with RL without opening the box?*

The observation is simple. **Every LLM-based agent, no matter how complex its internals, has to talk to a model.** The model API endpoint is a universal interface that exists *outside* the harness. So instead of integrating into the harness, Polar places a **provider-compatible proxy** at the LLM API boundary. The harness runs unchanged, makes its normal Anthropic / OpenAI / Google-shaped calls, and the proxy quietly records prompts, sampled token IDs, log probabilities, and responses on the way through.

{{< figure src="./assets/polar_arch.png" alt="Polar architecture" align="center" width="700" caption="*Polar — proxy at the LLM API boundary, rollout server + gateway nodes with INIT / RUN / POSTRUN worker pools.*" >}}

After execution, Polar reconstructs trainer-ready trajectories from the captured completions. Two builders are provided. `per_request` keeps each model call as one trace -- lossless but fragments a long session into many short samples. `prefix_merging` recovers append-only conversation chains and emits longer, contiguous traces; sub-agents, parallel branches, and context compactions naturally fall into separate chains. Within each merged chain, only sampled assistant tokens are copied as trainable, while canonical interstitial tokens are masked -- behavior-policy fidelity preserved, trainer-facing samples cut down.

On the infra side, Polar separates rollout submission, runtime initialization, harness execution, trajectory reconstruction, and evaluation into independent worker pools (`INIT`, `RUNNING`, `POSTRUN`) per gateway node. Runtime prewarm and long-tail evaluation run off the GPU-critical path, so CPU-heavy container boot doesn't block the next agent run. Trainers consume the resulting trajectories asynchronously, completely agnostic to whatever harness produced them.

{{< figure src="./assets/polar_curve.png" alt="Polar curves" align="center" width="700" caption="*Qwen3.5-4B reward over RL steps, rollout on different harnesses*" >}}

We validated this on SWE-Bench Verified, starting from the same Qwen3.5-4B base checkpoint and running standard GRPO over four real coding harnesses:

| Harness     | Base   | Polar RL | Gain  |
|-------------|--------|----------|-------|
| Codex       | 3.8%   | 26.4%    | +22.6 |
| Claude Code | 29.8%  | 34.6%    | +4.8  |
| Qwen Code   | 34.6%  | 35.2%    | +0.6  |
| Pi          | 34.2%  | 40.4%    | +6.2  |

The biggest gain is on Codex -- a harness whose tool schema is far from the base model's native priors, so RL has the most adaptation room. `prefix_merging` over `per_request` also delivered a **5.39× wall-clock speedup** on the trainer side, since fewer fragmented updates means rollout GPUs stay above 87% utilization instead of bouncing on context switches.


## What Next-Gen Agent RL Infra Looks Like

Pulling everything together, the design space for the next generation seems to converge on a few principles:

1. **The integration boundary is the model API, not `env.step()`.** Any infra that requires the harness to be ported into a Python class will lose to one that listens at the LLM endpoint, because the harnesses worth training against are increasingly closed.

2. **Async by default, with staleness made explicit.** Pick your tools -- async ratio, importance clipping, sample drop, version-tagged buffers -- but pick *something*. Hidden staleness is hidden bias.

3. **Process rewards / PRMs become first-class.** Pure outcome reward on long trajectories is too sparse to learn from and too easy to hack. Dense intermediate signal (capped!) is the difference between a run that converges and a run that doesn't.

4. **Environment cleanliness is part of reward correctness.** False positives, leaked test files, cached artifacts -- the agent will find them all. Reward is only as trustworthy as the environment it runs in.

5. **KV cache and speculative decoding across shared resources.** Global KV pools, group-aware spec decoding, and PD disaggregation move from rollout micro-optimizations to first-class infra primitives.

6. **Token fidelity end-to-end.** The trainer must optimize the tokens that the rollout policy actually sampled. Anything that round-trips through text decode/encode will silently corrupt the gradient.

The clean separation we're starting to see -- harness on the outside, model API as the seam, rollout-as-a-service in the middle, training engine just consuming what comes back -- feels like the right factoring. As we approach the data wall of imitation learning, **optimizing Agentic RL infra is the new scaling law towards real world intelligence.**

---

### Citation
```
Xu, Binfeng. "Rethinking RL Infra for Agents". B'Log (May 2026). https://billxbf.github.io/posts/agent-rl-infra/
```
