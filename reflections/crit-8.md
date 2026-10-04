# Crit 8 reflection

## What was the breakthrough that moved the work forward?

This week I had a much bigger idea for the project than what I actually needed for the first crit. I had already planned out different guinea pig personalities, multiple areas of the sanctuary, cooperative building mechanics, and rules for how the agent should develop the project. The moment that actually moved things forward was when I stopped trying to build towards the whole design at once and focused on what was needed to prove that the core idea worked.

One decision that made this clearer was choosing the second persistent interaction. I considered letting visitors leave named notes, which would have been relatively simple to implement. However, it started to feel like a guestbook or activity feed, which went against my README's idea of letting people leave traces in the world without turning the sanctuary into a social platform. I chose planting a flower instead. It is a small interaction, but it changes the shared environment itself and can remain for future visitors.

Before that, I was thinking about the README mainly as an explanation of the project. After making this decision, I started thinking about it as something that should actually constrain what I build.

## What did this change about who I want to be as a software developer?

Working with an agent also made me think differently about what my role is as a developer. An agent can produce a working implementation very quickly, which makes it tempting to judge progress by how much code or how many features have been produced. However, I still need to understand why those features exist, check whether they fit the project, and be able to explain the decisions behind them.

Writing `CLAUDE.md` made this especially noticeable. Instead of only telling the agent what feature to implement next, I was defining rules that future implementations should follow. That felt closer to designing the boundaries of the system than simply requesting code.

Going forward, I want to be more deliberate about giving an agent constraints before asking it to implement something, and to treat rejecting or simplifying an agent's suggestion as part of the development process. I would rather have a smaller system where I can account for the decisions than a larger one that works but no longer reflects what I intended to build.
