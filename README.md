# Guinea Pig Sanctuary

Guinea Pig Sanctuary is a small real-time world shared by visitors and a persistent group of guinea pigs. People can explore the sanctuary, interact through simple gestures, spend time with the guinea pigs, and gradually change the environment together. When they leave, those changes remain for whoever comes next.

## What does good mean here?

I want the sanctuary to be good at creating **small moments of connection between strangers without demanding conversation, competition or commitment**. Another person should not just be another avatar on the screen. Their presence should change what is possible.

Two visitors might help pull a carrot from the ground. Several people might finish building a shelter and watch a guinea pig move into it. A group sitting quietly near a burrow might encourage a shy guinea pig to emerge. These are small events, but they become interesting because other people are there.

I looked at *Sky: Children of the Light* because it makes encounters with strangers meaningful without immediately relying on normal text chat. Players initially communicate through movement and expressions, with further forms of communication developing through interaction. I like the idea that waving, pointing, sitting beside someone or helping them can be enough to acknowledge another person. I want to explore that idea on a much smaller scale.

I also read Parimal Satyal's *Rediscovering the Small Web*, which describes the appeal of the creative, personal and independent websites that still exist outside the dominant platforms of the modern web. That made me interested in designing for a deliberately small audience rather than treating scale as a goal. Guinea Pig Sanctuary does not need thousands of users. It is designed for a handful of people sharing one small place.

## A world that remembers

The sanctuary should also **remember the people who pass through it without giving them ownership of it**.

Visitors might plant a garden, build a tunnel, restore a bridge or contribute to a shelter. These changes persist, and the guinea pigs respond to the environment people collectively create. Someone returning later should be able to notice that other people have been there.

There are no individually owned guinea pigs, private houses, XP, leaderboards or likes. The guinea pigs belong to nobody, and so does the sanctuary. Visitors can leave a trace without needing to claim part of the world as theirs.

## What's here now

Right now there's one guinea pig, Potato. Visitors can feed her — the sanctuary remembers how many times and when, for whoever opens the page next — and plant flowers anywhere in the outdoor meadow, where they stay for good.

Just behind the meadow is Potato's house: a small, shared room where everyone who visits earns their own Care Points by feeding her, and spends them on furniture — a hay bed, a tunnel, a hideout — that goes into the house for everyone, not just the visitor who paid for it. Furniture one person places appears for every other visitor connected at the time, in real time, with no page refresh needed. Nothing is undone: once a hay bed is in the house, it's there for the next visitor too.

## What I can test

Some parts of this definition of good can become explicit checks in `spec/`:

- **Persistence:** a change presented as permanent survives reconnects and server restarts.
- **Shared state:** two visitors in the same sanctuary see the same persistent world.
- **Real-time presence:** an action by one visitor appears for another connected visitor within about one second.
- **Cooperation:** an interaction designed for multiple visitors cannot be completed by one visitor alone.
- **No ownership:** contributing to a shared structure does not give that visitor exclusive control over it.

Other parts need to be judged by people. During crits I want to watch whether visitors notice each other, whether gestures make sense without instructions, whether people naturally gather around the guinea pigs, and whether changes left by earlier visitors make the sanctuary feel inhabited.
