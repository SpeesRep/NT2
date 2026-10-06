# Teacher manual: how the curriculum works

The curriculum decides which **new** cards the student gets. It never stops old cards: cards the student has
started always come back for review.

## The Curriculum tab

- Each row is one topic (a tag).
- Each topic has its own rule. The row above does not decide.
- The order (1, 2, 3 …) only decides which open topic gives new cards first.
- Within a topic, the oldest cards (column `added`) come first.
- The student gets at most `new_per_day` new cards per day (Settings tab). The student can choose another number on
  the phone (Instellingen).

## The four rules (column `regel`)

1. **altijd**: the topic is open from the start.
2. **datum**: the topic opens on a date. Write the date in `datum`. It opens at midnight.
3. **bekend**: the topic opens when enough cards of other topics are "bekend".
   - `van_tags`: the topics to wait for, for example `klok-1` or `klok-1, app`.
   - These topics must stand higher in the list.
   - `percentage`: how many cards must be bekend, for example 80.
   - Every topic in `van_tags` must reach the percentage.
4. **dicht**: the topic is closed for now.
   - The other columns stay as they are. Switch back later and they work again.
   - This is the way to park a topic with its settings.

## When is a card "bekend"?

- The student remembers it for at least `known_stability_days` days (Settings, 7).
- And the student has reviewed it at least `known_min_reviews` times (Settings, 2).
- A topic without cards counts as 100 % bekend.

## Open stays open

- Once a topic is open, it stays open, even if the student forgets cards later.
- Only `dicht` closes it again. After `dicht`, the rule starts from zero.

## Topics without a row

- A tag without a row never opens.
- Cards without a tag never come as new cards.

## Mistakes in a row

- Example: `bekend` without `van_tags`, or `datum` without a date.
- Such a row stays closed. The other rows still work.
- A topic that was already open stays open.
- The Dashboard shows the mistake next to the row. The student sees nothing.

## Approval

- The student only gets cards with `controle` = goedgekeurd.
- A card in the Inbox is not in Cards yet. The student never sees it.

## Where to check

- Dashboard tab, columns D–I: per topic, the rule, open or not, the cards that are bekend, and mistakes.
- The Dashboard does not know which topics the phone has already opened.

## The student chooses a topic

- On the phone: "Kies een onderwerp".
- Topics that are `dicht`, or have no row, are not in the list.
- Topics that will open later show 🔒.
- The student then gets due cards and new cards only from the chosen topics.
