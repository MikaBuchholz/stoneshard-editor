# Test fixtures

`character_1/save_1/data.sav` is a brand-new Stoneshard character (a starting Knight Maiden in Osbrook,
level 1, with only her starting gear). It carries no played progress, and the tests read it to check the
codec, the inventory model, equipment generation and the skill list against records the game itself wrote.

The folder names matter: the save's checksum is salted with `character_1` and `save_1`, so the tests can
verify signing end to end. Keep your own saves out of this folder; put those in `test/`, which git ignores.
