# Multi-user testing report (Crit 11)

The session checked visitor identification, shared updates, late joins, returning visitors, multi-machine behaviour and recovery after a server restart. The results below distinguish recorded observations from scenarios without an outcome.

| Scenario                                      | Expected behaviour                                           | Observed result                                              |
| --------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------ |
| Two visitors join                             | Both connections appear in the logs with machine and visitor identifiers. The visitor count increases to two. | Observed as expected.                                        |
| Shared actions propagate                      | Furniture changes appear for other relevant visitors, and shared construction progress updates. | Observed as expected.                                        |
| Conflicting simultaneous actions              | Only one of two conflicting actions succeeds.                | Observed as expected.                                        |
| A visitor joins late                          | The connection is logged, and the visitor receives the current shared state. | Observed as expected.                                        |
| A visitor leaves and returns                  | The server recognises the returning visitor and displays the current progress. | Observed as expected.                                        |
| Visitors join isolated rooms                  | Not applicable.                                              | Not tested.                                                  |
| Visitors connect to different server machines | Visitors may receive different saved state.                  | Different saved state was observed.                          |
| Server machine restarts mid-session           | Updates temporarily stall, then resume when the server returns. | Observed as expected. Actions attempted during the interruption is processed after the server has restarted. |

## Findings and limitations

The session provided evidence that visitor identification, shared furniture and construction updates, late-join state and returning-visitor recognition worked in the tested scenarios.

The multi-machine scenario exposed inconsistent saved state between machines. The tested configuration therefore did not provide one consistent shared world across multiple server machines.

These observations also do not establish whether visitors understood the interactions or experienced a sense of social connection.