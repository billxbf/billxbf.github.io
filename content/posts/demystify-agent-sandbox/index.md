---
title: "Demystifying Agent Sandbox"
date: 2025-12-28
showToc: true
TocOpen: false
---

Modern AI agents are often scaffolded with a runtime sandbox. Often referred to as Computer-Use Agents (CUA), they autonomously run code, use terminal, take notes, and access Internet and MCPs -- exactly like humans do when interacting with the digital world.

The underlying reasoning and practices remain unclear to most. Let's dive into popular agent scaffolds like [Claude Code](https://www.anthropic.com/engineering/claude-code-best-practices) and [MiniMax Agent](https://agent.minimax.io/), demystifying the design principles and discovering how agents benefit from using a computer.


## Why Sandbox?
In short, **Context Delegation** and **Runtime Isolation**.

**Context Delegation.** Even with all the memory-efficient tricks in KV caching and Linear Attention architectures, long-context reasoning is still a nontrivial challenge to AI agents.
Production AI agents are usually loaded with bloated tool descriptions and system prompts to cover more case handling and example following. Context length can grow to 100k or over 1M easily in multi-turn agentic trajectories -- especially when tool responses contain extraneous data. Growing contexts dilute attention and cause huge memory burden to both training and inference.

Intuitively, you'd want to move episodic context out of the main agent loop using:
- ***Subagent***: Create subtasks to invoke another agent. This is tricky sometimes since without sharing a full context, subagents can easily duplicate work, wasting excessive tokens. Yet over-engineered orchestration introduces inductive bias. 
- ***Filesystem***: Create todo list, keep agent memory, store conditional instructions (aka [Agent Skill](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview)) that Agent chooses to load into the context when necessary. **Sandbox Filesystem is an agent's extended context through computer-use**.

**Runtime Isolation.** Sandboxing ensures all agent actions run in a tightly controlled environment, protecting the host system by isolating potential errors and de-risking real user data or resources. 
The isolation is especially critical when executing popular `<python>` and `<browser>` tools.

{{< figure src="./assets/cursor-sandbox.png" alt="Agent cursor in sandbox" align="center" width="350" caption="*Cursor (Agent mode) running commands in a secure sandbox*" >}}


## Claude Code -- More than just Code
Claude Code has gained huge traction in 2025. Although originally designed for coding assistance, Anthropic is clearly shifting its purpose toward more general agent use cases. As stated many times in [recent podcasts](https://www.youtube.com/watch?v=CEvIs9y1uog), Claude Code excels in, or can be extended to other use cases like Deep Research and vertical specialist agents.
Andrej has also been [tweeting](https://x.com/karpathy/status/2005421816110862601?s=46&t=muzAYwVgphxc-B1ajhy0EA) his mini projects like agentic home control in [physical world](https://x.com/karpathy/status/2005067301511630926?s=20).

{{< figure src="./assets/claude_skill_computer.png" alt="Claude skill" align="center" width="700" caption="*Claude Code scaffolding. The agent controls a virtual sandbox with Bash and coding. Context delegated via file system (Skills). Tools executed outside the sandbox are implemented as MCP.*" >}}

### Agentic Computer Use

What's the magic here? Metaphorically, an AI Agent equipped with a File System and Runtime Environment is equivalent to a human using a computer -- the primary, if not only interface connecting humans to the Digital World. **Imagine the action space.** ¯\_(ツ)_/¯  Bearing this idea, scaffolding an agent turns into OS design:

- Configuring a Linux Docker / VM, or, creating a completely native OS from scratch (yes, there are a few working on it).
- Designing the File System within the sandbox.
    - You'd wanna pre-install some "Apps" for the agents -- a Terminal, a Browser, a writing pad ... and place some instructions for the agent to refer to before use (Anthropic names it `SKILL.md`).
    - Meanwhile, you'd wanna give agents a "shortcut" to invoke outside endpoints -- like credential-related database querying. These fit into the bucket of traditional function-calling or MCP.

### Claude Code System Prompt

Anthropic doesn't publicly share Claude Code's system prompt and tool implementations in its [Claude Agent SDK](https://platform.claude.com/docs/en/agent-sdk/overview).
However, there's an interesting thread where people [trace and hack](https://mariozechner.at/posts/2025-08-03-cchistory/#toc_0) Claude Code's request & response, and reverse engineer the system prompt and its commit [diff](https://cchistory.mariozechner.at/) across versions. From the prompt, we can clearly find some sparks and lessons in agent tool implementations.

For example, Claude Code doesn't use an interactive browser like [browser-use](https://browser-use.com/) does by default. Instead it creates two separate `WebSearch` and `WebFetch` tools, likely due to speed & efficiency concerns.


{{< figure src="./assets/claude_tools.png" alt="Claude tools" align="center" width="700" caption="*Summary of Claude Code's tools from the hacked system prompt.*" >}}

### Claude Code Filesystem

When locally deployed, Claude Code uses `~/.claude/` for its own sandbox workspace, and your work project is mounted under `~/.claude/projects/`. 
The scaffold keeps `plugins` (MCP integrations) and `skills` in different directories, and further tracks TODO, personalization configs, and metadata like command history and debug logs.

{{< figure src="./assets/claude_code_fs.png" alt="Claude Code filesystem" align="center" width="500" caption="*Claude Code's working filesystem.*" >}}

## MiniMax Agent 

MiniMax has been my most surprising AI lab this year. It ships the #1 (as of Dec 2025) OSS model on [LMArena WebDev](https://lmarena.ai/leaderboard/webdev) at 229B weights, which is considered "small" among parallel flagship models. On the other side, the agent scaffold, [MiniMax Agent](https://agent.minimax.io/) creates surprisingly good apps and reports with prolonged reasoning and autonomous execution. Here's my favorite [trajectory replay](https://agent.minimax.io/share/296564788117720).


{{< figure src="./assets/minimax_browser.png" alt="MiniMax Browser Agent" align="center" width="500" caption="*MiniMax Agent using browser for autonomous app creation (Netflix Clone)*" >}}


Minimax Agent has a UI component that allows you to navigate the agent's sandbox filesystem in realtime. You can prompt the agent to summarize its initial filesystem state. 
This workspace is a Python-based development environment designed for AI agents with integrated external API access capabilities. There are rich modular data sources that connect to various third-party APIs including Twitter, Yahoo Finance, TripAdvisor, Pinterest, Patents, Scholar, Commodities, Metals, and Booking.com. None of these are written into the system prompt, thus leveraging the context delegation advantage in agent sandbox.

{{< figure src="./assets/minimax_fs.png" alt="MiniMax Agent filesystem" align="center" width="500" caption="*Minimax Agent's working filesystem.*" >}}


## Other Computer-use Agents

Major AI labs have all been building Computer-use Agents, yet differing in the design principles (driven by product philosophy). OpenAI seems to have made great progress on [Operator](https://openai.com/index/introducing-operator/) and [ChatGPT Atlas](https://chatgpt.com/atlas). I really enjoy the visual presentation and dynamics of the agent sandbox at runtime.

{{< figure src="./assets/oai_cua.png" alt="OpenAI Agent using Terminal" align="center" width="500" caption="*OpenAI Agent using Terminal*" >}}

Prompting Operator to describe its filesystem, you'll observe a complete Linux VM with two working directories -- `/home/oai` containing session data and `/openai` storing internal "Skills".
From ChatGPT's self manifest, the only skill installed is a Browser.

{{< figure src="./assets/oai_fs.png" alt="OpenAI Agent filesystem" align="center" width="500" caption="*OpenAI Agent filesystem*" >}}


Besides OpenAI, there are a great number of players in the space. For example, [Google AI Studio (Build)](https://aistudio.google.com/u/1/apps) is able to build and test apps from ideas with advanced multimodal capabilities from Gemini. [Manus](https://manus.im/) orchestrates a huge number of subagents and services like [browser-use](https://browser-use.com/) to max out agent action space. 
I'll leave the rest of the exploration to readers due to limited time.



## Agentic RL

*Agent*, *Action (tools)* and *Environment (scaffold)* are 3 tightly bound concepts in the traditional literature. **Consistency between training (rollout) Gym and inference scaffold is critical to maintain agent performance.** However, this consistency has become a luxury since model providers won't expose training infra, usually resulting in tedious engineering efforts guessing the "right" scaffolding and orchestrations among downstream agent builders.  

Although most LLMs are trained with vanilla sandbox scaffolds to support evaluation like [Terminal-Bench](https://www.vals.ai/benchmarks/terminal-bench), a language model doesn't natively "know" how to use your sandbox -- especially when you want to customize the tools and "Skills". In this case, RL becomes an effective data-efficient method for your last mile. 

### Rollout Infra
A key challenge in Agentic RL is to build stable and efficient rollout infra. The additional factor of sandbox and tools like browser impose difficulty in asynchronous runtime efficiency, state management, and security. These rollouts are usually **magnitudes** more expensive (time and effort) than non-agentic RL like Math CoT. A nice starting point is [OpenHands V1](https://arxiv.org/pdf/2511.03690v1) released lately. The architecture of decoupled modules (abstraction, tools, sandbox, and server) provides solid coordination with reusable modules across scaffolding and rollout serving. Besides, [Pytorch OpenEnv](https://github.com/meta-pytorch/OpenEnv) provides a nice Gymnasium-style endpoint over commonly used agent docker environments.


{{< figure src="./assets/openhandsv1.png" alt="OpenHands V1 architecture" align="center" width="500" caption="*OpenHands V1 with decoupled modules reusable across rollout and scaffolding.*" >}}

### Reward Design and Training Recipe

Another challenge in Agentic RL is to define the reward function. Computer-use agents are usually used for open-ended tasks like research and app building. Such tasks usually lack **unbiased** and **verifiable** scoring mechanisms as in *Math* and *Coding*. Meanwhile, vanilla use of LLM-As-Judge to generate rewards can easily trap the policy into **adversarial distribution** from the teacher (Reward Hacking). This is also confirmed in Andrej's recent [interview](https://x.com/dwarkesh_sp/status/1979234976777539987?s=20) "RL is terrible". An interesting approach to mitigate reward hacking in open-ended research is brought by AI2 [DR Tulu](https://allenai.org/blog/dr-tulu), where rubrics are buffered and generated on the fly together with policy. The algorithm setups used for Agentic RL generally follow the lessons from long-context RL in LLMs, such as [broadening exploration](https://arxiv.org/pdf/2510.01180) in [prolonged](https://arxiv.org/pdf/2505.24864) steps. 

{{< figure src="./assets/dr_tulu.png" alt="DR Tulu RLER" align="center" width="500" caption="*Reinforcement Learning with Evolving Rubrics (RLER)*" >}}

## Conclusion

This post showcases the state of Computer-use Agents -- from product to design principles. It elaborates the reasoning and importance of runtime sandbox in AI Agents and briefly introduces the engineering and training challenges. **2026 will be the year of Computer-use Agents -- with focus shifting from ~~Prompt Engineering~~ to Sandbox Engineering and RL on custom scaffolds** ;)

---


### Citation
```
Xu, Binfeng. "Demystifying Agent Sandboxes". B'Log (Dec 2025). https://billxbf.github.io/posts/demystify-agent-sandbox/
```