# Repository operating instructions

This repository is the user's **WTI터미널** (WTI Research Terminal).

Read and follow [`.agents/skills/wti-terminal/SKILL.md`](.agents/skills/wti-terminal/SKILL.md) whenever working on:
- confirmed NYMEX WTI settlement updates,
- WTI daily/weekly report price synchronization,
- `data/wti-settlement.csv` changes,
- chart/indicator/backtest maintenance explicitly requested by the user.

The site is a **static GitHub Pages app**. Normal daily settlement updates only modify `data/wti-settlement.csv`; the application recalculates chart indicators and scores in the browser. Preserve the existing UI and calculation methodology unless requested to alter them. Never fabricate missing settlements, interpolate holidays, switch futures contracts without checking, or claim deploy success without checking workflow results.

On WTI daily or weekly report tasks that verify a **new confirmed close** and have connected GitHub write access, update the CSV in the same task, then verify deployment. If permission or confirmed pricing is absent, report the blocker explicitly. There is no implied background scheduler.
