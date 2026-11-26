# Privacy

This covers the MCP server in this package, including the Claude Desktop extension
(`thetowersdk.mcpb`). It runs on your computer. It has no account, no analytics and no telemetry,
and nothing is sent to the authors of this package.

## What it reads

- The game export (`tool_export.json`) you point it at, or on a Mac the one in the game's own
  folder. It is read from disk when a tool asks for it and is not copied or uploaded anywhere.

## What leaves your computer

Only the wiki tools use the network. `wiki_search` and `wiki_page` send the search text or page
title to the two community wikis and download the page:

- `the-tower-idle-tower-defense.fandom.com`
- `the-tower-idle-tower-defense.game-vault.net`

Those sites see the request the way they see any visitor's, under their own privacy policies.
Nothing from your game export is included. Turn on **Offline Wiki** in the extension's settings
(`TOWER_WIKI_OFFLINE=1`) to stop these requests entirely.

The assistant you connect the server to receives the tool results, including what the tools read
from your export. What it does with them is governed by that assistant's own terms.

## What it writes

- Downloaded wiki pages, cached in your system's temporary folder.
- The notes the `record_mechanic_note` and `record_work_status` tools append, in
  `Documents/TheTowerSDK/mechanics-map` for the extension, or the **Notes Folder** you choose.

## Questions

Open an issue at <https://github.com/BeardedUnicorn/TheTowerSDK/issues>.
