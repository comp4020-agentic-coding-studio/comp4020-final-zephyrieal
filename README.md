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

The sanctuary has four guinea pigs: Potato, Mochi, Biscuit and Clover. Each wanders independently and can be fed nearby. Visitors can feed her — the sanctuary remembers how many times and when, for whoever opens the page next — and grow food in one public garden bed. Walk nearby and click the soil to choose hay, lettuce, bell peppers or cucumbers. Anyone can harvest a mature crop, including crops planted by another visitor.

Just behind the meadow is Potato's house: a small, shared room where everyone who visits earns their own Care Points by feeding her, and spends them on furniture — a hay bed, a tunnel, a hideout — that goes into the house for everyone, not just the visitor who paid for it. Furniture one person places appears for every other visitor connected at the time, in real time, with no page refresh needed. Nothing is undone: once a hay bed is in the house, it's there for the next visitor too.

## Walking together

Every connected browser tab now has a visitor character. Focus the game with a
click or Tab, then use **WASD or the arrow keys** to walk. The direction buttons
below the meadow also work with a mouse, touch, or keyboard. Your character is
labelled **You**; other visitors have coloured markers and short visitor labels.
The gardener character has soft, rounded artwork and turns to face all four
walking directions.

Visitors in the same meadow or house see each other's movements live. Use
**Go inside / Go back outside** to change rooms. Furniture placement keeps its
existing controls and pauses walking while a piece is selected. Potato still
wanders independently.

Presence lasts only while connected. Departing visitors disappear; reconnecting
visitors rejoin automatically. To try it locally, run `pnpm dev` and open
`http://localhost:5173` in two browser windows. Both must connect to the same
server. Crops, shared food, furniture and construction remain persistent.

## What I can test

Some parts of this definition of good can become explicit checks in `spec/`:

- **Persistence:** a change presented as permanent survives reconnects and server restarts.
- **Shared state:** two visitors in the same sanctuary see the same persistent world.
- **Real-time presence:** an action by one visitor appears for another connected visitor within about one second.
- **Cooperation:** an interaction designed for multiple visitors cannot be completed by one visitor alone.
- **No ownership:** contributing to a shared structure does not give that visitor exclusive control over it.

Other parts need to be judged by people. During crits I want to watch whether visitors notice each other, whether gestures make sense without instructions, whether people naturally gather around the guinea pigs, and whether changes left by earlier visitors make the sanctuary feel inhabited.

## Shared garden and nearby interactions

Walk up to Potato to reveal Feed (or press E), then choose a snack. Walk up to a building to reveal Build. The server checks the position of your authenticated avatar for feeding, building, planting and harvesting.

The single garden bed belongs to everyone. Click it while nearby to plant one crop across the whole bed. Hay grows in 30 seconds, lettuce and cucumbers in 45 seconds, and bell peppers in 60 seconds. Harvesting adds three portions to a public food supply. Basic hay is always available for feeding while the garden grows. Flower planting has been removed.

Feeding rewards are chosen by the server: hay earns 10 Care Points, lettuce 15, cucumbers 20 and bell peppers 25. The food menu shows each reward before feeding. All four inhabitants use the same reward rules.

## Entering completed buildings

Walk up to a completed house, toolshed, greenhouse or great hall and choose Enter (or press E). Each has its own shared interior, visitors, furniture and storage. Leave to return beside the same building. The bridge remains outdoors. The original shared shelter and its existing furniture remain available through Go inside. Interiors currently share a floor plan; their contents and visitors are independent.

## Acknowledging other visitors
Use **Wave**, **Sit** and **Help here** below the meadow. Nearby visitors in the same room see a labelled gesture above your character. Wave and help last three seconds; sitting lasts until you stand, walk, change rooms or disconnect. Gestures are temporary presence and do not spend Care Points.

## Furniture the inhabitants use
During indoor visits, guinea pigs sometimes approach a reachable hay bed to rest, a hideout to hide, or a tunnel to investigate. Their activity is shared live and labelled beside them. They leave again on their own; moving or storing the furniture interrupts its use safely. The furniture persists; these brief behaviours do not.
