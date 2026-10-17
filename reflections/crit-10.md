# Crit 10 reflection

## What was the breakthrough that moved the work forward?

I assumed the project was basically done for crit 10 — identity from crit 8
and server-side permission checks (Care Points, furniture rules, construction
rate limiting) from crit 9 were already built and tested. What I'd missed was
that "the app tells people apart" and "logs who did what" are different
requirements. Every server-side check already knew which visitor it was
acting on; the server just never said so anywhere. It printed exactly one
line, ever, at startup.

The breakthrough was seeing that gap precisely, instead of trusting that a
well-architected app must already be observable. The fix was mechanical, not
a new system: one `logAction` helper, one JSON line per call, wired into every
mutating route and both WebSocket connect/disconnect events. Denials get
logged with their reason too, since "one visitor couldn't change what should
be someone else's" is exactly the moment the crit's narration needs. I
verified this on the live Fly deployment, not just locally — feeding Potato
through the deployed URL produced an attributable line in `flyctl logs`,
which is what "the logging outlives the crit" has to mean in practice.

## What did this work change about who I want to be as a software developer?

This taught me to be skeptical of "looks finished." A passing test suite and
solid architecture don't automatically produce observability — I had to read
the spec literally against the code rather than trusting my sense that the
project was in good shape.

It also sharpened how I scope work with an agent. Logging could have grown
into a viewer or a query API; the spec only wanted something a person reads
from a terminal during a live crit, so I kept it to one helper and existing
call sites. I want to keep treating "is the mechanism there" and "can someone
account for it" as separate questions, especially when it's tempting to let a
clean build stand in for the second one.
