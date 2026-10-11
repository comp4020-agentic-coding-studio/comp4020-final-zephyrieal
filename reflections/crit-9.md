# Crit 9 reflection

## What was the breakthrough that moved the work forward?

The breakthrough this week was realising that real-time multiplayer should be
more than simply showing changes across different browsers. I wanted visitors
to have a meaningful way to contribute to the sanctuary together. This led me
to develop the idea of shared guinea pig houses, where visitors earn
individual Care Points through interacting with guinea pigs and spend them on
furniture that everyone can see and use.

I also decided to use a tilemap-based system for furniture placement. Instead
of allowing objects to be placed freely, furniture snaps to a grid and can
only be placed where there is enough space. This introduced an important
multiplayer design decision: what happens when two visitors try to place
furniture in the same location? I chose server-side validation, where the
first valid placement succeeds and the other is rejected without losing
points. This helped me think about real-time interaction as a problem of
maintaining a consistent shared world, rather than just synchronising visual
changes.

## What did this work change about who I want to be as a software developer?

This week changed how I think about designing systems before implementing
them. Working with an AI agent makes it easy to introduce new features
quickly, but I realised that adding more functionality does not necessarily
make the experience better. I need to consider how each feature fits the
overall purpose of the project and how different parts of the system
interact.

I also learned the importance of defining clear constraints for the agent.
Decisions such as using individual points but shared furniture, preventing
overlapping objects, and keeping the server responsible for validating
changes are not just implementation details. They shape how visitors
experience the game.

Going forward, I want to become a developer who focuses more on making
deliberate design decisions, understanding their trade-offs, and directing AI
agents with clear requirements, rather than simply accepting whatever they
generate.
